'use strict';
const { ErrorApp } = require('../utils/errores');

function idDe(req) {
  const n = Number(req.params.id);
  if (!Number.isInteger(n) || n <= 0) throw new ErrorApp('Id inválido', { status: 400, codigo: 'ID_INVALIDO' });
  return n;
}
// Controlador = traduce HTTP <-> servicio. Sin lógica de negocio ni SQL.
// El COSTO (lo que le pagas al proveedor) y el margen son del dueño: el cajero no los recibe.
const sinCosto = (x) => { const { costo, ...resto } = x; return resto; };
const verPara = (req, datos) => (req.usuario?.rol === 'dueño' ? datos : Array.isArray(datos) ? datos.map(sinCosto) : sinCosto(datos));

module.exports = function catalogoController(catalogo, busqueda) {
  const id = idDe;
  return {
    listarCategorias: (_req, res) => res.json(catalogo.listarCategorias()),
    crearCategoria: (req, res) => res.status(201).json(catalogo.crearCategoria(req.body)),
    actualizarCategoria: (req, res) => res.json(catalogo.actualizarCategoria(id(req), req.body)),
    desactivarCategoria: (req, res) => { catalogo.desactivarCategoria(id(req)); res.status(204).end(); },

    listarProductos: (req, res) => {
      const verInactivos = req.query.incluir_inactivos === '1' && req.usuario.rol === 'dueño'; // los desactivados solo los ve el dueño
      res.json(verPara(req, catalogo.listarProductos({ soloActivos: !verInactivos, categoriaId: req.query.categoria })));
    },
    botonesRapidos: (req, res) => res.json(verPara(req, catalogo.botonesRapidos())),
    porCodigo: (req, res) => res.json(verPara(req, catalogo.buscarPorCodigo(req.params.codigo.trim()))),
    buscar: (req, res) => res.json(verPara(req, busqueda.buscar(req.query.q))),
    obtenerProducto: (req, res) => res.json(verPara(req, catalogo.obtenerProducto(id(req)))),
    crearProducto: (req, res) => res.status(201).json(catalogo.crearProducto(req.body)),
    actualizarProducto: (req, res) => res.json(catalogo.actualizarProducto(id(req), req.body)),
    desactivarProducto: (req, res) => { catalogo.desactivarProducto(id(req)); res.status(204).end(); },
  };
};
