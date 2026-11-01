'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const corteService = require('../src/services/corteService');
const ventaService = require('../src/services/ventaService');
const { crearBaseDePrueba, contar } = require('./helpers');

// Base SIN caja abierta: cada prueba la abre con el fondo que necesita.
function entorno() {
  const db = crearBaseDePrueba({ cajaAbierta: false });
  db.prepare("INSERT INTO usuarios (nombre, rol, contrasena_hash) VALUES ('Ana','dueño','x'), ('Beto','cajero','x')").run();
  return { db, caja: corteService(db), ventas: ventaService(db) };
}
const vender = (ventas, items, pagos, usuarioId, mayoreo = false) => ventas.crear({ items, pagos, mayoreo }, { usuarioId });
const codigo = (fn) => { try { fn(); return null; } catch (e) { return e.codigo; } };

test('sin caja abierta no se puede vender', () => {
  const { ventas, db } = entorno();
  assert.equal(codigo(() => vender(ventas, [{ producto_id: 1, cantidad: 1 }], [{ metodo: 'efectivo', monto: 1850 }])), 'CAJA_CERRADA');
  assert.equal(contar(db, 'ventas'), 0);
});

test('abrir: guarda fondo y quién abrió; no se puede abrir dos veces', () => {
  const { caja } = entorno();
  const c = caja.abrir({ fondo_inicial: 50000 }, 1);
  assert.equal(c.fondo_inicial, 50000);
  assert.equal(c.usuario_apertura, 'Ana');
  assert.equal(c.cierre, null);
  assert.equal(codigo(() => caja.abrir({ fondo_inicial: 0 }, 1)), 'CAJA_YA_ABIERTA');
});

test('la base de datos impide dos cortes abiertos aunque se salten el servicio', () => {
  const { db, caja } = entorno();
  caja.abrir({ fondo_inicial: 0 }, 1);
  assert.throws(() => db.prepare('INSERT INTO cortes_caja (apertura, fondo_inicial) VALUES (?, 0)').run(new Date().toISOString()), /UNIQUE/);
});

test('la venta queda ligada al corte abierto', () => {
  const { caja, ventas, db } = entorno();
  const c = caja.abrir({ fondo_inicial: 0 }, 1);
  const v = vender(ventas, [{ producto_id: 1, cantidad: 1 }], [{ metodo: 'efectivo', monto: 1850 }], 2);
  assert.equal(db.prepare('SELECT corte_id FROM ventas WHERE id = ?').get(v.id).corte_id, c.id);
});

test('efectivo esperado = fondo + efectivo de ventas (sin el cambio) + ingresos - retiros; tarjeta y transferencia no cuentan', () => {
  const { caja, ventas } = entorno();
  caja.abrir({ fondo_inicial: 50000 }, 1);                                                     // fondo $500
  vender(ventas, [{ producto_id: 1, cantidad: 2 }], [{ metodo: 'efectivo', monto: 5000 }], 2);   // total 3700, paga 5000 -> en cajón +3700
  vender(ventas, [{ producto_id: 2, cantidad: 1 }], [{ metodo: 'tarjeta', monto: 1200 }], 2);    // no entra al cajón
  vender(ventas, [{ producto_id: 3, cantidad: 1 }], [{ metodo: 'transferencia', monto: 2500 }], 2);
  vender(ventas, [{ producto_id: 1, cantidad: 1 }], [{ metodo: 'tarjeta', monto: 1000 }, { metodo: 'efectivo', monto: 1000 }], 2); // mixto 1850: 1000 tarjeta + 850 efectivo
  caja.registrarMovimiento({ tipo: 'ingreso', monto: 2000, motivo: 'Cambio extra' }, 1);
  caja.registrarMovimiento({ tipo: 'retiro', monto: 10000, motivo: 'Pago a proveedor' }, 1);
  const r = caja.detalle(caja.abierto().id);
  assert.equal(r.num_ventas, 4);
  assert.equal(r.ventas_efectivo, 3700 + 850);
  assert.equal(r.ventas_tarjeta, 1200 + 1000);
  assert.equal(r.ventas_transferencia, 2500);
  assert.equal(r.total_ventas, 3700 + 1200 + 2500 + 1850);
  assert.equal(r.efectivo_esperado, 50000 + 4550 + 2000 - 10000);
});

test('descuento de mayoreo se refleja en el total, no en el efectivo extra', () => {
  const { caja, ventas } = entorno();
  caja.abrir({ fondo_inicial: 0 }, 1);
  vender(ventas, [{ producto_id: 3, cantidad: 2 }], [{ metodo: 'efectivo', monto: 4750 }], 2, true); // 5000 - 250
  const r = caja.detalle(caja.abierto().id);
  assert.equal(r.descuentos, 250);
  assert.equal(r.total_ventas, 4750);
  assert.equal(r.efectivo_esperado, 4750);
});

