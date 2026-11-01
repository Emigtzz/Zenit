'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const estadisticasService = require('../src/services/estadisticasService');
const corteService = require('../src/services/corteService');
const inventarioService = require('../src/services/inventarioService');
const { crearBaseDePrueba } = require('./helpers');

const MX = 'America/Mexico_City';

// Inserta una venta con fecha EXACTA (UTC) y sus pagos/líneas, sin pasar por ventaService (que usa "ahora").
function venta(db, { fecha, lineas, pagos, descuento = 0, estado = 'completada' }) {
  const subtotal = lineas.reduce((s, l) => s + l.cantidad * l.precio, 0);
  const total = subtotal - descuento;
  const id = db.prepare(`INSERT INTO ventas (fecha, subtotal, descuento_mayoreo, total, cambio, estado, sincronizada) VALUES (?, ?, ?, ?, 0, ?, 0)`)
    .run(fecha, subtotal, descuento, total, estado).lastInsertRowid;
  for (const l of lineas) db.prepare('INSERT INTO venta_detalle (venta_id, producto_id, cantidad, precio_unitario, importe) VALUES (?, ?, ?, ?, ?)').run(id, l.producto_id, l.cantidad, l.precio, l.cantidad * l.precio);
  for (const p of pagos) db.prepare('INSERT INTO pagos (venta_id, metodo, monto) VALUES (?, ?, ?)').run(id, p.metodo, p.monto);
  return id;
}
const L = (producto_id, cantidad, precio) => ({ producto_id, cantidad, precio });

function escenario() {
  const db = crearBaseDePrueba({ cajaAbierta: false });
  const svc = estadisticasService(db, { zona: MX, corte: corteService(db), inventario: inventarioService(db) });
  // HOY = 2026-11-02 en México (de 06:00Z del 2 a 06:00Z del 3)
  venta(db, { fecha: '2026-11-02T15:30:00Z', lineas: [L(1, 2, 1850)], pagos: [{ metodo: 'efectivo', monto: 3700 }] });                            // 09:30
  venta(db, { fecha: '2026-11-02T15:45:00Z', lineas: [L(2, 1, 1200)], pagos: [{ metodo: 'tarjeta', monto: 1200 }] });                              // 09:45
  venta(db, { fecha: '2026-11-03T05:59:00Z', lineas: [L(3, 2, 2500)], descuento: 250, pagos: [{ metodo: 'efectivo', monto: 3000 }, { metodo: 'transferencia', monto: 1750 }] }); // 23:59: sigue siendo HOY
  venta(db, { fecha: '2026-11-03T06:00:00Z', lineas: [L(1, 1, 1850)], pagos: [{ metodo: 'efectivo', monto: 1850 }] });                            // 00:00 del 3: es MAÑANA
  venta(db, { fecha: '2026-11-02T10:00:00Z', lineas: [L(1, 9, 1850)], pagos: [{ metodo: 'efectivo', monto: 16650 }], estado: 'cancelada' });         // cancelada: no cuenta
  venta(db, { fecha: '2026-11-02T05:59:00Z', lineas: [L(2, 1, 1200)], pagos: [{ metodo: 'efectivo', monto: 1200 }] });                              // 23:59 del 1: es AYER
  // AYER 2026-11-01, SEMANA PASADA 2026-10-26, y uno más dentro de la ventana de 7 días
  venta(db, { fecha: '2026-11-01T20:00:00Z', lineas: [L(1, 1, 1850)], pagos: [{ metodo: 'efectivo', monto: 1850 }] });
  venta(db, { fecha: '2026-10-26T18:00:00Z', lineas: [L(2, 1, 1200)], pagos: [{ metodo: 'tarjeta', monto: 1200 }] });
  venta(db, { fecha: '2026-10-30T18:00:00Z', lineas: [L(2, 5, 1200)], pagos: [{ metodo: 'efectivo', monto: 6000 }] });
  return { db, svc };
}

test('el día se corta en la medianoche DE LA TIENDA: 23:59 cuenta hoy, 00:00 ya es mañana; canceladas fuera', () => {
  const { svc } = escenario();
  const r = svc.estadoDueno('2026-11-02').resumen;
  assert.equal(r.num_ventas, 3);
  assert.equal(r.total, 3700 + 1200 + 4750);
  assert.equal(r.subtotal, 3700 + 1200 + 5000);
  assert.equal(r.descuentos, 250);
  assert.equal(r.ticket_promedio, Math.round((3700 + 1200 + 4750) / 3));
  assert.equal(r.piezas, 2 + 1 + 2);
});

test('por método usa lo APLICADO (mixto repartido), con los tres métodos siempre presentes', () => {
  const { svc } = escenario();
  assert.deepEqual(svc.estadoDueno('2026-11-02').resumen.por_metodo, { efectivo: 3700 + 3000, tarjeta: 1200, transferencia: 1750 });
  assert.deepEqual(svc.estadoDueno('2026-11-05').resumen.por_metodo, { efectivo: 0, tarjeta: 0, transferencia: 0 });
});

