'use strict';
module.exports = function equivalenciaRepository(db) {
  return {
    obtener: (proveedorId, clave) => db.prepare(`SELECT e.proveedor_id, e.clave_proveedor, e.producto_id, e.factor, e.descripcion,
        p.nombre AS producto_nombre, p.activo AS producto_activo
        FROM equivalencias_proveedor e JOIN productos p ON p.id = e.producto_id WHERE e.proveedor_id = ? AND e.clave_proveedor = ?`).get(proveedorId, clave),
    // Si ya existía, se actualiza: la última revisión humana manda.
    guardar: ({ proveedor_id, clave_proveedor, producto_id, factor, descripcion, iso }) => db.prepare(`
        INSERT INTO equivalencias_proveedor (proveedor_id, clave_proveedor, producto_id, factor, descripcion, actualizado_en)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (proveedor_id, clave_proveedor) DO UPDATE SET producto_id = excluded.producto_id, factor = excluded.factor,
          descripcion = excluded.descripcion, actualizado_en = excluded.actualizado_en`).run(proveedor_id, clave_proveedor, producto_id, factor, descripcion, iso),
    listar: (proveedorId) => db.prepare(`SELECT e.proveedor_id, e.clave_proveedor, e.producto_id, e.factor, e.descripcion, e.actualizado_en,
        p.nombre AS producto_nombre, pr.nombre AS proveedor_nombre FROM equivalencias_proveedor e
        JOIN productos p ON p.id = e.producto_id JOIN proveedores pr ON pr.id = e.proveedor_id
        ${proveedorId ? 'WHERE e.proveedor_id = ?' : ''} ORDER BY pr.nombre COLLATE NOCASE, e.descripcion COLLATE NOCASE`).all(...(proveedorId ? [proveedorId] : [])),
    borrar: (proveedorId, clave) => db.prepare('DELETE FROM equivalencias_proveedor WHERE proveedor_id = ? AND clave_proveedor = ?').run(proveedorId, clave).changes > 0,
  };
};
