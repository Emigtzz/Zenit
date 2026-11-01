'use strict';
const { ErrorApp } = require('../utils/errores');

function idDe(req) {
  const n = Number(req.params.id);
  if (!Number.isInteger(n) || n <= 0) throw new ErrorApp('Id inválido', { status: 400, codigo: 'ID_INVALIDO' });
  return n;
}
// El estado de impresión vive en memoria: es efímero y solo sirve para avisar al cajero si falló.
module.exports = function ventaController(ventas, impresora, config) {
  const estadoImpresion = new Map();

  function imprimirEnSegundoPlano(venta) {
    estadoImpresion.set(venta.id, { estado: 'imprimiendo' });
    // NO se espera (sin await): la respuesta de la venta no depende de que la impresora termine.
    impresora.imprimirVenta(venta).then((r) => {
      estadoImpresion.set(venta.id, { estado: r.impreso ? 'listo' : 'error', ...r });
      if (estadoImpresion.size > 200) estadoImpresion.delete(estadoImpresion.keys().next().value);
    });
  }

  return {
    config: (_req, res) => res.json({
      negocio: config.negocio.nombre,
      mayoreo_porcentaje: config.mayoreoPorcentaje,
      modo_impresora: config.impresora.modo,
    }),
    crear(req, res) {
      const venta = ventas.crear(req.body, { usuarioId: req.usuario.id }); // síncrono y transaccional
      imprimirEnSegundoPlano(venta);
      res.status(201).json(venta);
    },
    obtener: (req, res) => res.json(ventas.obtener(idDe(req))),
    estadoImpresion(req, res) {
      res.json(estadoImpresion.get(idDe(req)) || { estado: 'desconocido' });
    },
    reimprimir(req, res) {
      const venta = ventas.obtener(idDe(req));
      imprimirEnSegundoPlano(venta);
      res.status(202).json({ estado: 'imprimiendo' });
    },
  };
};
