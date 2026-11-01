'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../src/services/calculos');
const { pesosACentavos } = require('../src/utils/dinero');

test('importe y subtotal suman precio*cantidad en centavos', () => {
  const lineas = [
    { precio_unitario: 1250, cantidad: 2 },
    { precio_unitario: 999, cantidad: 3 },
  ];
  assert.equal(c.calcularSubtotal(lineas), 2500 + 2997);
});

test('sin flotantes: 19.99 pesos a centavos es exacto', () => {
  assert.equal(pesosACentavos(19.99), 1999);
  assert.equal(pesosACentavos(0.1) + pesosACentavos(0.2), 30);
});

test('mayoreo aplica 5% al subtotal', () => {
  const t = c.calcularTotales([{ precio_unitario: 10000, cantidad: 1 }], { mayoreo: true, porcentajeMayoreo: 5 });
  assert.deepEqual(t, { subtotal: 10000, descuento_mayoreo: 500, total: 9500 });
});

test('sin mayoreo no hay descuento', () => {
  const t = c.calcularTotales([{ precio_unitario: 10000, cantidad: 1 }]);
  assert.equal(t.descuento_mayoreo, 0);
  assert.equal(t.total, 10000);
});

test('descuento redondea a la mitad hacia arriba, una sola vez', () => {
  assert.equal(c.calcularDescuentoMayoreo(1010, 5), 51); // 50.5 -> 51
  assert.equal(c.calcularDescuentoMayoreo(1009, 5), 50); // 50.45 -> 50
  assert.equal(c.calcularDescuentoMayoreo(0, 5), 0);
  // 3 productos de $0.99: descontar sobre el total, no por línea
  assert.equal(c.calcularDescuentoMayoreo(297, 5), 15); // 14.85 -> 15
});

test('subtotal = total + descuento siempre', () => {
  for (const sub of [1, 19, 20, 99, 101, 12345, 999999]) {
    const t = c.calcularTotales([{ precio_unitario: sub, cantidad: 1 }], { mayoreo: true });
    assert.equal(t.total + t.descuento_mayoreo, t.subtotal);
  }
});

test('efectivo exacto: cambio 0', () => {
  const r = c.resolverPagos(5000, [{ metodo: 'efectivo', monto: 5000 }]);
  assert.equal(r.cambio, 0);
  assert.deepEqual(r.pagos, [{ metodo: 'efectivo', monto: 5000 }]);
});

test('efectivo con cambio: se aplica el total y se devuelve la diferencia', () => {
  const r = c.resolverPagos(4750, [{ metodo: 'efectivo', monto: 10000 }]);
  assert.equal(r.cambio, 5250);
  assert.deepEqual(r.pagos, [{ metodo: 'efectivo', monto: 4750 }]);
  assert.equal(r.efectivo_recibido, 10000);
});

test('efectivo insuficiente lanza error con lo que falta', () => {
  assert.throws(
    () => c.resolverPagos(5000, [{ metodo: 'efectivo', monto: 4000 }]),
    (e) => e.codigo === 'PAGO_INSUFICIENTE' && e.detalles.faltan === 1000,
  );
});

test('pago mixto: tarjeta fija una parte y el efectivo cubre el resto con cambio', () => {
  const r = c.resolverPagos(10000, [
    { metodo: 'tarjeta', monto: 6000 },
    { metodo: 'efectivo', monto: 5000 },
  ]);
  assert.equal(r.cambio, 1000);
  assert.equal(r.pagos.reduce((s, p) => s + p.monto, 0), 10000);
});

test('tarjeta no puede exceder el total (no hay cambio de tarjeta)', () => {
  assert.throws(
    () => c.resolverPagos(5000, [{ metodo: 'tarjeta', monto: 6000 }]),
    (e) => e.codigo === 'PAGO_EXCEDE_TOTAL',
  );
});

test('tarjeta exacta no genera pago en efectivo', () => {
  const r = c.resolverPagos(5000, [{ metodo: 'tarjeta', monto: 5000 }]);
  assert.deepEqual(r.pagos, [{ metodo: 'tarjeta', monto: 5000 }]);
  assert.equal(r.cambio, 0);
});
