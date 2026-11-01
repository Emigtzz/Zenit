'use strict';
module.exports = function proveedorRepository(db) {
  return {
    listar: ({ soloActivos = true } = {}) =>
      db.prepare(`SELECT id, nombre, rfc, activo FROM proveedores ${soloActivos ? 'WHERE activo = 1' : ''} ORDER BY nombre COLLATE NOCASE`).all(),
    obtener: (id) => db.prepare('SELECT id, nombre, rfc, activo FROM proveedores WHERE id = ?').get(id),
    obtenerPorNombre: (nombre) => db.prepare('SELECT id, nombre, rfc, activo FROM proveedores WHERE nombre = ? COLLATE NOCASE').get(nombre),
    crear({ nombre, rfc }) {
      return this.obtener(db.prepare('INSERT INTO proveedores (nombre, rfc) VALUES (?, ?)').run(nombre, rfc).lastInsertRowid);
    },
    actualizar(id, { nombre, rfc, activo }) {
      db.prepare('UPDATE proveedores SET nombre = ?, rfc = ?, activo = ? WHERE id = ?').run(nombre, rfc, activo, id);
      return this.obtener(id);
    },
  };
};