test('cerrar: faltante, sobrante y exacto; guarda la foto de totales', () => {
  for (const [contado, dif] of [[10000, 0], [9500, -500], [10300, 300]]) {
    const { caja, ventas, db } = entorno();
    caja.abrir({ fondo_inicial: 5000 }, 1);
    vender(ventas, [{ producto_id: 3, cantidad: 2 }], [{ metodo: 'efectivo', monto: 5000 }], 2); // +5000 -> esperado 10000
    const r = caja.cerrar({ efectivo_contado: contado, notas: 'prueba' }, 2);
    assert.equal(r.corte.efectivo_esperado, 10000);
    assert.equal(r.corte.efectivo_contado, contado);
    assert.equal(r.corte.diferencia, dif);
    assert.equal(r.corte.usuario_cierre, 'Beto');
    assert.equal(r.corte.num_ventas, 1);
    assert.equal(r.corte.ventas_efectivo, 5000);
    assert.ok(r.corte.cierre);
    assert.equal(caja.abierto(), null);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM cortes_caja WHERE cierre IS NULL').get().n, 0);
  }
});

test('cerrar sin caja abierta falla; tras cerrar ya no se vende y un corte nuevo empieza en cero', () => {
  const { caja, ventas } = entorno();
  assert.equal(codigo(() => caja.cerrar({ efectivo_contado: 0 }, 1)), 'CAJA_CERRADA');
  caja.abrir({ fondo_inicial: 1000 }, 1);
  vender(ventas, [{ producto_id: 1, cantidad: 1 }], [{ metodo: 'efectivo', monto: 1850 }], 2);
  const primero = caja.cerrar({ efectivo_contado: 2850 }, 1);
  assert.equal(primero.corte.diferencia, 0);
  assert.equal(codigo(() => vender(ventas, [{ producto_id: 1, cantidad: 1 }], [{ metodo: 'efectivo', monto: 1850 }], 2)), 'CAJA_CERRADA');
  const c2 = caja.abrir({ fondo_inicial: 2000 }, 2);
  const r2 = caja.detalle(c2.id);
  assert.equal(r2.num_ventas, 0);
  assert.equal(r2.efectivo_esperado, 2000);
  // el corte viejo no cambió
  assert.equal(caja.detalle(primero.corte.id).efectivo_esperado, 2850);
});

test('desglose por cajero', () => {
  const { caja, ventas } = entorno();
  caja.abrir({ fondo_inicial: 0 }, 1);
  vender(ventas, [{ producto_id: 1, cantidad: 1 }], [{ metodo: 'efectivo', monto: 1850 }], 1);   // Ana
  vender(ventas, [{ producto_id: 2, cantidad: 1 }], [{ metodo: 'tarjeta', monto: 1200 }], 2);    // Beto
  vender(ventas, [{ producto_id: 3, cantidad: 1 }], [{ metodo: 'efectivo', monto: 2500 }], 2);   // Beto
  const por = Object.fromEntries(caja.detalle(caja.abierto().id).por_cajero.map((c) => [c.nombre, c]));
  assert.deepEqual([por.Ana.num_ventas, por.Ana.total, por.Ana.efectivo], [1, 1850, 1850]);
  assert.deepEqual([por.Beto.num_ventas, por.Beto.total, por.Beto.efectivo], [2, 3700, 2500]);
});

test('retiro mayor al efectivo disponible se rechaza; sin caja abierta no hay movimientos', () => {
  const { caja } = entorno();
  assert.equal(codigo(() => caja.registrarMovimiento({ tipo: 'ingreso', monto: 100, motivo: 'x' }, 1)), 'CAJA_CERRADA');
  caja.abrir({ fondo_inicial: 5000 }, 1);
  assert.equal(codigo(() => caja.registrarMovimiento({ tipo: 'retiro', monto: 5001, motivo: 'x' }, 1)), 'RETIRO_EXCEDE_EFECTIVO');
  caja.registrarMovimiento({ tipo: 'retiro', monto: 5000, motivo: 'Todo' }, 1);
  assert.equal(caja.detalle(caja.abierto().id).efectivo_esperado, 0);
});

test('corte ciego: el cajero no ve montos de efectivo; el dueño sí', () => {
  const { caja, ventas } = entorno();
  caja.abrir({ fondo_inicial: 5000 }, 1);
  vender(ventas, [{ producto_id: 1, cantidad: 1 }], [{ metodo: 'efectivo', monto: 1850 }], 2);
  const c = caja.resumenActual('cajero');
  assert.deepEqual(Object.keys(c).sort(), ['corte', 'num_ventas']);
  assert.ok(!('fondo_inicial' in c.corte));
  const d = caja.resumenActual('dueño');
  assert.equal(d.efectivo_esperado, 6850);
});

test('ventas canceladas no cuentan en el corte', () => {
  const { caja, ventas, db } = entorno();
  caja.abrir({ fondo_inicial: 0 }, 1);
  const v = vender(ventas, [{ producto_id: 1, cantidad: 1 }], [{ metodo: 'efectivo', monto: 1850 }], 2);
  db.prepare("UPDATE ventas SET estado = 'cancelada' WHERE id = ?").run(v.id);
  assert.equal(caja.detalle(caja.abierto().id).efectivo_esperado, 0);
});

test('listar cortes: más reciente primero, con paginación', () => {
  const { caja } = entorno();
  for (let i = 0; i < 3; i++) { caja.abrir({ fondo_inicial: 0 }, 1); caja.cerrar({ efectivo_contado: 0 }, 1); }
  const l = caja.listar({ pagina: 1, por_pagina: 2 });
  assert.equal(l.total, 3);
  assert.deepEqual(l.filas.map((f) => f.id), [3, 2]);
});
