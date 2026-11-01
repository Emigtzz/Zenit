'use strict';
const { ErrorApp } = require('../utils/errores');

const idDe = (req) => {
  const n = Number(req.params.id);
  if (!Number.isInteger(n) || n <= 0) throw new ErrorApp('Id inválido', { status: 400, codigo: 'ID_INVALIDO' });
  return n;
};

module.exports = function compraController(compras, proveedores) {
  return {
    listarProveedores: (req, res) => res.json(proveedores.listar({ soloActivos: req.query.incluir_inactivos !== '1' })),
    crearProveedor: (req, res) => res.status(201).json(proveedores.crear(req.body)),
    actualizarProveedor: (req, res) => res.json(proveedores.actualizar(idDe(req), req.body)),

    registrar: (req, res) => res.status(201).json(compras.registrar(req.body, { usuarioId: req.usuario.id })),
    anular: (req, res) => res.json(compras.anular(idDe(req), req.body, { usuarioId: req.usuario.id })),
    obtener: (req, res) => res.json(compras.obtener(idDe(req))),
    listar: (req, res) => res.json(compras.listar(req.query)),
    historialProducto: (req, res) => res.json(compras.historialProducto(idDe(req))),
  };
};
