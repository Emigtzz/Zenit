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
    // Sesión vencida o no iniciada: a la pantalla de login, y de ahí se regresa a donde estaba el usuario.
    if (res.status === 401 && e.codigo === 'SESION_REQUERIDA' && !location.pathname.startsWith('/login')) {
      location.href = '/login.html?volver=' + encodeURIComponent(location.pathname);
      return new Promise(() => {}); // la página se está yendo: no sigas ejecutando nada
    }
    throw Object.assign(new Error(e.mensaje || `Error ${res.status}`), { codigo: e.codigo, detalles: e.detalles, status: res.status });
  }
  return datos;
}
// Páginas solo para el dueño: si entra un cajero lo regresamos a la caja.
export async function requerirDueno() {
  const { usuario } = await api.yo();
  if (usuario.rol !== 'dueño') { location.href = '/'; return new Promise(() => {}); }
  return usuario;
}

export const api = {
  proveedores: (todos = false) => pedir('GET', `/proveedores?incluir_inactivos=${todos ? 1 : 0}`),
  crearProveedor: (d) => pedir('POST', '/proveedores', d),
  actualizarProveedor: (id, d) => pedir('PUT', `/proveedores/${id}`, d),
  registrarCompra: (d) => pedir('POST', '/compras', d),
  compras: (f) => pedir('GET', '/compras?' + new URLSearchParams(Object.entries(f).filter(([, v]) => v !== '' && v != null))),
  compra: (id) => pedir('GET', `/compras/${id}`),
  anularCompra: (id, motivo) => pedir('POST', `/compras/${id}/anular`, { motivo }),
  estadoCaja: () => pedir('GET', '/caja/estado'),
  abrirCaja: (fondo_inicial) => pedir('POST', '/caja/abrir', { fondo_inicial }),
  resumenCaja: () => pedir('GET', '/caja/resumen'),
  movimientoCaja: (m) => pedir('POST', '/caja/movimientos', m),
  cerrarCaja: (d) => pedir('POST', '/caja/cerrar', d),
  cortes: (pagina = 1) => pedir('GET', `/caja/cortes?pagina=${pagina}`),
  corte: (id) => pedir('GET', `/caja/cortes/${id}`),
  imprimirCorte: (id) => pedir('POST', `/caja/cortes/${id}/imprimir`),
  estadoAuth: () => pedir('GET', '/auth/estado'),
  setup: (d) => pedir('POST', '/auth/setup', d),
  login: (d) => pedir('POST', '/auth/login', d),
  logout: () => pedir('POST', '/auth/logout'),
  yo: () => pedir('GET', '/auth/yo'),
  cambiarContrasena: (d) => pedir('POST', '/auth/contrasena', d),
  usuarios: () => pedir('GET', '/usuarios'),
  crearUsuario: (u) => pedir('POST', '/usuarios', u),
  actualizarUsuario: (id, u) => pedir('PUT', `/usuarios/${id}`, u),
  restablecerContrasena: (id, contrasena) => pedir('POST', `/usuarios/${id}/contrasena`, { contrasena }),
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
