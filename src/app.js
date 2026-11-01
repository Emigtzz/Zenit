'use strict';
const path = require('node:path');
const express = require('express');
const ventaService = require('./services/ventaService');
const catalogoService = require('./services/catalogoService');
const busquedaService = require('./services/busquedaService');
const impresoraService = require('./services/impresoraService');
const productoRepository = require('./repositories/productoRepository');
const catalogoController = require('./controllers/catalogoController');
const ventaController = require('./controllers/ventaController');
const rutas = require('./routes');
const { noEncontrada, manejarErrores } = require('./middlewares/errores');

// Fábrica: recibe db y config, así las pruebas crean una app con base en memoria.
function crearApp({ db, config, impresora }) {
  const busqueda = busquedaService(productoRepository(db));
  const catalogo = catalogoService(db, busqueda);
  const ventas = ventaService(db, { mayoreoPorcentaje: config.mayoreoPorcentaje });
  const imp = impresora || impresoraService(config);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', rutas({
    catalogoCtrl: catalogoController(catalogo, busqueda),
    ventaCtrl: ventaController(ventas, imp, config),
  }));
  app.use('/api', noEncontrada);
  app.use(express.static(path.join(config.raiz, 'public')));
  app.use(manejarErrores);
  return app;
}

module.exports = { crearApp };
