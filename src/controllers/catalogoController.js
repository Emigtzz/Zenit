'use strict';
const { ErrorApp } = require('../utils/errores');

function idDe(req) {
  const n = Number(req.params.id);
  if (!Number.isInteger(n) || n <= 0) throw new ErrorApp('Id inválido', { status: 400, codigo: 'ID_INVALIDO' });
  return n;
}
// Controlador = traduce HTTP <-> servicio. Sin lógica de negocio ni SQL.
module.exports = function catalogoController(catalogo, busqueda) {
  const id = idDe;
  return {
    listarCategorias: (_req, res) => res.json(catalogo.listarCategorias()),
    crearCategoria: (req, res) => res.status(201).json(catalogo.crearCategoria(req.body)),
    actualizarCategoria: (req, res) => res.json(catalogo.actualizarCategoria(id(req), req.body)),
    desactivarCategoria: (req, res) => { catalogo.desactivarCategoria(id(req)); res.status(204).end(); },

    listarProductos: (req, res) =>
      res.json(catalogo.listarProductos({ soloActivos: req.query.incluir_inactivos !== '1', categoriaId: req.query.categoria })),
    botonesRapidos: (_req, res) => res.json(catalogo.botonesRapidos()),
    porCodigo: (req, res) => res.json(catalogo.buscarPorCodigo(req.params.codigo.trim())),
    buscar: (req, res) => res.json(busqueda.buscar(req.query.q)),
    obtenerProducto: (req, res) => res.json(catalogo.obtenerProducto(id(req))),
    crearProducto: (req, res) => res.status(201).json(catalogo.crearProducto(req.body)),
    actualizarProducto: (req, res) => res.json(catalogo.actualizarProducto(id(req), req.body)),
    desactivarProducto: (req, res) => { catalogo.desactivarProducto(id(req)); res.status(204).end(); },
  };
};
