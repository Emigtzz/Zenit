'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const inventarioService = require('../src/services/inventarioService');
const ventaService = require('../src/services/ventaService');
const { crearBaseDePrueba, stockDe, contar } = require('./helpers');

// El helper crea productos con stock directo (sin kárdex): para estas pruebas lo "normalizamos" metiendo el stock por movimientos.
function baseConKardex() {
  const db = crearBaseDePrueba();
  const ins = db.prepare("INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, referencia, fecha) VALUES (?, 'ajuste', ?, 'inicial', ?)");
  for (const [id, n] of [[1, 10], [2, 5], [3, 3]]) ins.run(id, n, new Date().toISOString());
  return db;
}

test('entrada suma stock y registra el movimiento con motivo y nota', () => {
  const db = baseConKardex(); const svc = inventarioService(db);
  const r = svc.ajustar({ producto_id: 1, modo: 'entrada', cantidad: 4, motivo: 'error_captura', nota: 'faltaban 4' });
  assert.deepEqual([r.stock_anterior, r.diferencia, r.stock_nuevo], [10, 4, 14]);
  assert.equal(stockDe(db, 1), 14);
  const m = db.prepare('SELECT tipo, cantidad, motivo, nota FROM movimientos_inventario WHERE id = ?').get(r.movimiento_id);
  assert.deepEqual(m, { tipo: 'ajuste', cantidad: 4, motivo: 'error_captura', nota: 'faltaban 4' });
});

test('salida resta con signo negativo en el kárdex', () => {
  const db = baseConKardex(); const svc = inventarioService(db);
  const r = svc.ajustar({ producto_id: 2, modo: 'salida', cantidad: 2, motivo: 'merma' });
  assert.equal(r.diferencia, -2);
  assert.equal(stockDe(db, 2), 3);
});

test('salida mayor a la existencia se rechaza y no cambia nada', () => {
  const db = baseConKardex(); const svc = inventarioService(db);
  const antes = contar(db, 'movimientos_inventario');
  assert.throws(() => svc.ajustar({ producto_id: 3, modo: 'salida', cantidad: 9, motivo: 'merma' }), (e) => e.codigo === 'STOCK_INSUFICIENTE');
  assert.equal(stockDe(db, 3), 3);
  assert.equal(contar(db, 'movimientos_inventario'), antes);
});

test('conteo físico: calcula la diferencia contra el sistema (sube o baja)', () => {
  const db = baseConKardex(); const svc = inventarioService(db);
  assert.equal(svc.ajustar({ producto_id: 1, modo: 'conteo', cantidad: 7, motivo: 'conteo_fisico' }).diferencia, -3);
  assert.equal(stockDe(db, 1), 7);
  assert.equal(svc.ajustar({ producto_id: 1, modo: 'conteo', cantidad: 12, motivo: 'conteo_fisico' }).diferencia, 5);
  assert.equal(stockDe(db, 1), 12);
});

test('conteo sin diferencia no genera movimiento', () => {
  const db = baseConKardex(); const svc = inventarioService(db);
  const antes = contar(db, 'movimientos_inventario');
  assert.throws(() => svc.ajustar({ producto_id: 1, modo: 'conteo', cantidad: 10, motivo: 'conteo_fisico' }), (e) => e.codigo === 'SIN_DIFERENCIA');
  assert.equal(contar(db, 'movimientos_inventario'), antes);
});

test('conteo corrige un stock negativo (ventas sin existencia registrada)', () => {
  const db = baseConKardex();
  ventaService(db).crear({ items: [{ producto_id: 3, cantidad: 5 }], pagos: [{ metodo: 'efectivo', monto: 12500 }], mayoreo: false });
  assert.equal(stockDe(db, 3), -2);
  inventarioService(db).ajustar({ producto_id: 3, modo: 'conteo', cantidad: 0, motivo: 'conteo_fisico' });
  assert.equal(stockDe(db, 3), 0);
});

test('motivo "otro" exige una nota', () => {
  const db = baseConKardex(); const svc = inventarioService(db);
  assert.throws(() => svc.ajustar({ producto_id: 1, modo: 'entrada', cantidad: 1, motivo: 'otro' }), (e) => e.codigo === 'NOTA_REQUERIDA');
  assert.doesNotThrow(() => svc.ajustar({ producto_id: 1, modo: 'entrada', cantidad: 1, motivo: 'otro', nota: 'regalo del proveedor' }));
});

test('producto inexistente -> 404', () => {
  const db = baseConKardex();
  assert.throws(() => inventarioService(db).ajustar({ producto_id: 99, modo: 'entrada', cantidad: 1, motivo: 'merma' }), (e) => e.status === 404);
});

test('REVERSIÓN: si falla el UPDATE del stock, tampoco queda el movimiento', () => {
  const db = baseConKardex();
  db.exec("CREATE TRIGGER falla_stock BEFORE UPDATE OF stock ON productos BEGIN SELECT RAISE(ABORT, 'fallo simulado'); END;");
  const antes = contar(db, 'movimientos_inventario');
  assert.throws(() => inventarioService(db).ajustar({ producto_id: 1, modo: 'entrada', cantidad: 2, motivo: 'merma' }), /fallo simulado/);
  assert.equal(contar(db, 'movimientos_inventario'), antes);
  assert.equal(stockDe(db, 1), 10);
});

