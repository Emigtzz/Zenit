'use strict';
const crypto = require('node:crypto');
const { ErrorApp } = require('../utils/errores');
const { hashear, verificar } = require('../utils/password');
const usuarioRepository = require('../repositories/usuarioRepository');
const { ROLES, validarContrasena } = require('./politicaAcceso');

const VIDA_SESION_MS = 12 * 60 * 60 * 1000;   // se renueva con la actividad: 12 h sin usar la caja la cierra
const REFRESCO_MS = 60 * 1000;                // no se escribe en la base en CADA petición, solo ~1 vez por minuto
const MAX_FALLOS = 5;
const BLOQUEO_MS = 60 * 1000;

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

// `ahora` se inyecta para poder probar expiración y bloqueos sin esperar de verdad.
module.exports = function authService(db, { ahora = () => Date.now() } = {}) {
  const usuarios = usuarioRepository(db);
  const fallos = new Map(); // usuario_id -> { n, hasta } (en memoria: un reinicio del servidor lo limpia, es aceptable)

  const credencialesInvalidas = () => new ErrorApp('Usuario o contraseña incorrectos', { status: 401, codigo: 'CREDENCIALES_INVALIDAS' });

  async function abrirSesion(usuario) {
    usuarios.borrarSesionesAnterioresA(new Date(ahora() - VIDA_SESION_MS).toISOString()); // limpieza oportunista
    const token = crypto.randomBytes(32).toString('base64url');
    usuarios.crearSesion(hashToken(token), usuario.id, new Date(ahora()).toISOString());
    return { token, usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol } };
  }

  return {
    VIDA_SESION_MS,
    necesitaSetup: () => usuarios.contar() === 0,
    usuariosParaLogin: () => usuarios.listarParaLogin(),

    // Primer arranque: crea al dueño. Solo funciona si NO hay ningún usuario (no deja puerta trasera después).
    async setupInicial({ nombre, contrasena }) {
      validarContrasena(ROLES.DUENO, contrasena);
      const hash = await hashear(contrasena);
      const crear = db.transaction(() => {
        if (usuarios.contar() > 0) throw new ErrorApp('El sistema ya fue configurado', { status: 409, codigo: 'YA_CONFIGURADO' });
        return usuarios.crear({ nombre, rol: ROLES.DUENO, hash });
      });
      return abrirSesion(crear());
    },

    async login({ usuario_id, contrasena }) {
      const f = fallos.get(usuario_id);
      if (f && f.hasta > ahora()) {
        throw new ErrorApp(`Demasiados intentos. Espera ${Math.ceil((f.hasta - ahora()) / 1000)} s`, { status: 429, codigo: 'BLOQUEADO' });
      }
      const u = usuarios.obtenerConHash(usuario_id);
      // Siempre se calcula el hash (aunque el usuario no exista) para que el tiempo de respuesta no delate nada.
      const ok = await verificar(String(contrasena), u ? u.contrasena_hash : 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
      if (!u || !u.activo || !ok) {
        const bloqueoVencido = f && f.hasta > 0 && f.hasta <= ahora(); // el castigo anterior ya pasó: se empieza de cero
        const n = (bloqueoVencido ? 0 : f?.n || 0) + 1;
        fallos.set(usuario_id, n >= MAX_FALLOS ? { n: 0, hasta: ahora() + BLOQUEO_MS } : { n, hasta: 0 });
        throw credencialesInvalidas();
      }
      fallos.delete(usuario_id);
      return abrirSesion(u);
    },

    // Devuelve el usuario dueño de la sesión, o null si no existe/expiró/el usuario fue desactivado.
    validar(token) {
      if (!token) return null;
      const h = hashToken(token);
      const s = usuarios.obtenerSesion(h);
      if (!s) return null;
      const ultima = Date.parse(s.ultima_actividad);
      if (!s.activo || ahora() - ultima > VIDA_SESION_MS) { usuarios.borrarSesion(h); return null; }
      if (ahora() - ultima > REFRESCO_MS) usuarios.tocarSesion(h, new Date(ahora()).toISOString());
      return { id: s.id, nombre: s.nombre, rol: s.rol };
    },

    logout(token) { if (token) usuarios.borrarSesion(hashToken(token)); },

    async cambiarContrasenaPropia(usuarioId, { actual, nueva }, tokenActual) {
      const u = usuarios.obtenerConHash(usuarioId);
      if (!(await verificar(String(actual), u.contrasena_hash))) {
        throw new ErrorApp('La contraseña actual no es correcta', { status: 400, codigo: 'CONTRASENA_ACTUAL_INCORRECTA' });
      }
      validarContrasena(u.rol, nueva);
      usuarios.cambiarHash(usuarioId, await hashear(nueva));
      usuarios.borrarSesionesDeUsuario(usuarioId, tokenActual ? hashToken(tokenActual) : ''); // cierra las demás sesiones
    },
  };
};
