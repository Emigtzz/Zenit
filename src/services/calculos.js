'use strict';
const { ErrorApp } = require('../utils/errores');

// FUNCIONES PURAS: no tocan base de datos ni reloj. Mismas entradas -> misma salida.
// Por eso son fáciles de probar y es donde está el dinero.

function calcularImporte(precioUnitario, cantidad) {
  return precioUnitario * cantidad;
}

function calcularSubtotal(lineas) {
  return lineas.reduce((suma, l) => suma + calcularImporte(l.precio_unitario, l.cantidad), 0);
}

// Descuento = porcentaje del subtotal, redondeado UNA sola vez, a la mitad hacia arriba.
// Aritmética entera: (subtotal * pct + 50) / 100 evita flotantes.
function calcularDescuentoMayoreo(subtotal, porcentaje) {
  return Math.floor((subtotal * porcentaje + 50) / 100);
}

function calcularTotales(lineas, { mayoreo = false, porcentajeMayoreo = 5 } = {}) {
  const subtotal = calcularSubtotal(lineas);
  const descuento = mayoreo ? calcularDescuentoMayoreo(subtotal, porcentajeMayoreo) : 0;
  return { subtotal, descuento_mayoreo: descuento, total: subtotal - descuento };
}

// Recibe lo que el cliente entrega por método y devuelve lo APLICADO a la venta + el cambio.
// Reglas:
//  - Tarjeta/transferencia se cobran exactos: no pueden pasarse del total (no se da cambio de tarjeta).
//  - El efectivo cubre lo que falte; si entregó de más, la diferencia es el cambio.
//  - Los pagos aplicados siempre suman exactamente el total.
function resolverPagos(total, pagos) {
  const porMetodo = { efectivo: 0, tarjeta: 0, transferencia: 0 };
  for (const p of pagos) porMetodo[p.metodo] += p.monto;

  const noEfectivo = porMetodo.tarjeta + porMetodo.transferencia;
  if (noEfectivo > total) {
    throw new ErrorApp('Tarjeta y transferencia no pueden exceder el total de la venta', {
      codigo: 'PAGO_EXCEDE_TOTAL',
    });
  }
  const efectivoNecesario = total - noEfectivo;
  if (porMetodo.efectivo < efectivoNecesario) {
    throw new ErrorApp('El pago no cubre el total de la venta', {
      codigo: 'PAGO_INSUFICIENTE',
      detalles: { faltan: efectivoNecesario - porMetodo.efectivo },
    });
  }
  const cambio = porMetodo.efectivo - efectivoNecesario;

  const aplicados = [];
  if (efectivoNecesario > 0) aplicados.push({ metodo: 'efectivo', monto: efectivoNecesario });
  if (porMetodo.tarjeta > 0) aplicados.push({ metodo: 'tarjeta', monto: porMetodo.tarjeta });
  if (porMetodo.transferencia > 0) aplicados.push({ metodo: 'transferencia', monto: porMetodo.transferencia });
  return { pagos: aplicados, cambio, efectivo_recibido: porMetodo.efectivo };
}

module.exports = { calcularImporte, calcularSubtotal, calcularDescuentoMayoreo, calcularTotales, resolverPagos };
