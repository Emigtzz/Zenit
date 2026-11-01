'use strict';
const config = require('./config');
const { abrirBase } = require('./db/connection');
const { migrar } = require('./db/migrate');
const { crearApp } = require('./app');

const db = abrirBase(config.dbPath);
migrar(db);
const app = crearApp({ db, config });

// Escucha solo en localhost: la caja no debe ser accesible desde la red de la tienda.
const servidor = app.listen(config.puerto, '127.0.0.1', () => {
  console.log(`Zenit POS en http://localhost:${config.puerto}  |  impresora: ${config.impresora.modo}  |  ${config.negocio.nombre}`);
});

function cerrar() {
  servidor.close(() => { db.close(); process.exit(0); });
}
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
