'use strict';
const PUBLICO = 'id, nombre, rol, activo, creado_en';

module.exports = function usuarioRepository(db) {
  return {
    contar: () => db.prepare('SELECT COUNT(*) n FROM usuarios').get().n,
    contarDuenosActivos: () => db.prepare("SELECT COUNT(*) n FROM usuarios WHERE rol = 'dueño' AND activo = 1").get().n,
    listar: () => db.prepare(`SELECT ${PUBLICO} FROM usuarios ORDER BY activo DESC, nombre COLLATE NOCASE`).all(),
    listarParaLogin: () => db.prepare('SELECT id, nombre FROM usuarios WHERE activo = 1 ORDER BY nombre COLLATE NOCASE').all(),
    obtener: (id) => db.prepare(`SELECT ${PUBLICO} FROM usuarios WHERE id = ?`).get(id),
    obtenerConHash: (id) => db.prepare('SELECT id, nombre, rol, activo, contrasena_hash FROM usuarios WHERE id = ?').get(id),
    obtenerPorNombre: (nombre) => db.prepare(`SELECT ${PUBLICO} FROM usuarios WHERE nombre = ? COLLATE NOCASE`).get(nombre),
    crear({ nombre, rol, hash }) {
      const id = db.prepare('INSERT INTO usuarios (nombre, rol, contrasena_hash, activo, creado_en) VALUES (?, ?, ?, 1, ?)')
        .run(nombre, rol, hash, new Date().toISOString()).lastInsertRowid;
      return this.obtener(id);
    },
    actualizar(id, { nombre, rol, activo }) {
      db.prepare('UPDATE usuarios SET nombre = ?, rol = ?, activo = ? WHERE id = ?').run(nombre, rol, activo, id);
      return this.obtener(id);
    },
    cambiarHash: (id, hash) => db.prepare('UPDATE usuarios SET contrasena_hash = ? WHERE id = ?').run(hash, id),

    // ---- sesiones ----
    crearSesion: (tokenHash, usuarioId, iso) =>
      db.prepare('INSERT INTO sesiones (token_hash, usuario_id, creada_en, ultima_actividad) VALUES (?, ?, ?, ?)').run(tokenHash, usuarioId, iso, iso),
    obtenerSesion: (tokenHash) => db.prepare(`
      SELECT s.token_hash, s.ultima_actividad, u.id, u.nombre, u.rol, u.activo
      FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = ?`).get(tokenHash),
    tocarSesion: (tokenHash, iso) => db.prepare('UPDATE sesiones SET ultima_actividad = ? WHERE token_hash = ?').run(iso, tokenHash),
    borrarSesion: (tokenHash) => db.prepare('DELETE FROM sesiones WHERE token_hash = ?').run(tokenHash),
    borrarSesionesDeUsuario: (usuarioId, excepto = '') =>
      db.prepare('DELETE FROM sesiones WHERE usuario_id = ? AND token_hash <> ?').run(usuarioId, excepto),
    borrarSesionesAnterioresA: (iso) => db.prepare('DELETE FROM sesiones WHERE ultima_actividad < ?').run(iso),
  };
};
