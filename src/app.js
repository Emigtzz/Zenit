'use strict';
const path = require('node:path');
const express = require('express');
const ventaService = require('./services/ventaService');
const catalogoService = require('./services/catalogoService');
const busquedaService = require('./services/busquedaService');
const impresoraService = require('./services/impresoraService');
const productoRepository = require('./repositories/productoRepository');
const catalogoController = require('./controllers/catalogoController');
const inventarioService = require('./services/inventarioService');
const inventarioController = require('./controllers/inventarioController');
const ventaController = require('./controllers/ventaController');
const authService = require('./services/authService');
const usuarioService = require('./services/usuarioService');
const authController = require('./controllers/authController');
const authMiddlewares = require('./middlewares/auth');
const corteService = require('./services/corteService');
const cajaController = require('./controllers/cajaController');
const compraService = require('./services/compraService');
const proveedorService = require('./services/proveedorService');
const compraController = require('./controllers/compraController');
const rutas = require('./routes');
const { noEncontrada, manejarErrores } = require('./middlewares/errores');

// Fábrica: recibe db y config, así las pruebas crean una app con base en memoria.
function crearApp({ db, config, impresora }) {
  const busqueda = busquedaService(productoRepository(db));
  const catalogo = catalogoService(db, busqueda);
  const ventas = ventaService(db, { mayoreoPorcentaje: config.mayoreoPorcentaje });
  const imp = impresora || impresoraService(config);
  const auth = authService(db);
  const mw = authMiddlewares(auth);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', mw.mismoOrigen, mw.cargarSesion);
  app.use('/api', rutas({
    mw,
    cajaCtrl: cajaController(corteService(db), imp),
    compraCtrl: compraController(compraService(db, busqueda), proveedorService(db)),
    authCtrl: authController({ auth, usuarios: usuarioService(db), config, mw, vidaSesionMs: auth.VIDA_SESION_MS }),
    catalogoCtrl: catalogoController(catalogo, busqueda),
    ventaCtrl: ventaController(ventas, imp, config),
    inventarioCtrl: inventarioController(inventarioService(db), busqueda),
  }));
  app.use('/api', noEncontrada);
  app.use(express.static(path.join(config.raiz, 'public')));
  app.use(manejarErrores);
  return app;
}

module.exports = { crearApp };
