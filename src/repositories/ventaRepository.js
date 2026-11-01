'use strict';
module.exports = function ventaRepository(db) {
  return {
    insertarVenta(v) {
      return db
        .prepare(`INSERT INTO ventas (fecha, usuario_id, corte_id, subtotal, descuento_mayoreo, total, cambio, estado, sincronizada)
                  VALUES (@fecha, @usuario_id, @corte_id, @subtotal, @descuento_mayoreo, @total, @cambio, 'completada', 0)`)
        .run(v).lastInsertRowid;
    },
    insertarDetalle(ventaId, l) {
      db.prepare(`INSERT INTO venta_detalle (venta_id, producto_id, cantidad, precio_unitario, importe)
                  VALUES (?, ?, ?, ?, ?)`).run(ventaId, l.producto_id, l.cantidad, l.precio_unitario, l.importe);
    },
    insertarPago(ventaId, p) {
      db.prepare('INSERT INTO pagos (venta_id, metodo, monto) VALUES (?, ?, ?)').run(ventaId, p.metodo, p.monto);
    },
    insertarMovimiento(m) {
      db.prepare(`INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, referencia, fecha, usuario_id)
                  VALUES (@producto_id, @tipo, @cantidad, @referencia, @fecha, @usuario_id)`).run(m);
    },
    obtener(id) {
      const venta = db.prepare(`SELECT v.*, u.nombre AS usuario_nombre FROM ventas v LEFT JOIN usuarios u ON u.id = v.usuario_id WHERE v.id = ?`).get(id);
      if (!venta) return undefined;
      venta.detalle = db.prepare(`SELECT d.producto_id, p.nombre, d.cantidad, d.precio_unitario, d.importe
                                  FROM venta_detalle d JOIN productos p ON p.id = d.producto_id
                                  WHERE d.venta_id = ? ORDER BY d.id`).all(id);
      venta.pagos = db.prepare('SELECT metodo, monto FROM pagos WHERE venta_id = ? ORDER BY id').all(id);
      return venta;
    },
  };
};