test('por hora: 24 casilleros con la hora LOCAL (09, 09 y 23)', () => {
  const { svc } = escenario();
  const h = svc.estadoDueno('2026-11-02').resumen.por_hora;
  assert.equal(h.length, 24);
  assert.deepEqual([h[9].num_ventas, h[9].total], [2, 4900]);
  assert.deepEqual([h[23].num_ventas, h[23].total], [1, 4750]);
  assert.equal(h.filter((x) => x.num_ventas > 0).length, 2);
  assert.equal(h.reduce((s, x) => s + x.total, 0), svc.estadoDueno('2026-11-02').resumen.total);
});

test('día sin ventas: ceros, ticket promedio 0 (sin dividir entre cero)', () => {
  const { svc } = escenario();
  const r = svc.estadoDueno('2026-12-25').resumen;
  assert.deepEqual([r.num_ventas, r.total, r.ticket_promedio, r.piezas], [0, 0, 0, 0]);
});

test('comparativo: ayer y el mismo día de la semana pasada', () => {
  const { svc } = escenario();
  const c = svc.estadoDueno('2026-11-02').comparativo;
  assert.deepEqual(c.ayer, { dia: '2026-11-01', num_ventas: 2, total: 1200 + 1850 });   // incluye la de 23:59 del día 1
  assert.deepEqual(c.semana_pasada, { dia: '2026-10-26', num_ventas: 1, total: 1200 });
});

test('serie de 30 días: siempre 30 casilleros consecutivos, con ceros', () => {
  const { svc } = escenario();
  const s = svc.estadoDueno('2026-11-02').serie;
  assert.equal(s.length, 30);
  assert.equal(s[0].dia, '2026-10-04');
  assert.equal(s[29].dia, '2026-11-02');
  assert.deepEqual(s[29], { dia: '2026-11-02', num_ventas: 3, total: 9650 });
  assert.deepEqual(s.find((x) => x.dia === '2026-10-30'), { dia: '2026-10-30', num_ventas: 1, total: 6000 });
  assert.equal(s.find((x) => x.dia === '2026-10-10').total, 0);
  assert.equal(s.some((x) => x.dia === '2026-11-03'), false); // la de 00:00 del 3 no entra
});

test('top productos: ventana de 7 días (27/oct a 2/nov), canceladas fuera, orden estable', () => {
  const { svc } = escenario();
  const t = svc.estadoDueno('2026-11-02').top;
  assert.deepEqual([t.desde, t.hasta], ['2026-10-27', '2026-11-02']);
  // producto 1 (Refresco): 2 hoy + 1 ayer = 3 pzas · producto 2 (Galletas): 1 hoy + 1 (23:59 del 1) + 5 (30/oct) = 7 · producto 3 (hielo): 2
  assert.deepEqual(t.por_piezas.map((p) => [p.producto_id, p.piezas]), [[2, 7], [1, 3], [3, 2]]);
  assert.deepEqual(t.por_importe.map((p) => [p.producto_id, p.importe]), [[2, 8400], [3, 5000], [1, 5550]].sort((a, b) => b[1] - a[1]));
  assert.equal(t.por_piezas[0].nombre, 'Galletas');
});

test('top: el empate se resuelve por producto_id (estable, igual en SQL)', () => {
  const db = crearBaseDePrueba({ cajaAbierta: false });
  const svc = estadisticasService(db, { zona: MX, corte: corteService(db), inventario: inventarioService(db) });
  venta(db, { fecha: '2026-11-02T16:00:00Z', lineas: [L(3, 2, 100), L(1, 2, 100), L(2, 2, 100)], pagos: [{ metodo: 'efectivo', monto: 600 }] });
  assert.deepEqual(svc.estadoDueno('2026-11-02').top.por_piezas.map((p) => p.producto_id), [1, 2, 3]);
});

test('fecha inválida -> 400; "hoy" respeta la zona de la tienda', () => {
  const { svc } = escenario();
  assert.throws(() => svc.estadoDueno('2026-02-30'), (e) => e.status === 400);
  assert.throws(() => svc.estadoDueno('ayer'), (e) => e.status === 400);
  assert.match(svc.hoy(), /^\d{4}-\d{2}-\d{2}$/);
});

test('estadoNegocio: caja cerrada/abierta con su desglose, último corte y stock bajo', () => {
  const db = crearBaseDePrueba({ cajaAbierta: false });
  db.prepare("INSERT INTO usuarios (nombre, rol, contrasena_hash) VALUES ('Ana','dueño','x')").run();
  const corte = corteService(db); const inventario = inventarioService(db);
  const svc = estadisticasService(db, { zona: MX, corte, inventario });
  assert.deepEqual(svc.estadoNegocio().caja, { abierta: false });
  assert.equal(svc.estadoNegocio().ultimo_corte, null);
  corte.abrir({ fondo_inicial: 50000 }, 1);
  const e = svc.estadoNegocio();
  assert.equal(e.caja.abierta, true);
  assert.equal(e.caja.fondo_inicial, 50000);
  assert.equal(e.caja.usuario_apertura, 'Ana');
  corte.cerrar({ efectivo_contado: 49000 }, 1);
  assert.equal(svc.estadoNegocio().ultimo_corte.diferencia, -1000);
  db.prepare('UPDATE productos SET stock = 1, stock_minimo = 5 WHERE id = 1').run();
  const sb = svc.estadoNegocio().stock_bajo;
  assert.equal(sb.total, 1);
  assert.deepEqual(sb.productos[0], { nombre: 'Refresco 600ml', stock: 1, stock_minimo: 5, nivel: 'bajo', faltante: 4 });
});
