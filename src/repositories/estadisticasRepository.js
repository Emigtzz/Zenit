'use strict';
// Todas las consultas reciben una ventana UTC [inicio, fin): el servicio la calcula a partir de días locales de la tienda.
// Solo cuentan ventas COMPLETADAS.
module.exports = function estadisticasRepository(db) {
  return {
    totalesVentas: (ini, fin) => db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(total),0) total, COALESCE(SUM(subtotal),0) subtotal,
        COALESCE(SUM(descuento_mayoreo),0) descuentos FROM ventas WHERE estado = 'completada' AND fecha >= ? AND fecha < ?`).get(ini, fin),
    piezas: (ini, fin) => db.prepare(`SELECT COALESCE(SUM(d.cantidad),0) n FROM venta_detalle d JOIN ventas v ON v.id = d.venta_id
        WHERE v.estado = 'completada' AND v.fecha >= ? AND v.fecha < ?`).get(ini, fin).n,
    // pagos.monto de efectivo = lo APLICADO a la venta (sin el cambio devuelto)
    pagosPorMetodo: (ini, fin) => db.prepare(`SELECT p.metodo, COALESCE(SUM(p.monto),0) monto FROM pagos p JOIN ventas v ON v.id = p.venta_id
        WHERE v.estado = 'completada' AND v.fecha >= ? AND v.fecha < ? GROUP BY p.metodo`).all(ini, fin),
    // fila por venta: el servicio agrupa por día/hora LOCAL (SQLite no conoce zonas horarias)
    fechasYTotales: (ini, fin) => db.prepare("SELECT fecha, total FROM ventas WHERE estado = 'completada' AND fecha >= ? AND fecha < ?").all(ini, fin),
    topProductos: (ini, fin) => db.prepare(`SELECT d.producto_id, p.nombre, SUM(d.cantidad) piezas, SUM(d.importe) importe
        FROM venta_detalle d JOIN ventas v ON v.id = d.venta_id JOIN productos p ON p.id = d.producto_id
        WHERE v.estado = 'completada' AND v.fecha >= ? AND v.fecha < ? GROUP BY d.producto_id`).all(ini, fin),
  };
};
