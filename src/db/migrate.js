'use strict';
const fs = require('node:fs');
const path = require('node:path');

const CARPETA = path.join(__dirname, 'migrations');

// Aplica en orden los .sql que aún no se hayan corrido. Cada migración va en su propia transacción.
function migrar(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version TEXT PRIMARY KEY, aplicada_en TEXT NOT NULL)');
  const aplicadas = new Set(db.prepare('SELECT version FROM schema_version').all().map((r) => r.version));
  const archivos = fs.readdirSync(CARPETA).filter((f) => f.endsWith('.sql')).sort();
  const registrar = db.prepare('INSERT INTO schema_version (version, aplicada_en) VALUES (?, ?)');

  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) continue;
    const sql = fs.readFileSync(path.join(CARPETA, archivo), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      registrar.run(archivo, new Date().toISOString());
    })();
  }
}

module.exports = { migrar };
