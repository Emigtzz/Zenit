'use strict';
const { ErrorApp } = require('../utils/errores');
const categoriaRepository = require('../repositories/categoriaRepository');
const productoRepository = require('../repositories/productoRepository');

module.exports = function catalogoService(db, busqueda) {
  const categorias = categoriaRepository(db);
  const productos = productoRepository(db);

  // codigo_barras y codigo_corto se escriben en el MISMO campo del escáner: no pueden chocar entre productos.
  function verificarCodigos(p, idActual = null) {
    for (const codigo of [p.codigo_barras, p.codigo_corto].filter(Boolean)) {
      const otro = db.prepare('SELECT id, nombre FROM productos WHERE (codigo_barras = ? OR codigo_corto = ?) AND id <> ?')
        .get(codigo, codigo, idActual ?? -1);
      if (otro) {
        throw new ErrorApp(`El código "${codigo}" ya lo usa "${otro.nombre}"`, { status: 409, codigo: 'CODIGO_DUPLICADO' });
      }
    }
    if (p.codigo_barras && p.codigo_barras === p.codigo_corto) {
      throw new ErrorApp('El código de barras y el corto no pueden ser iguales', { status: 409, codigo: 'CODIGO_DUPLICADO' });
    }
  }
  function verificarCategoria(id) {
    if (id != null && !categorias.obtener(id)) throw new ErrorApp('La categoría no existe', { status: 422, codigo: 'CATEGORIA_INVALIDA' });
  }

  return {
    // ---- categorías ----
    listarCategorias: () => categorias.listar(),
    crearCategoria(datos) {
      try { return categorias.crear(datos); }
      catch (e) { throw traducir(e, 'Ya existe una categoría con ese nombre'); }
    },
    actualizarCategoria(id, datos) {
      if (!categorias.obtener(id)) throw noEncontrado('Categoría');
      try { const r = categorias.actualizar(id, datos); busqueda.invalidar(); return r; }
      catch (e) { throw traducir(e, 'Ya existe una categoría con ese nombre'); }
    },
    desactivarCategoria(id) {
      if (!categorias.desactivar(id)) throw noEncontrado('Categoría');
      busqueda.invalidar();
    },

    // ---- productos ----
    listarProductos: (op) => productos.listar(op),
    botonesRapidos: () => productos.botonesRapidos(),
    buscarPorCodigo(codigo) {
      const p = productos.buscarPorCodigo(codigo);
      if (!p) throw new ErrorApp(`Código no encontrado: ${codigo}`, { status: 404, codigo: 'CODIGO_NO_ENCONTRADO' });
      return p;
    },
    obtenerProducto(id) {
      const p = productos.obtener(id);
      if (!p) throw noEncontrado('Producto');
      return p;
    },
    crearProducto(datos) {
      verificarCodigos(datos);
      verificarCategoria(datos.categoria_id);
      // Crear + stock inicial en una transacción: el stock inicial entra por el kárdex como "ajuste".
      const crear = db.transaction(() => {
        const p = productos.crear({ ...datos, stock: 0 });
        if (datos.stock !== 0) {
          db.prepare(`INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, referencia, fecha)
                      VALUES (?, 'ajuste', ?, 'stock inicial', ?)`).run(p.id, datos.stock, new Date().toISOString());
          productos.ajustarStock(p.id, datos.stock);
        }
        return productos.obtener(p.id);
      });
      try { const p = crear(); busqueda.invalidar(); return p; }
      catch (e) { throw traducir(e, 'Código duplicado'); }
    },
    actualizarProducto(id, datos) {
      if (!productos.obtener(id)) throw noEncontrado('Producto');
      verificarCodigos(datos, id);
      verificarCategoria(datos.categoria_id);
      try { const p = productos.actualizar(id, datos); busqueda.invalidar(); return p; }
      catch (e) { throw traducir(e, 'Código duplicado'); }
    },
    desactivarProducto(id) {
      if (!productos.desactivar(id)) throw noEncontrado('Producto');
      busqueda.invalidar();
    },
  };
};

function noEncontrado(que) { return new ErrorApp(`${que} no encontrado`, { status: 404, codigo: 'NO_ENCONTRADO' }); }
function traducir(e, mensaje) {
  if (e && String(e.code).startsWith('SQLITE_CONSTRAINT')) return new ErrorApp(mensaje, { status: 409, codigo: 'DUPLICADO' });
  return e;
}
