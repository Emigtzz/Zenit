'use strict';
const { ErrorApp } = require('../utils/errores');

const ROLES = { CAJERO: 'cajero', DUENO: 'dueño' };

// Cajero: puede ser un PIN corto (se teclea muchas veces al día). Dueño: contraseña más fuerte.
function validarContrasena(rol, contrasena) {
  const minimo = rol === ROLES.DUENO ? 8 : 4;
  if (typeof contrasena !== 'string' || contrasena.length < minimo) {
    throw new ErrorApp(`La contraseña de ${rol} debe tener al menos ${minimo} caracteres`, { status: 400, codigo: 'CONTRASENA_DEBIL' });
  }
  if (contrasena.length > 100) throw new ErrorApp('Contraseña demasiado larga', { status: 400, codigo: 'CONTRASENA_DEBIL' });
}

module.exports = { ROLES, validarContrasena };
