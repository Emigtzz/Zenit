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
const facturaIA = require('./services/facturaIA');
const importacionService = require('./services/importacionService');
const importacionController = require('./controllers/importacionController');
const estadisticasService = require('./services/estadisticasService');
const estadisticasController = require('./controllers/estadisticasController');
const syncService = require('./sync/syncService');
const { crearNubeSupabase } = require('./sync/nubeSupabase');
const syncController = require('./controllers/syncController');
const rutas = require('./routes');
const { noEncontrada, manejarErrores } = require('./middlewares/errores');

// Fábrica: recibe db y config, así las pruebas crean una app con base en memoria.
function crearApp({ db, config, impresora, iaServicio, nube }) {
  const busqueda = busquedaService(productoRepository(db));
  const catalogo = catalogoService(db, busqueda);
  const ventas = ventaService(db, { mayoreoPorcentaje: config.mayoreoPorcentaje });
  const imp = impresora || impresoraService(config);
  const auth = authService(db);
  const mw = authMiddlewares(auth);
  const cortes = corteService(db);
  const inventario = inventarioService(db);
  const estadisticas = estadisticasService(db, { zona: config.zonaHoraria || 'America/Mexico_City', corte: cortes, inventario });
  // La nube es OPCIONAL: sin SUPABASE_URL/clave/usuario la caja funciona igual y simplemente no sube nada.
  const s = config.sync || {};
  const nubeReal = nube !== undefined ? nube : (s.habilitada ? crearNubeSupabase({ url: s.url, anonKey: s.anonKey, email: s.email, password: s.password }) : null);
  const sync = syncService(db, { nube: nubeReal, estadisticas, version: require('../package.json').version, intervaloSeg: s.intervaloSeg || 60 });
  const proveedores = proveedorService(db);
  const compras = compraService(db, busqueda);
  const importaciones = importacionService(db, {
    config: { carpetaFacturas: config.carpetaFacturas || require('node:path').join(config.raiz, 'data', 'facturas'), costoIncluyeImpuestos: config.costoIncluyeImpuestos !== false },
    ia: iaServicio || facturaIA({ apiKey: config.ia?.apiKey, modelo: config.ia?.modelo }), busqueda, compras, proveedores,
  });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', mw.mismoOrigen, mw.cargarSesion);
  app.use('/api', rutas({
    mw,
    cajaCtrl: cajaController(cortes, imp),
    syncCtrl: syncController(sync),
    estadisticasCtrl: estadisticasController(estadisticas),
    compraCtrl: compraController(compras, proveedores),
    importacionCtrl: importacionController(importaciones, { costoIncluyeImpuestos: config.costoIncluyeImpuestos !== false }),
    authCtrl: authController({ auth, usuarios: usuarioService(db), config, mw, vidaSesionMs: auth.VIDA_SESION_MS }),
    catalogoCtrl: catalogoController(catalogo, busqueda),
    ventaCtrl: ventaController(ventas, imp, config),
    inventarioCtrl: inventarioController(inventario, busqueda),
  }));
  app.use('/api', noEncontrada);
  app.use(express.static(path.join(config.raiz, 'public')));
  // Código compartido con la app del celular (gráficas): son archivos estáticos sin datos ni secretos.
  app.use('/pwa', express.static(path.join(config.raiz, 'pwa')));
  app.use(manejarErrores);
  app.locals.sync = sync; // server.js lo arranca; las pruebas no inician temporizadores
  return app;
}

module.exports = { crearApp };
