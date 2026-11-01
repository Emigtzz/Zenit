'use strict';
const BASE = `SELECT c.*, p.nombre AS proveedor_nombre, u.nombre AS usuario_nombre, ua.nombre AS anulada_por_nombre
              FROM compras c LEFT JOIN proveedores p ON p.id = c.proveedor_id
              LEFT JOIN usuarios u ON u.id = c.usuario_id LEFT JOIN usuarios ua ON ua.id = c.anulada_por`;

module.exports = function compraRepository(db) {
  return {
    insertar: (c) => db.prepare(`INSERT INTO compras (proveedor_id, folio_factura, fecha, total, usuario_id, notas, pagada_de_caja, uuid_cfdi, archivo, estado)
        VALUES (@proveedor_id, @folio_factura, @fecha, @total, @usuario_id, @notas, @pagada_de_caja, @uuid_cfdi, @archivo, 'registrada')`).run(c).lastInsertRowid,
    insertarDetalle: (compraId, d) => db.prepare('INSERT INTO compra_detalle (compra_id, producto_id, cantidad, costo_unitario, costo_previo) VALUES (?, ?, ?, ?, ?)')
      .run(compraId, d.producto_id, d.cantidad, d.costo_unitario, d.costo_previo),
    obtener(id) {
      const c = db.prepare(`${BASE} WHERE c.id = ?`).get(id);
      if (!c) return undefined;
      c.detalle = db.prepare(`SELECT d.producto_id, pr.nombre, d.cantidad, d.costo_unitario, d.costo_previo, d.cantidad * d.costo_unitario AS importe
                              FROM compra_detalle d JOIN productos pr ON pr.id = d.producto_id WHERE d.compra_id = ? ORDER BY d.id`).all(id);
      return c;
    },
    uuidRegistrado: (uuid) => db.prepare("SELECT id FROM compras WHERE uuid_cfdi = ? AND estado = 'registrada'").get(uuid),
    folioRegistrado: (proveedorId, folio) =>
      db.prepare("SELECT id FROM compras WHERE proveedor_id = ? AND folio_factura = ? AND estado = 'registrada'").get(proveedorId, folio),
    marcarAnulada: (id, { iso, usuarioId, motivo }) =>
      db.prepare("UPDATE compras SET estado = 'anulada', anulada_en = ?, anulada_por = ?, motivo_anulacion = ? WHERE id = ?").run(iso, usuarioId, motivo, id),

    // COSTO VIGENTE de un producto = el de la compra registrada más reciente por FECHA (desempata el id).
    // Así capturar hoy una factura de hace un mes no pisa un costo más nuevo.
    ultimoCosto: (productoId) => db.prepare(`SELECT d.costo_unitario FROM compra_detalle d JOIN compras c ON c.id = d.compra_id
        WHERE d.producto_id = ? AND c.estado = 'registrada' ORDER BY c.fecha DESC, c.id DESC LIMIT 1`).get(productoId)?.costo_unitario ?? null,

    listar({ proveedorId, estado, desde, hasta, limite, desplazamiento }) {
      const cond = []; const p = {};
      if (proveedorId) { cond.push('c.proveedor_id = @proveedorId'); p.proveedorId = proveedorId; }
      if (estado) { cond.push('c.estado = @estado'); p.estado = estado; }
      if (desde) { cond.push('c.fecha >= @desde'); p.desde = desde; }
      if (hasta) { cond.push('c.fecha < @hasta'); p.hasta = hasta; }
      const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
      return {
        total: db.prepare(`SELECT COUNT(*) n FROM compras c ${where}`).get(p).n,
        filas: db.prepare(`${BASE} ${where} ORDER BY c.fecha DESC, c.id DESC LIMIT @limite OFFSET @desplazamiento`).all({ ...p, limite, desplazamiento }),
      };
    },
    historialProducto: (productoId, limite = 10) => db.prepare(`SELECT c.id AS compra_id, c.fecha, c.folio_factura, p.nombre AS proveedor_nombre,
        d.cantidad, d.costo_unitario FROM compra_detalle d JOIN compras c ON c.id = d.compra_id LEFT JOIN proveedores p ON p.id = c.proveedor_id
        WHERE d.producto_id = ? AND c.estado = 'registrada' ORDER BY c.fecha DESC, c.id DESC LIMIT ?`).all(productoId, limite),
  };
};
