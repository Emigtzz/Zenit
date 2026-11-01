'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ventaService = require('../src/services/ventaService');
const { crearBaseDePrueba, stockDe, contar } = require('./helpers');

test('venta en efectivo: guarda venta, detalle, pago, kárdex y descuenta stock', () => {
  const db = crearBaseDePrueba();
  const svc = ventaService(db);
  const v = svc.crear({
    items: [{ producto_id: 1, cantidad: 2 }, { producto_id: 2, cantidad: 1 }],
    pagos: [{ metodo: 'efectivo', monto: 10000 }],
    mayoreo: false,
  });
  assert.equal(v.subtotal, 1850 * 2 + 1200);
  assert.equal(v.total, 4900);
  assert.equal(v.cambio, 5100);
  assert.equal(v.estado, 'completada');
  assert.equal(v.sincronizada, 0);
  assert.equal(v.detalle.length, 2);
  assert.deepEqual(v.pagos, [{ metodo: 'efectivo', monto: 4900 }]);
  assert.equal(stockDe(db, 1), 8);
  assert.equal(stockDe(db, 2), 4);
  const movs = db.prepare('SELECT producto_id, tipo, cantidad, referencia FROM movimientos_inventario ORDER BY id').all();
  assert.deepEqual(movs, [
    { producto_id: 1, tipo: 'venta', cantidad: -2, referencia: `venta:${v.id}` },
    { producto_id: 2, tipo: 'venta', cantidad: -1, referencia: `venta:${v.id}` },
  ]);
});

test('mayoreo se guarda en descuento_mayoreo', () => {
  const db = crearBaseDePrueba();
  const v = ventaService(db).crear({
    items: [{ producto_id: 3, cantidad: 2 }], // 5000
    pagos: [{ metodo: 'tarjeta', monto: 4750 }],
    mayoreo: true,
  });
  assert.equal(v.subtotal, 5000);
  assert.equal(v.descuento_mayoreo, 250);
  assert.equal(v.total, 4750);
});

test('líneas repetidas del mismo producto se unen en una sola', () => {
  const db = crearBaseDePrueba();
  const v = ventaService(db).crear({
    items: [{ producto_id: 1, cantidad: 1 }, { producto_id: 1, cantidad: 2 }],
    pagos: [{ metodo: 'efectivo', monto: 5550 }],
    mayoreo: false,
  });
  assert.equal(v.detalle.length, 1);
  assert.equal(v.detalle[0].cantidad, 3);
  assert.equal(stockDe(db, 1), 7);
});

test('el precio se COPIA: cambiar el precio después no altera la venta pasada', () => {
  const db = crearBaseDePrueba();
  const svc = ventaService(db);
  const v = svc.crear({ items: [{ producto_id: 1, cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 1850 }], mayoreo: false });
  db.prepare('UPDATE productos SET precio = 9999 WHERE id = 1').run();
  assert.equal(svc.obtener(v.id).detalle[0].precio_unitario, 1850);
});

test('ignora precios mandados por el cliente (el servidor decide)', () => {
  const db = crearBaseDePrueba();
  const v = ventaService(db).crear({
    items: [{ producto_id: 1, cantidad: 1, precio_unitario: 1 }],
    pagos: [{ metodo: 'efectivo', monto: 1850 }],
    mayoreo: false,
  });
  assert.equal(v.total, 1850);
});

test('REVERSIÓN: producto inexistente en la 2ª línea deshace el descuento de la 1ª', () => {
  const db = crearBaseDePrueba();
  assert.throws(
    () => ventaService(db).crear({
      items: [{ producto_id: 1, cantidad: 2 }, { producto_id: 999, cantidad: 1 }],
      pagos: [{ metodo: 'efectivo', monto: 99999 }],
      mayoreo: false,
    }),
    (e) => e.codigo === 'PRODUCTO_INVALIDO',
  );
  assert.equal(stockDe(db, 1), 10);
  for (const t of ['ventas', 'venta_detalle', 'pagos', 'movimientos_inventario']) assert.equal(contar(db, t), 0, t);
});

test('REVERSIÓN: un fallo al guardar el pago (último paso) deshace venta, detalle, kárdex y stock', () => {
  const db = crearBaseDePrueba();
  // Sabotaje: hace que insertar en pagos falle, DESPUÉS de haber escrito y descontado todo lo demás.
  db.exec("CREATE TRIGGER falla_pagos BEFORE INSERT ON pagos BEGIN SELECT RAISE(ABORT, 'fallo simulado'); END;");
  assert.throws(
    () => ventaService(db).crear({
      items: [{ producto_id: 1, cantidad: 3 }, { producto_id: 2, cantidad: 2 }],
      pagos: [{ metodo: 'efectivo', monto: 99999 }],
      mayoreo: false,
    }),
    /fallo simulado/,
  );
  assert.equal(stockDe(db, 1), 10);
  assert.equal(stockDe(db, 2), 5);
  for (const t of ['ventas', 'venta_detalle', 'pagos', 'movimientos_inventario']) assert.equal(contar(db, t), 0, t);
});

test('REVERSIÓN: pago insuficiente no deja nada guardado', () => {
  const db = crearBaseDePrueba();
  assert.throws(
    () => ventaService(db).crear({ items: [{ producto_id: 1, cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }], mayoreo: false }),
    (e) => e.codigo === 'PAGO_INSUFICIENTE',
  );
  assert.equal(stockDe(db, 1), 10);
  assert.equal(contar(db, 'ventas'), 0);
});

test('producto desactivado no se puede vender', () => {
  const db = crearBaseDePrueba();
  db.prepare('UPDATE productos SET activo = 0 WHERE id = 2').run();
  assert.throws(
    () => ventaService(db).crear({ items: [{ producto_id: 2, cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 5000 }], mayoreo: false }),
    (e) => e.codigo === 'PRODUCTO_INVALIDO',
  );
});

test('vender sin existencia registrada NO bloquea la caja: el stock queda negativo y se registra', () => {
  const db = crearBaseDePrueba();
  ventaService(db).crear({ items: [{ producto_id: 3, cantidad: 5 }], pagos: [{ metodo: 'efectivo', monto: 12500 }], mayoreo: false });
  assert.equal(stockDe(db, 3), -2);
});
