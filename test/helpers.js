'use strict';
const { abrirBase } = require('../src/db/connection');
const { migrar } = require('../src/db/migrate');

// Base de datos en memoria, nueva y migrada para cada prueba: aisladas y rápidas.
function crearBaseDePrueba() {
  const db = abrirBase(':memory:');
  migrar(db);
  db.prepare("INSERT INTO categorias (nombre, color) VALUES ('Abarrotes', '#f59e0b')").run();
  const ins = db.prepare(`INSERT INTO productos (codigo_barras, codigo_corto, nombre, categoria_id, costo, precio, stock)
                          VALUES (?, ?, ?, 1, ?, ?, ?)`);
  ins.run('7501000000001', '101', 'Refresco 600ml', 1000, 1850, 10);
  ins.run('7501000000002', '102', 'Galletas', 500, 1200, 5);
  ins.run(null, '103', 'Bolsa de hielo', 300, 2500, 3);
  return db;
}
const stockDe = (db, id) => db.prepare('SELECT stock FROM productos WHERE id = ?').get(id).stock;
const contar = (db, tabla) => db.prepare(`SELECT COUNT(*) n FROM ${tabla}`).get().n;

module.exports = { crearBaseDePrueba, stockDe, contar };
