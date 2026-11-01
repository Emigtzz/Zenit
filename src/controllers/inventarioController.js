'use strict';
module.exports = function inventarioController(inventario) {
  return {
    motivos: (_req, res) => res.json(inventario.motivos()),
    kardex: (req, res) => res.json(inventario.kardex(req.query)),
    verificar: (_req, res) => res.json({ consistente: inventario.verificar().length === 0, productos: inventario.verificar() }),
    stockBajo: (_req, res) => res.json(inventario.stockBajo()),
    ajustar: (req, res) => res.status(201).json(inventario.ajustar(req.body)),
  };
};
