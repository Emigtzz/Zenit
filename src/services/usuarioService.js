'use strict';
const { ErrorApp } = require('../utils/errores');
const { hashear } = require('../utils/password');
const usuarioRepository = require('../repositories/usuarioRepository');
const { ROLES, validarContrasena } = require('./politicaAcceso');

// Gestión de usuarios (solo el dueño). Reglas que protegen el negocio:
//  - nombres únicos (sin distinguir mayúsculas)
//  - nunca puede quedar el sistema sin un dueño activo (nadie podría administrarlo)
//  - nadie se desactiva a sí mismo
//  - desactivar a alguien o resetear su contraseña cierra sus sesiones abiertas
module.exports = function usuarioService(db) {
  const usuarios = usuarioRepository(db);

  const noEncontrado = () => new ErrorApp('Usuario no encontrado', { status: 404, codigo: 'NO_ENCONTRADO' });
  function nombreLibre(nombre, idActual = -1) {
    const otro = usuarios.obtenerPorNombre(nombre);
    if (otro && otro.id !== idActual) throw new ErrorApp(`Ya existe un usuario llamado "${otro.nombre}"`, { status: 409, codigo: 'NOMBRE_DUPLICADO' });
  }

  return {
    listar: () => usuarios.listar(),

    async crear({ nombre, rol, contrasena }) {
      nombreLibre(nombre);
      validarContrasena(rol, contrasena);
      return usuarios.crear({ nombre, rol, hash: await hashear(contrasena) });
    },

    actualizar(id, { nombre, rol, activo }, actorId) {
      const u = usuarios.obtener(id);
      if (!u) throw noEncontrado();
      nombreLibre(nombre, id);
      if (id === actorId && !activo) throw new ErrorApp('No puedes desactivar tu propio usuario', { status: 409, codigo: 'AUTO_DESACTIVACION' });
      const dejaDeSerDueno = u.rol === ROLES.DUENO && u.activo && (rol !== ROLES.DUENO || !activo);
      if (dejaDeSerDueno && usuarios.contarDuenosActivos() <= 1) {
        throw new ErrorApp('Debe quedar al menos un dueño activo', { status: 409, codigo: 'ULTIMO_DUENO' });
      }
      const r = db.transaction(() => {
        const nuevo = usuarios.actualizar(id, { nombre, rol, activo: activo ? 1 : 0 });
        if (!activo || rol !== u.rol) usuarios.borrarSesionesDeUsuario(id); // el rol cambió o se desactivó: que vuelva a entrar
        return nuevo;
      })();
      return r;
    },

    // El dueño restablece la contraseña de alguien que la olvidó.
    async restablecerContrasena(id, contrasena) {
      const u = usuarios.obtener(id);
      if (!u) throw noEncontrado();
      validarContrasena(u.rol, contrasena);
      usuarios.cambiarHash(id, await hashear(contrasena));
      usuarios.borrarSesionesDeUsuario(id);
    },
  };
};
