'use strict';
const { ErrorApp } = require('../utils/errores');
const { calcularTotales, calcularImporte, resolverPagos } = require('./calculos');
const ventaRepository = require('../repositories/ventaRepository');
const productoRepository = require('../repositories/productoRepository');

// Entrada (ya validada por zod en la ruta):
//   { items: [{producto_id, cantidad}], pagos: [{metodo, monto}], mayoreo: boolean }
// El cliente NUNCA manda precios ni totales: el servidor los lee de la base y los calcula.
module.exports = function ventaService(db, { mayoreoPorcentaje = 5 } = {}) {
  const ventas = ventaRepository(db);
  const productos = productoRepository(db);

  // db.transaction envuelve la función en BEGIN ... COMMIT. Si la función LANZA una excepción,
  // better-sqlite3 hace ROLLBACK automático y relanza el error: no queda nada a medias.
  const ejecutar = db.transaction((entrada, usuarioId) => {
    // 1. Unir líneas repetidas del mismo producto (defensa extra: el frontend ya las suma).
    const cantidades = new Map();
    for (const it of entrada.items) {
      cantidades.set(it.producto_id, (cantidades.get(it.producto_id) || 0) + it.cantidad);
    }

    // 2. Leer precios actuales y COPIARLOS a la línea (así un cambio de precio futuro no altera esta venta).
    const lineas = [];
    for (const [productoId, cantidad] of cantidades) {
      const prod = productos.obtener(productoId);
      if (!prod || !prod.activo) {
        throw new ErrorApp(`El producto ${productoId} no existe o está desactivado`, {
          status: 422,
          codigo: 'PRODUCTO_INVALIDO',
          detalles: { producto_id: productoId },
        });
      }
      lineas.push({
        producto_id: prod.id,
        cantidad,
        precio_unitario: prod.precio,
        importe: calcularImporte(prod.precio, cantidad),
      });
    }

    // 3. Totales y pagos (lanza si el pago no alcanza).
    const totales = calcularTotales(lineas, { mayoreo: entrada.mayoreo, porcentajeMayoreo: mayoreoPorcentaje });
    const resolucion = resolverPagos(totales.total, entrada.pagos);

    // 4. Escribir todo. Cualquier fallo desde aquí deshace TODO, incluidos los descuentos de stock.
    const fecha = new Date().toISOString();
    const ventaId = ventas.insertarVenta({ fecha, usuario_id: usuarioId, ...totales, cambio: resolucion.cambio });
    for (const l of lineas) {
      ventas.insertarDetalle(ventaId, l);
      ventas.insertarMovimiento({
        producto_id: l.producto_id,
        tipo: 'venta',
        cantidad: -l.cantidad, // salida: negativa
        referencia: `venta:${ventaId}`,
        fecha,
        usuario_id: usuarioId,
      });
      productos.ajustarStock(l.producto_id, -l.cantidad);
    }
    for (const p of resolucion.pagos) ventas.insertarPago(ventaId, p);

    return { ventaId };
  });

  return {
    crear(entrada, { usuarioId = null } = {}) {
      const { ventaId } = ejecutar(entrada, usuarioId);
      return this.obtener(ventaId);
    },
    obtener(id) {
      const venta = ventas.obtener(id);
      if (!venta) throw new ErrorApp('Venta no encontrada', { status: 404, codigo: 'VENTA_NO_ENCONTRADA' });
      // Lo que el cliente entregó en efectivo = lo aplicado + el cambio devuelto (sirve para reimprimir).
      const efectivo = venta.pagos.find((p) => p.metodo === 'efectivo');
      venta.efectivo_recibido = efectivo ? efectivo.monto + venta.cambio : 0;
      return venta;
    },
  };
};
