// Cliente de la API. Si el servidor responde con error, lanza un Error con .codigo y .detalles.
async function pedir(metodo, ruta, cuerpo) {
  let res;
  try {
    res = await fetch('/api' + ruta, {
      method: metodo,
      headers: { 'content-type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw Object.assign(new Error('No hay conexión con el servidor de la caja'), { codigo: 'SIN_SERVIDOR' });
  }
  const texto = await res.text();
  const datos = texto ? JSON.parse(texto) : null;
  if (!res.ok) {
    const e = datos?.error || {};
    throw Object.assign(new Error(e.mensaje || `Error ${res.status}`), { codigo: e.codigo, detalles: e.detalles, status: res.status });
  }
  return datos;
}
export const api = {
  config: () => pedir('GET', '/config'),
  productos: () => pedir('GET', '/productos'),
  botonesRapidos: () => pedir('GET', '/productos/botones-rapidos'),
  porCodigo: (c) => pedir('GET', '/productos/codigo/' + encodeURIComponent(c)),
  buscar: (q) => pedir('GET', '/productos/buscar?q=' + encodeURIComponent(q)),
  crearVenta: (venta) => pedir('POST', '/ventas', venta),
  estadoImpresion: (id) => pedir('GET', `/ventas/${id}/impresion`),
  reimprimir: (id) => pedir('POST', `/ventas/${id}/reimprimir`),
  producto: (id) => pedir('GET', `/productos/${id}`),
  motivos: () => pedir('GET', '/inventario/motivos'),
  kardex: (params) => pedir('GET', '/inventario/kardex?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null))),
  ajustar: (a) => pedir('POST', '/inventario/ajustes', a),
  stockBajo: () => pedir('GET', '/inventario/stock-bajo'),
  verificarInventario: () => pedir('GET', '/inventario/verificar'),
  // catálogo (pantalla de administración)
  categorias: () => pedir('GET', '/categorias'),
  crearCategoria: (c) => pedir('POST', '/categorias', c),
  actualizarCategoria: (id, c) => pedir('PUT', `/categorias/${id}`, c),
  desactivarCategoria: (id) => pedir('DELETE', `/categorias/${id}`),
  productosTodos: () => pedir('GET', '/productos?incluir_inactivos=1'),
  crearProducto: (p) => pedir('POST', '/productos', p),
  actualizarProducto: (id, p) => pedir('PUT', `/productos/${id}`, p),
  desactivarProducto: (id) => pedir('DELETE', `/productos/${id}`),
};
