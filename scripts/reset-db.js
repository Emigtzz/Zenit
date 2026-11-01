'use strict';
// Borra por completo la base local (y sus archivos -wal/-shm). Úsalo solo en desarrollo.
const fs = require('node:fs');
const config = require('../src/config');
for (const sufijo of ['', '-wal', '-shm']) fs.rmSync(config.dbPath + sufijo, { force: true });
console.log('Base de datos eliminada:', config.dbPath);
