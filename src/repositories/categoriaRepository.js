'use strict';
// Repositorio = ÚNICO lugar con SQL. Recibe la conexión (db) para poder probarlo con una base en memoria.
module.exports = function categoriaRepository(db) {
  return {
    listar({ soloActivas = true } = {}) {
      const where = soloActivas ? 'WHERE activo = 1' : '';
      return db.prepare(`SELECT id, nombre, color, activo FROM categorias ${where} ORDER BY nombre`).all();
    },
    obtener(id) {
      return db.prepare('SELECT id, nombre, color, activo FROM categorias WHERE id = ?').get(id);
    },
    crear({ nombre, color }) {
      const r = db.prepare('INSERT INTO categorias (nombre, color) VALUES (?, ?)').run(nombre, color);
      return this.obtener(r.lastInsertRowid);
    },
    actualizar(id, { nombre, color, activo }) {
      db.prepare('UPDATE categorias SET nombre = ?, color = ?, activo = ? WHERE id = ?').run(nombre, color, activo, id);
      return this.obtener(id);
    },
    desactivar(id) {
      return db.prepare('UPDATE categorias SET activo = 0 WHERE id = ?').run(id).changes > 0;
    },
  };
};
