'use strict';
const { Router } = require('express');
const v = require('../middlewares/validar');

// Rutas = tabla "URL -> validación -> controlador". Nada más.
module.exports = function rutas({ catalogoCtrl: c, ventaCtrl: vc }) {
  const r = Router();

  r.get('/config', vc.config);

  r.get('/categorias', c.listarCategorias);
  r.post('/categorias', v.validar(v.categoriaSchema), c.crearCategoria);
  r.put('/categorias/:id', v.validar(v.categoriaSchema), c.actualizarCategoria);
  r.delete('/categorias/:id', c.desactivarCategoria);

  // Las rutas fijas van ANTES que /:id para que "buscar" no se interprete como un id.
  r.get('/productos/botones-rapidos', c.botonesRapidos);
  r.get('/productos/buscar', v.validar(v.buscarSchema, 'query'), c.buscar);
  r.get('/productos/codigo/:codigo', c.porCodigo);
  r.get('/productos', v.validar(v.listaProductosSchema, 'query'), c.listarProductos);
  r.get('/productos/:id', c.obtenerProducto);
  r.post('/productos', v.validar(v.productoSchema), c.crearProducto);
  r.put('/productos/:id', v.validar(v.productoSchema), c.actualizarProducto);
  r.delete('/productos/:id', c.desactivarProducto);

  r.post('/ventas', v.validar(v.ventaSchema), vc.crear);
  r.get('/ventas/:id', vc.obtener);
  r.get('/ventas/:id/impresion', vc.estadoImpresion);
  r.post('/ventas/:id/reimprimir', vc.reimprimir);

  return r;
};
