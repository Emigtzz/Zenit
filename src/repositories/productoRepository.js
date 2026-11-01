'use strict';
const COLUMNAS = `p.id, p.codigo_barras, p.codigo_corto, p.nombre, p.categoria_id, p.costo, p.precio,
  p.stock, p.stock_minimo, p.boton_rapido, p.activo, c.nombre AS categoria_nombre, c.color AS categoria_color`;
const BASE = `SELECT ${COLUMNAS} FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id`;

module.exports = function productoRepository(db) {
  return {
    obtener(id) {
      return db.prepare(`${BASE} WHERE p.id = ?`).get(id);
    },
    // Una sola consulta cubre código de barras y código corto (ambos tienen índice UNIQUE).
    buscarPorCodigo(codigo) {
      return db
        .prepare(`${BASE} WHERE p.activo = 1 AND (p.codigo_barras = ? OR p.codigo_corto = ?) LIMIT 1`)
        .get(codigo, codigo);
    },
    listar({ soloActivos = true, categoriaId } = {}) {
      const cond = [];
      const params = [];
      if (soloActivos) cond.push('p.activo = 1');
      if (categoriaId) { cond.push('p.categoria_id = ?'); params.push(categoriaId); }
      const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
      return db.prepare(`${BASE} ${where} ORDER BY p.nombre`).all(...params);
    },
    botonesRapidos() {
      return db.prepare(`${BASE} WHERE p.activo = 1 AND p.boton_rapido = 1 ORDER BY c.nombre, p.nombre`).all();
    },
    crear(p) {
      const r = db
        .prepare(`INSERT INTO productos (codigo_barras, codigo_corto, nombre, categoria_id, costo, precio, stock, stock_minimo, boton_rapido, activo)
                  VALUES (@codigo_barras, @codigo_corto, @nombre, @categoria_id, @costo, @precio, @stock, @stock_minimo, @boton_rapido, @activo)`)
        .run(p);
      return this.obtener(r.lastInsertRowid);
    },
    actualizar(id, p) {
      // El stock NO se edita aquí: solo cambia con movimientos de inventario (kárdex).
      db.prepare(`UPDATE productos SET codigo_barras=@codigo_barras, codigo_corto=@codigo_corto, nombre=@nombre,
                  categoria_id=@categoria_id, costo=@costo, precio=@precio, stock_minimo=@stock_minimo,
                  boton_rapido=@boton_rapido, activo=@activo,
                  actualizado_en=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=@id`).run({ ...p, id });
      return this.obtener(id);
    },
    desactivar(id) {
      return db.prepare(`UPDATE productos SET activo = 0, actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(id).changes > 0;
    },
    fijarCosto(id, costo) {
      db.prepare(`UPDATE productos SET costo = ?, actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(costo, id);
    },
    // Descuento atómico en SQL (stock = stock - n) en lugar de leer-modificar-escribir.
    ajustarStock(id, delta) {
      db.prepare('UPDATE productos SET stock = stock + ? WHERE id = ?').run(delta, id);
    },
  };
};