test('kárdex: saldo acumulado por producto, más reciente primero, y ventas incluidas', () => {
  const db = baseConKardex(); const svc = inventarioService(db);
  ventaService(db).crear({ items: [{ producto_id: 1, cantidad: 3 }], pagos: [{ metodo: 'efectivo', monto: 99999 }], mayoreo: false });
  svc.ajustar({ producto_id: 1, modo: 'salida', cantidad: 2, motivo: 'caducado' });
  const k = svc.kardex({ producto_id: 1 });
  assert.equal(k.total, 3);
  assert.deepEqual(k.filas.map((f) => [f.tipo, f.cantidad, f.saldo]), [['ajuste', -2, 5], ['venta', -3, 7], ['ajuste', 10, 10]]);
  assert.equal(k.filas[0].saldo, stockDe(db, 1));
});

test('kárdex: el saldo no cambia al filtrar por tipo; paginación', () => {
  const db = baseConKardex(); const svc = inventarioService(db);
  ventaService(db).crear({ items: [{ producto_id: 1, cantidad: 3 }], pagos: [{ metodo: 'efectivo', monto: 99999 }], mayoreo: false });
  const soloVentas = svc.kardex({ producto_id: 1, tipo: 'venta' });
  assert.equal(soloVentas.total, 1);
  assert.equal(soloVentas.filas[0].saldo, 7);
  const p = svc.kardex({ producto_id: 1, por_pagina: 1, pagina: 2 });
  assert.equal(p.filas.length, 1);
  assert.equal(p.total, 2);
});

test('kárdex: filtro por día (hora local)', () => {
  const db = baseConKardex(); const svc = inventarioService(db);
  const hoy = new Date(); const p = (n) => String(n).padStart(2, '0');
  const dia = `${hoy.getFullYear()}-${p(hoy.getMonth() + 1)}-${p(hoy.getDate())}`;
  assert.equal(svc.kardex({ desde: dia, hasta: dia }).total, 3);
  assert.equal(svc.kardex({ desde: '2000-01-01', hasta: '2000-01-02' }).total, 0);
});

test('verificar detecta stock que no coincide con el kárdex', () => {
  const db = baseConKardex(); const svc = inventarioService(db);
  assert.deepEqual(svc.verificar(), []);
  db.prepare('UPDATE productos SET stock = 99 WHERE id = 2').run(); // alguien se saltó el kárdex
  const r = svc.verificar();
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].id, r[0].stock, r[0].esperado], [2, 99, 5]);
});

test('stock bajo: clasifica negativo, agotado y bajo; ordena por gravedad; ignora sin mínimo y desactivados', () => {
  const db = crearBaseDePrueba();
  db.exec('DELETE FROM productos');
  const ins = db.prepare('INSERT INTO productos (nombre, categoria_id, precio, stock, stock_minimo, activo) VALUES (?, 1, 100, ?, ?, ?)');
  ins.run('Bajo cerca', 5, 6, 1);      // 5 <= 6 -> bajo
  ins.run('Bajo justo', 6, 6, 1);      // igual al mínimo -> bajo (<=)
  ins.run('Bajo grave', 1, 10, 1);     // 10% del mínimo -> bajo, antes que los otros bajos
  ins.run('Agotado', 0, 4, 1);
  ins.run('Negativo', -3, 4, 1);
  ins.run('Suficiente', 7, 6, 1);      // arriba del mínimo -> no sale
  ins.run('Sin mínimo en cero', 0, 0, 1);  // mínimo 0 = no definido -> no sale
  ins.run('Sin mínimo negativo', -1, 0, 1); // pero negativo siempre sale
  ins.run('Desactivado bajo', 0, 5, 0);    // inactivo -> no sale
  const r = inventarioService(db).stockBajo();
  assert.deepEqual(r.productos.map((p) => p.nombre), ['Negativo', 'Sin mínimo negativo', 'Agotado', 'Bajo grave', 'Bajo cerca', 'Bajo justo']);
  assert.deepEqual(r.por_nivel, { negativo: 2, agotado: 1, bajo: 3 });
  assert.equal(r.total, 6);
  assert.equal(r.productos.find((p) => p.nombre === 'Agotado').faltante, 4);
  assert.equal(r.productos.find((p) => p.nombre === 'Bajo justo').faltante, 0);
});

test('stock bajo se actualiza solo: una venta que cruza el mínimo lo hace aparecer', () => {
  const db = baseConKardex();
  db.prepare('UPDATE productos SET stock_minimo = 8 WHERE id = 1').run(); // stock 10, mínimo 8
  const svc = inventarioService(db);
  assert.equal(svc.stockBajo().total, 0);
  ventaService(db).crear({ items: [{ producto_id: 1, cantidad: 2 }], pagos: [{ metodo: 'efectivo', monto: 99999 }], mayoreo: false });
  assert.deepEqual(svc.stockBajo().productos.map((p) => [p.nombre, p.nivel, p.faltante]), [['Refresco 600ml', 'bajo', 0]]);
  svc.ajustar({ producto_id: 1, modo: 'entrada', cantidad: 20, motivo: 'error_captura' });
  assert.equal(svc.stockBajo().total, 0);
});
