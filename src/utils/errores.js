'use strict';
// Error "esperado" con código HTTP: el middleware lo convierte en respuesta limpia.
class ErrorApp extends Error {
  constructor(mensaje, { status = 400, codigo = 'ERROR', detalles } = {}) {
    super(mensaje);
    this.name = 'ErrorApp';
    this.status = status;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}
module.exports = { ErrorApp };
