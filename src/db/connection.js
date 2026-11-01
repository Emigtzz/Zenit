'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

function abrirBase(ruta) {
  if (ruta !== ':memory:') fs.mkdirSync(path.dirname(ruta), { recursive: true });
  const db = new Database(ruta);
  // WAL: lecturas y escrituras no se bloquean entre sí y es más resistente a cortes de luz.
  db.pragma('journal_mode = WAL');
  // SQLite NO hace cumplir las llaves foráneas a menos que se lo pidas en cada conexión.
  db.pragma('foreign_keys = ON');
  return db;
}

module.exports = { abrirBase };
