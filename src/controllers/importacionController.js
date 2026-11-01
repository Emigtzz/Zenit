'use strict';
const { ErrorApp } = require('../utils/errores');

const idDe = (req) => {
  const n = Number(req.params.id);
  if (!Number.isInteger(n) || n <= 0) throw new ErrorApp('Id inválido', { status: 400, codigo: 'ID_INVALIDO' });
  return n;
};

module.exports = function importacionController(importaciones, config) {
  return {
    config: (_req, res) => res.json({ ia_disponible: importaciones.iaDisponible(), costo_incluye_impuestos: config.costoIncluyeImpuestos }),

    // El archivo llega CRUDO en el cuerpo (sin multipart): el nombre va en la cabecera X-Nombre-Archivo.
    async crear(req, res) {
      let nombre = 'factura';
      try { nombre = decodeURIComponent(req.headers['x-nombre-archivo'] || 'factura'); } catch { /* nombre ilegible: se usa el genérico */ }
      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      res.status(201).json(await importaciones.crear({ buffer, nombre }, { usuarioId: req.usuario.id }));
    },
    listar: (req, res) => res.json(importaciones.listar(req.query.estado)),
    obtener: (req, res) => res.json(importaciones.obtener(idDe(req))),
    archivo(req, res) {
      const a = importaciones.archivo(idDe(req));
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `inline; filename="${a.nombre}"`);
      res.type(a.fuente === 'pdf' ? 'application/pdf' : 'text/plain; charset=utf-8'); // el XML se muestra como TEXTO, nunca se interpreta
      res.sendFile(a.ruta);
    },
    async confirmar(req, res) { res.status(201).json(await importaciones.confirmar(idDe(req), req.body, { usuarioId: req.usuario.id })); },
    descartar(req, res) { importaciones.descartar(idDe(req)); res.status(204).end(); },

    listarEquivalencias: (req, res) => res.json(importaciones.listarEquivalencias(req.query.proveedor_id)),
    borrarEquivalencia(req, res) {
      if (!req.query.proveedor_id || !req.query.clave) throw new ErrorApp('Indica proveedor_id y clave', { status: 400, codigo: 'VALIDACION' });
      importaciones.borrarEquivalencia(req.query.proveedor_id, req.query.clave);
      res.status(204).end();
    },
  };
};
