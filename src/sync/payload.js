'use strict';
// Arma el LOTE que la caja sube a la nube, con la forma que espera la función SQL `sincronizar` (supabase/schema.sql).

const LIMITE_VENTAS = 200;
const LIMITE_CORTES = 50;

function construirLote(db, { limiteVentas = LIMITE_VENTAS } = {}) {
  const ventas = db.prepare(`SELECT v.id, v.fecha, u.nombre AS usuario_nombre, v.subtotal, v.descuento_mayoreo, v.total, v.cambio, v.estado, v.corte_id
      FROM ventas v LEFT JOIN usuarios u ON u.id = v.usuario_id WHERE v.sincronizada = 0 ORDER BY v.id LIMIT ?`).all(limiteVentas);

  const detalle = []; const pagos = [];
  if (ventas.length) {
    const ids = ventas.map((v) => v.id);
    const marcas = ids.map(() => '?').join(',');
    // `linea` y `n` son el número de orden dentro de la venta: la nube necesita una llave estable para que reintentar no duplique
    const lineasPor = new Map();
    for (const d of db.prepare(`SELECT d.venta_id, d.producto_id, p.nombre, c.nombre AS categoria, d.cantidad, d.precio_unitario, d.importe
        FROM venta_detalle d JOIN productos p ON p.id = d.producto_id LEFT JOIN categorias c ON c.id = p.categoria_id
        WHERE d.venta_id IN (${marcas}) ORDER BY d.venta_id, d.id`).all(...ids)) {
      const n = (lineasPor.get(d.venta_id) || 0) + 1; lineasPor.set(d.venta_id, n);
      detalle.push({ venta_id_local: d.venta_id, linea: n, producto_id_local: d.producto_id, producto_nombre: d.nombre, categoria: d.categoria,
        cantidad: d.cantidad, precio_unitario: d.precio_unitario, importe: d.importe });
    }
    const pagosPor = new Map();
    for (const p of db.prepare(`SELECT venta_id, metodo, monto FROM pagos WHERE venta_id IN (${marcas}) ORDER BY venta_id, id`).all(...ids)) {
      const n = (pagosPor.get(p.venta_id) || 0) + 1; pagosPor.set(p.venta_id, n);
      pagos.push({ venta_id_local: p.venta_id, n, metodo: p.metodo, monto: p.monto });
    }
  }

  // Solo se suben cortes YA CERRADOS (el que está abierto viaja resumido en el "latido")
  const cortes = db.prepare(`SELECT c.id, c.apertura, c.cierre, ua.nombre AS usuario_apertura, uc.nombre AS usuario_cierre, c.fondo_inicial, c.efectivo_esperado,
      c.efectivo_contado, c.diferencia, c.num_ventas, c.total_ventas, c.descuentos, c.ventas_efectivo, c.ventas_tarjeta, c.ventas_transferencia, c.ingresos, c.retiros, c.notas
      FROM cortes_caja c LEFT JOIN usuarios ua ON ua.id = c.usuario_apertura_id LEFT JOIN usuarios uc ON uc.id = c.usuario_cierre_id
      WHERE c.cierre IS NOT NULL AND c.sincronizada = 0 ORDER BY c.id LIMIT ?`).all(LIMITE_CORTES);

  return {
    ventas: ventas.map(({ id, corte_id, ...v }) => ({ id_local: id, corte_id_local: corte_id, ...v })),
    detalle, pagos,
    cortes: cortes.map(({ id, ...c }) => ({ id_local: id, ...c })),
    // para marcar como subido SOLO lo que no cambió mientras se subía
    _marcas: { ventas: ventas.map((v) => ({ id: v.id, estado: v.estado, total: v.total })), cortes: cortes.map((c) => c.id) },
  };
}

function contarPendientes(db) {
  return {
    ventas: db.prepare('SELECT COUNT(*) n FROM ventas WHERE sincronizada = 0').get().n,
    cortes: db.prepare('SELECT COUNT(*) n FROM cortes_caja WHERE cierre IS NOT NULL AND sincronizada = 0').get().n,
  };
}

function marcarSubido(db, marcas) {
  const v = db.prepare('UPDATE ventas SET sincronizada = 1 WHERE id = ? AND estado = ? AND total = ?');
  const c = db.prepare('UPDATE cortes_caja SET sincronizada = 1 WHERE id = ?');
  db.transaction(() => {
    for (const m of marcas.ventas) v.run(m.id, m.estado, m.total); // si cambió entretanto, NO se marca: se volverá a subir
    for (const id of marcas.cortes) c.run(id);
  })();
}

module.exports = { construirLote, contarPendientes, marcarSubido, LIMITE_VENTAS };
