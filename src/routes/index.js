'use strict';
const { Router } = require('express');
const v = require('../middlewares/validar');

// Rutas = tabla "URL -> sesión/rol -> validación -> controlador". Nada más.
// Matriz de permisos:
//   público     : /auth/estado, /auth/login, /auth/setup
//   cajero+dueño: vender, consultar catálogo (sin costos), stock bajo, su propia contraseña
//   solo dueño  : escribir catálogo, ajustes y kárdex, usuarios
module.exports = function rutas({ catalogoCtrl: c, ventaCtrl: vc, inventarioCtrl: ic, authCtrl: ac, cajaCtrl: cc, mw }) {
  const r = Router();
  const dueno = mw.requerirRol('dueño');

  // ---- públicas ----
  r.get('/auth/estado', ac.estado);
  r.post('/auth/setup', v.validar(v.setupSchema), ac.setup);
  r.post('/auth/login', v.validar(v.loginSchema), ac.login);

  // ---- todo lo demás exige sesión ----
  r.use(mw.requerirSesion);

  r.post('/auth/logout', ac.logout);
  r.get('/auth/yo', ac.yo);
  r.post('/auth/contrasena', v.validar(v.cambioContrasenaSchema), ac.cambiarContrasena);

  r.get('/usuarios', dueno, ac.listarUsuarios);
  r.post('/usuarios', dueno, v.validar(v.usuarioNuevoSchema), ac.crearUsuario);
  r.put('/usuarios/:id', dueno, v.validar(v.usuarioEditarSchema), ac.actualizarUsuario);
  r.post('/usuarios/:id/contrasena', dueno, v.validar(v.restablecerSchema), ac.restablecer);

  r.get('/config', vc.config);

  r.get('/categorias', c.listarCategorias);
  r.post('/categorias', dueno, v.validar(v.categoriaSchema), c.crearCategoria);
  r.put('/categorias/:id', dueno, v.validar(v.categoriaSchema), c.actualizarCategoria);
  r.delete('/categorias/:id', dueno, c.desactivarCategoria);

  // Las rutas fijas van ANTES que /:id para que "buscar" no se interprete como un id.
  r.get('/productos/botones-rapidos', c.botonesRapidos);
  r.get('/productos/buscar', v.validar(v.buscarSchema, 'query'), c.buscar);
  r.get('/productos/codigo/:codigo', c.porCodigo);
  r.get('/productos', v.validar(v.listaProductosSchema, 'query'), c.listarProductos);
  r.get('/productos/:id', c.obtenerProducto);
  r.post('/productos', dueno, v.validar(v.productoSchema), c.crearProducto);
  r.put('/productos/:id', dueno, v.validar(v.productoSchema), c.actualizarProducto);
  r.delete('/productos/:id', dueno, c.desactivarProducto);

  r.post('/ventas', v.validar(v.ventaSchema), vc.crear);
  r.get('/ventas/:id', vc.obtener);
  r.get('/ventas/:id/impresion', vc.estadoImpresion);
  r.post('/ventas/:id/reimprimir', vc.reimprimir);

  // Caja: cualquier usuario puede abrir, mover efectivo y cerrar (el cajero hace su corte a ciegas).
  // El historial y el detalle completo son del dueño.
  r.get('/caja/estado', cc.estado);
  r.post('/caja/abrir', v.validar(v.abrirCajaSchema), cc.abrir);
  r.get('/caja/resumen', cc.resumen);
  r.post('/caja/movimientos', v.validar(v.movimientoCajaSchema), cc.movimiento);
  r.post('/caja/cerrar', v.validar(v.cerrarCajaSchema), cc.cerrar);
  r.get('/caja/cortes', dueno, v.validar(v.listaCortesSchema, 'query'), cc.listar);
  r.get('/caja/cortes/:id', dueno, cc.detalle);
  r.post('/caja/cortes/:id/imprimir', dueno, cc.reimprimir);

  r.get('/inventario/stock-bajo', ic.stockBajo);
  r.get('/inventario/motivos', dueno, ic.motivos);
  r.get('/inventario/kardex', dueno, v.validar(v.kardexSchema, 'query'), ic.kardex);
  r.get('/inventario/verificar', dueno, ic.verificar);
  r.post('/inventario/ajustes', dueno, v.validar(v.ajusteSchema), ic.ajustar);

  return r;
};
