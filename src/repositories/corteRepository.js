'use strict';
const COLS = `c.*, ua.nombre AS usuario_apertura, uc.nombre AS usuario_cierre`;
const BASE = `SELECT ${COLS} FROM cortes_caja c
              LEFT JOIN usuarios ua ON ua.id = c.usuario_apertura_id
              LEFT JOIN usuarios uc ON uc.id = c.usuario_cierre_id`;

module.exports = function corteRepository(db) {
  return {
    abierto: () => db.prepare(`${BASE} WHERE c.cierre IS NULL`).get(),
    obtener: (id) => db.prepare(`${BASE} WHERE c.id = ?`).get(id),
    abrir: ({ fecha, fondo, usuarioId }) => db.prepare('INSERT INTO cortes_caja (apertura, fondo_inicial, usuario_apertura_id) VALUES (?, ?, ?)')
      .run(fecha, fondo, usuarioId).lastInsertRowid,
    cerrar: (id, c) => db.prepare(`UPDATE cortes_caja SET cierre=@cierre, usuario_cierre_id=@usuario_cierre_id, notas=@notas,
        efectivo_esperado=@efectivo_esperado, efectivo_contado=@efectivo_contado, diferencia=@diferencia,
        num_ventas=@num_ventas, total_ventas=@total_ventas, descuentos=@descuentos, ventas_efectivo=@ventas_efectivo,
        ventas_tarjeta=@ventas_tarjeta, ventas_transferencia=@ventas_transferencia, ingresos=@ingresos, retiros=@retiros
        WHERE id=@id`).run({ ...c, id }),
    listar: ({ limite, desplazamiento }) => ({
      total: db.prepare('SELECT COUNT(*) n FROM cortes_caja').get().n,
      filas: db.prepare(`${BASE} ORDER BY c.id DESC LIMIT ? OFFSET ?`).all(limite, desplazamiento),
    }),

    // ---- cálculos del turno (solo ventas COMPLETADAS) ----
    totalesVentas: (id) => db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(total),0) total, COALESCE(SUM(subtotal),0) subtotal,
        COALESCE(SUM(descuento_mayoreo),0) descuentos FROM ventas WHERE corte_id = ? AND estado = 'completada'`).get(id),
    // pagos.monto de efectivo ya es lo APLICADO a la venta (sin el cambio devuelto): es lo que de verdad quedó en el cajón.
    pagosPorMetodo: (id) => db.prepare(`SELECT p.metodo, COALESCE(SUM(p.monto),0) monto FROM pagos p
        JOIN ventas v ON v.id = p.venta_id WHERE v.corte_id = ? AND v.estado = 'completada' GROUP BY p.metodo`).all(id),
    ventasPorCajero: (id) => db.prepare(`SELECT v.usuario_id, COALESCE(u.nombre, '(sin usuario)') nombre, COUNT(*) num_ventas, SUM(v.total) total
        FROM ventas v LEFT JOIN usuarios u ON u.id = v.usuario_id WHERE v.corte_id = ? AND v.estado = 'completada'
        GROUP BY v.usuario_id ORDER BY total DESC`).all(id),
    efectivoPorCajero: (id) => db.prepare(`SELECT v.usuario_id, SUM(p.monto) efectivo FROM pagos p JOIN ventas v ON v.id = p.venta_id
        WHERE v.corte_id = ? AND v.estado = 'completada' AND p.metodo = 'efectivo' GROUP BY v.usuario_id`).all(id),

    insertarMovimiento: (m) => db.prepare('INSERT INTO movimientos_caja (corte_id, tipo, monto, motivo, fecha, usuario_id) VALUES (@corte_id, @tipo, @monto, @motivo, @fecha, @usuario_id)')
      .run(m).lastInsertRowid,
    movimientos: (id) => db.prepare(`SELECT m.id, m.tipo, m.monto, m.motivo, m.fecha, u.nombre AS usuario_nombre
        FROM movimientos_caja m LEFT JOIN usuarios u ON u.id = m.usuario_id WHERE m.corte_id = ? ORDER BY m.id`).all(id),
    sumaMovimientos: (id) => db.prepare('SELECT tipo, COALESCE(SUM(monto),0) monto FROM movimientos_caja WHERE corte_id = ? GROUP BY tipo').all(id),
  };
};
