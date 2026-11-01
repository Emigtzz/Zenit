'use strict';
const COLS = `i.id, i.fuente, i.archivo_nombre, i.archivo_ruta, i.sha256, i.uuid_cfdi, i.estado, i.datos, i.usuario_id, i.creado_en,
  i.resuelta_en, i.compra_id, u.nombre AS usuario_nombre`;
const BASE = `SELECT ${COLS} FROM importaciones i LEFT JOIN usuarios u ON u.id = i.usuario_id`;

module.exports = function importacionRepository(db) {
  return {
    insertar: (d) => db.prepare(`INSERT INTO importaciones (fuente, archivo_nombre, sha256, uuid_cfdi, datos, usuario_id, creado_en)
        VALUES (@fuente, @archivo_nombre, @sha256, @uuid_cfdi, @datos, @usuario_id, @creado_en)`).run(d).lastInsertRowid,
    fijarRuta: (id, ruta) => db.prepare('UPDATE importaciones SET archivo_ruta = ? WHERE id = ?').run(ruta, id),
    borrar: (id) => db.prepare('DELETE FROM importaciones WHERE id = ?').run(id),
    obtener: (id) => db.prepare(`${BASE} WHERE i.id = ?`).get(id),
    listar: (estado) => db.prepare(`${BASE} ${estado ? 'WHERE i.estado = ?' : ''} ORDER BY i.id DESC LIMIT 100`).all(...(estado ? [estado] : [])),
    // ¿Ya se subió este mismo archivo y sigue vigente (pendiente o confirmado)? Uno descartado se puede volver a subir.
    porHash: (sha) => db.prepare(`${BASE} WHERE i.sha256 = ? AND i.estado <> 'descartada' ORDER BY i.id DESC LIMIT 1`).get(sha),
    pendientesConUuid: (uuid, exceptoId = -1) => db.prepare("SELECT id FROM importaciones WHERE uuid_cfdi = ? AND estado = 'pendiente' AND id <> ?").all(uuid, exceptoId),
    marcarConfirmada: (id, compraId, iso) => db.prepare("UPDATE importaciones SET estado = 'confirmada', compra_id = ?, resuelta_en = ? WHERE id = ?").run(compraId, iso, id),
    marcarDescartada: (id, iso) => db.prepare("UPDATE importaciones SET estado = 'descartada', resuelta_en = ? WHERE id = ?").run(iso, id),
  };
};
