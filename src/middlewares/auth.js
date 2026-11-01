'use strict';
const { ErrorApp } = require('../utils/errores');

const COOKIE = 'zenit_sid';

function leerCookies(req) {
  const salida = {};
  for (const par of (req.headers.cookie || '').split(';')) {
    const i = par.indexOf('=');
    if (i > 0) salida[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim());
  }
  return salida;
}

// HttpOnly: el JavaScript de la página NO puede leer la cookie (frena el robo por XSS).
// SameSite=Strict: el navegador no la manda desde otros sitios (frena CSRF).
function ponerCookie(res, token, maxAgeMs) {
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(maxAgeMs / 1000)}`);
}
function borrarCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

module.exports = function authMiddlewares(auth) {
  return {
    // Se ejecuta en TODAS las rutas /api: deja req.usuario (o null) y req.token.
    cargarSesion(req, _res, next) {
      req.token = leerCookies(req)[COOKIE] || null;
      req.usuario = auth.validar(req.token);
      next();
    },
    requerirSesion(req, _res, next) {
      if (!req.usuario) return next(new ErrorApp('Inicia sesión para continuar', { status: 401, codigo: 'SESION_REQUERIDA' }));
      next();
    },
    requerirRol: (...roles) => (req, _res, next) => {
      if (!req.usuario) return next(new ErrorApp('Inicia sesión para continuar', { status: 401, codigo: 'SESION_REQUERIDA' }));
      if (!roles.includes(req.usuario.rol)) return next(new ErrorApp('No tienes permiso para esta acción', { status: 403, codigo: 'PROHIBIDO' }));
      next();
    },
    // Defensa extra contra peticiones disparadas desde OTRA página web: si el navegador manda Origin, debe ser este mismo host.
    mismoOrigen(req, _res, next) {
      const origen = req.headers.origin;
      if (origen && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        let host = null;
        try { host = new URL(origen).host; } catch { /* inválido */ }
        if (host !== req.headers.host) return next(new ErrorApp('Origen no permitido', { status: 403, codigo: 'ORIGEN_INVALIDO' }));
      }
      next();
    },
    ponerCookie, borrarCookie,
  };
};
