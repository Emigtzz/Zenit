'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const busquedaService = require('../src/services/busquedaService');
const productoRepository = require('../src/repositories/productoRepository');
const { levenshtein, normalizar } = require('../src/utils/texto');
const { crearBaseDePrueba } = require('./helpers');

function conCatalogo(nombres) {
  const db = crearBaseDePrueba();
  db.exec('DELETE FROM productos');
  const ins = db.prepare('INSERT INTO productos (nombre, categoria_id, precio) VALUES (?, 1, 100)');
  nombres.forEach((n) => ins.run(n));
  return busquedaService(productoRepository(db));
}

test('levenshtein cuenta ediciones', () => {
  assert.equal(levenshtein('galetas', 'galletas'), 1);
  assert.equal(levenshtein('casa', 'cosa'), 1);
  assert.equal(levenshtein('abc', 'xyz'), 3);
  assert.equal(levenshtein('', 'hola'), 4);
});

test('normalizar quita acentos y mayúsculas', () => {
  assert.equal(normalizar('  Jabón   LÍQUIDO!'), 'jabon liquido');
});

test('encuentra mientras se escribe (prefijo)', () => {
  const b = conCatalogo(['Refresco Cola 600ml', 'Galletas Marías', 'Jabón líquido']);
  assert.equal(b.buscar('gall')[0].nombre, 'Galletas Marías');
});

test('tolera errores de escritura', () => {
  const b = conCatalogo(['Refresco Cola 600ml', 'Galletas Marías', 'Jabón líquido']);
  assert.equal(b.buscar('galetas')[0].nombre, 'Galletas Marías');   // letra faltante
  assert.equal(b.buscar('refresko')[0].nombre, 'Refresco Cola 600ml'); // c -> k
  assert.equal(b.buscar('jabon')[0].nombre, 'Jabón líquido');         // sin acento
});

test('varias palabras: todas deben coincidir', () => {
  const b = conCatalogo(['Refresco Cola 600ml', 'Refresco Naranja 600ml', 'Agua 600ml']);
  const r = b.buscar('refresco nar');
  assert.deepEqual(r.map((p) => p.nombre), ['Refresco Naranja 600ml']);
});

test('palabras cortas no toleran errores (evita ruido)', () => {
  const b = conCatalogo(['Sal', 'Sol de verano']);
  assert.deepEqual(b.buscar('sel'), []);
});

test('consulta vacía o sin coincidencias devuelve []', () => {
  const b = conCatalogo(['Galletas']);
  assert.deepEqual(b.buscar('   '), []);
  assert.deepEqual(b.buscar('zzzzzz'), []);
});

test('productos desactivados no aparecen', () => {
  const db = crearBaseDePrueba();
  db.prepare('UPDATE productos SET activo = 0 WHERE id = 2').run();
  assert.equal(busquedaService(productoRepository(db)).buscar('galletas').length, 0);
});

test('también busca por inicio de código', () => {
  const db = crearBaseDePrueba();
  assert.equal(busquedaService(productoRepository(db)).buscar('101')[0].nombre, 'Refresco 600ml');
});
