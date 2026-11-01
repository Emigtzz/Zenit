'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// El módulo de gráficas es ESM (se usa en el navegador); sus funciones puras se prueban aquí.
const cargar = () => import('../pwa/lib/graficas.js');

test('pesos: centavos a dinero, con miles, negativos y sin flotantes', async () => {
  const { pesos, pesosEnteros } = await cargar();
  assert.equal(pesos(123456), '$1,234.56');
  assert.equal(pesos(5), '$0.05');
  assert.equal(pesos(0), '$0.00');
  assert.equal(pesos(-1050), '-$10.50');
  assert.equal(pesos(1999), '$19.99');
  assert.equal(pesosEnteros(123456), '$1,235');
});

test('ticksLimpios: marcas redondas (1-2-5) que cubren el máximo y empiezan en 0', async () => {
  const { ticksLimpios } = await cargar();
  assert.deepEqual(ticksLimpios(81100), [0, 50000, 100000]);                       // máx $811 -> $0, $500, $1,000
  assert.deepEqual(ticksLimpios(751800), [0, 200000, 400000, 600000, 800000]);   // máx $7,518 -> hasta $8,000
  const t = ticksLimpios(1);
  assert.equal(t[0], 0);
  assert.ok(t[t.length - 1] >= 1);
  for (const max of [100, 5555, 99999, 1234567, 98765432]) {
    const ticks = ticksLimpios(max);
    assert.ok(ticks[ticks.length - 1] >= max, `no cubre ${max}`);
    assert.ok(ticks.length >= 3 && ticks.length <= 7, `marcas: ${ticks.length}`);
  }
});

test('delta: día completo = flecha y color; día a medias = neutro y dice cuánto lleva (no finge una caída)', async () => {
  const { delta } = await cargar();
  assert.deepEqual(delta(1200, 1000, 'vs ayer'), { texto: '▲ 20% vs ayer', clase: 'sube' });
  assert.deepEqual(delta(500, 1000, 'vs ayer'), { texto: '▼ 50% vs ayer', clase: 'baja' });
  assert.equal(delta(1000, 1000, 'vs ayer').clase, '');
  assert.match(delta(0, 0, 'vs ayer').texto, /sin ventas/);
  assert.match(delta(500, 0, 'vs ayer').texto, /nuevo/);
  assert.deepEqual(delta(2125, 4629, 'ayer', true), { texto: 'lleva el 46% de lo vendido ayer', clase: '' });
  assert.equal(delta(10, 0, 'ayer', true).clase, '');
});
