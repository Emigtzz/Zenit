'use strict';
module.exports = function inventarioRepository(db) {
  return {
    insertarMovimiento(m) {
      return db.prepare(`INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, referencia, motivo, nota, fecha, usuario_id)
                         VALUES (@producto_id, @tipo, @cantidad, @referencia, @motivo, @nota, @fecha, @usuario_id)`).run(m).lastInsertRowid;
    },

    // Kárdex. El SALDO es una suma acumulada por producto (función de ventana): lo que debía haber
    // en existencia justo después de cada movimiento. Se calcula ANTES de filtrar por fecha/tipo
    // para que el saldo no cambie según el filtro.
    kardex({ productoId, tipo, desde, hasta, limite, desplazamiento }) {
      const dentro = productoId ? 'WHERE m.producto_id = @productoId' : '';
      const cond = [];
      if (tipo) cond.push('tipo = @tipo');
      if (desde) cond.push('fecha >= @desde');
      if (hasta) cond.push('fecha < @hasta');
      const fuera = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
      const base = `
        FROM (
          SELECT m.id, m.producto_id, p.nombre AS producto_nombre, m.tipo, m.cantidad,
                 SUM(m.cantidad) OVER (PARTITION BY m.producto_id ORDER BY m.id) AS saldo,
                 m.motivo, m.nota, m.referencia, m.fecha, m.usuario_id
          FROM movimientos_inventario m JOIN productos p ON p.id = m.producto_id ${dentro}
        ) ${fuera}`;
      const params = { productoId, tipo, desde, hasta };
      for (const k of Object.keys(params)) if (params[k] === undefined) delete params[k];
      const total = db.prepare(`SELECT COUNT(*) n ${base}`).get(params).n;
      const filas = db.prepare(`SELECT * ${base} ORDER BY id DESC LIMIT @limite OFFSET @desplazamiento`)
        .all({ ...params, limite, desplazamiento });
      return { total, filas };
    },

    // Productos cuyo stock NO coincide con la suma de sus movimientos (señal de que algo se saltó el kárdex).
    inconsistencias() {
      return db.prepare(`
        SELECT p.id, p.nombre, p.stock, COALESCE(SUM(m.cantidad), 0) AS esperado
        FROM productos p LEFT JOIN movimientos_inventario m ON m.producto_id = p.id
        GROUP BY p.id HAVING p.stock <> COALESCE(SUM(m.cantidad), 0)`).all();
    },
  };
};
