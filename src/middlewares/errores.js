'use strict';
const { ErrorApp } = require('../utils/errores');

function noEncontrada(req, _res, next) {
  next(new ErrorApp(`Ruta no encontrada: ${req.method} ${req.path}`, { status: 404, codigo: 'RUTA_NO_ENCONTRADA' }));
}

// Último middleware: convierte cualquier error en JSON. Los inesperados (bugs) se registran y no filtran detalles.
function manejarErrores(err, _req, res, _next) {
  if (err instanceof ErrorApp) {
    return res.status(err.status).json({ error: { codigo: err.codigo, mensaje: err.message, detalles: err.detalles } });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { codigo: 'JSON_INVALIDO', mensaje: 'El cuerpo no es JSON válido' } });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: { codigo: 'ARCHIVO_GRANDE', mensaje: 'El archivo es demasiado grande (máximo 8 MB)' } });
  }
  console.error('[error]', err);
  res.status(500).json({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor' } });
}

module.exports = { noEncontrada, manejarErrores };
