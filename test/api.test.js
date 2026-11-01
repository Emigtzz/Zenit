'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { crearApp } = require('../src/app');
const { crearBaseDePrueba, stockDe } = require('./helpers');
const { hashear } = require('../src/utils/password');

const config = {
  raiz: path.join(__dirname, '..'), mayoreoPorcentaje: 5,
  negocio: { nombre: 'Luna de precios', direccion: '', leyenda: '' },
  impresora: { modo: 'console', columnas: 48 },
};

async function crearUsuario(db, nombre, rol, contrasena) {
  const hash = await hashear(contrasena);
  return db.prepare('INSERT INTO usuarios (nombre, rol, contrasena_hash, activo, creado_en) VALUES (?, ?, ?, 1, ?)')
    .run(nombre, rol, hash, new Date().toISOString()).lastInsertRowid;
}

// Levanta la app con una base en memoria. Por defecto las peticiones van con la sesión de un dueño ("Ana");
// `como(rol)` abre sesión REAL (POST /auth/login) con otro usuario para probar permisos.
async function levantar({ sinSesion = false } = {}) {
  const db = crearBaseDePrueba();
  const impresiones = [];
  const impresora = { imprimirVenta: async (v) => { impresiones.push(v); return { impreso: true }; } };
  const servidor = crearApp({ db, config, impresora }).listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  const base = `http://127.0.0.1:${servidor.address().port}/api`;

  const crudo = async (metodo, ruta, cuerpo, { cookie, headers = {} } = {}) => {
    const res = await fetch(base + ruta, {
      method: metodo,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const texto = await res.text();
    return { status: res.status, json: texto ? JSON.parse(texto) : null, setCookie: res.headers.get('set-cookie') };
  };
  const entrar = async (nombre, rol, contrasena) => {
    const id = await crearUsuario(db, nombre, rol, contrasena);
    const r = await crudo('POST', '/auth/login', { usuario_id: Number(id), contrasena });
    assert.equal(r.status, 200);
    return { id: Number(id), cookie: r.setCookie.split(';')[0] };
  };
  const dueno = sinSesion ? null : await entrar('Ana', 'dueño', 'contraseña-larga');
  const pedir = (m, ruta, cuerpo) => crudo(m, ruta, cuerpo, { cookie: dueno?.cookie });
  const como = async (nombre, rol, contrasena = '4321') => {
    const u = await entrar(nombre, rol, contrasena);
    return Object.assign((m, ruta, cuerpo) => crudo(m, ruta, cuerpo, { cookie: u.cookie }), { id: u.id });
  };
  return { db, pedir, crudo, como, dueno, impresiones, host: `127.0.0.1:${servidor.address().port}`, cerrar: () => servidor.close() };
}

test('GET /productos/codigo/:codigo resuelve barras y código corto; 404 si no existe', async () => {
  const s = await levantar();
  try {
    assert.equal((await s.pedir('GET', '/productos/codigo/7501000000001')).json.nombre, 'Refresco 600ml');
    assert.equal((await s.pedir('GET', '/productos/codigo/103')).json.nombre, 'Bolsa de hielo');
    const r = await s.pedir('GET', '/productos/codigo/000');
    assert.equal(r.status, 404);
    assert.equal(r.json.error.codigo, 'CODIGO_NO_ENCONTRADO');
  } finally { s.cerrar(); }
});

test('POST /ventas: crea la venta, descuenta stock y dispara la impresión', async () => {
  const s = await levantar();
  try {
    const r = await s.pedir('POST', '/ventas', { items: [{ producto_id: 1, cantidad: 2 }], pagos: [{ metodo: 'efectivo', monto: 5000 }], mayoreo: true });
    assert.equal(r.status, 201);
    assert.equal(r.json.subtotal, 3700);
    assert.equal(r.json.descuento_mayoreo, 185);
    assert.equal(r.json.total, 3515);
    assert.equal(r.json.cambio, 1485);
    assert.equal(stockDe(s.db, 1), 8);
    await new Promise((r) => setImmediate(r));
    assert.equal(s.impresiones.length, 1);
  } finally { s.cerrar(); }
});

test('validación en el servidor: cantidad decimal, negativa, sin items, método inválido', async () => {
  const s = await levantar();
  try {
    const pago = [{ metodo: 'efectivo', monto: 5000 }];
    assert.equal((await s.pedir('POST', '/ventas', { items: [{ producto_id: 1, cantidad: 1.5 }], pagos: pago })).status, 400);
    assert.equal((await s.pedir('POST', '/ventas', { items: [{ producto_id: 1, cantidad: -1 }], pagos: pago })).status, 400);
    assert.equal((await s.pedir('POST', '/ventas', { items: [], pagos: pago })).status, 400);
    assert.equal((await s.pedir('POST', '/ventas', { items: [{ producto_id: 1, cantidad: 1 }], pagos: [{ metodo: 'cheque', monto: 5000 }] })).status, 400);
    assert.equal(stockDe(s.db, 1), 10);
  } finally { s.cerrar(); }
});

test('pago insuficiente -> 400 y no se guarda nada', async () => {
  const s = await levantar();
  try {
    const r = await s.pedir('POST', '/ventas', { items: [{ producto_id: 1, cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.codigo, 'PAGO_INSUFICIENTE');
    assert.equal(s.db.prepare('SELECT COUNT(*) n FROM ventas').get().n, 0);
  } finally { s.cerrar(); }
});

test('catálogo: crear con stock inicial genera kárdex; código duplicado -> 409; desactivar', async () => {
  const s = await levantar();
  try {
    const nuevo = { nombre: 'Chicles', codigo_barras: '', codigo_corto: '200', categoria_id: 1, precio: 500, costo: 200, stock: 12 };
    const c = await s.pedir('POST', '/productos', nuevo);
    assert.equal(c.status, 201);
    assert.equal(c.json.codigo_barras, null);
    assert.equal(c.json.stock, 12);
    assert.equal(s.db.prepare("SELECT COUNT(*) n FROM movimientos_inventario WHERE tipo='ajuste' AND producto_id=?").get(c.json.id).n, 1);

    const dup = await s.pedir('POST', '/productos', { ...nuevo, nombre: 'Otro', codigo_corto: '101' }); // 101 ya es de Refresco
    assert.equal(dup.status, 409);

    assert.equal((await s.pedir('DELETE', `/productos/${c.json.id}`)).status, 204);
    assert.equal((await s.pedir('GET', '/productos/codigo/200')).status, 404); // desactivado no se escanea
  } finally { s.cerrar(); }
});

test('PUT /productos no puede cambiar el stock (solo el kárdex lo mueve)', async () => {
  const s = await levantar();
  try {
    const r = await s.pedir('PUT', '/productos/1', { nombre: 'Refresco', precio: 2000, stock: 9999, codigo_corto: '101', codigo_barras: '7501000000001' });
    assert.equal(r.status, 200);
    assert.equal(r.json.precio, 2000);
    assert.equal(stockDe(s.db, 1), 10);
  } finally { s.cerrar(); }
});

test('búsqueda por HTTP y errores JSON limpios', async () => {
  const s = await levantar();
  try {
    assert.equal((await s.pedir('GET', '/productos/buscar?q=galetas')).json[0].nombre, 'Galletas');
    const r = await s.pedir('GET', '/nada');
    assert.equal(r.status, 404);
    assert.equal(r.json.error.codigo, 'RUTA_NO_ENCONTRADA');
  } finally { s.cerrar(); }
});

test('inventario: ajuste por HTTP, kárdex y validaciones', async () => {
  const s = await levantar();
  try {
    const ok = await s.pedir('POST', '/inventario/ajustes', { producto_id: 1, modo: 'entrada', cantidad: 5, motivo: 'error_captura', nota: ' faltaban ' });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.stock_nuevo, 15);
    assert.equal(stockDe(s.db, 1), 15);

    const k = await s.pedir('GET', '/inventario/kardex?producto_id=1&tipo=ajuste');
    assert.equal(k.status, 200);
    assert.equal(k.json.filas[0].nota, 'faltaban');
    assert.equal(k.json.filas[0].motivo, 'error_captura');

    assert.equal((await s.pedir('POST', '/inventario/ajustes', { producto_id: 1, modo: 'entrada', cantidad: 0, motivo: 'merma' })).status, 400);
    assert.equal((await s.pedir('POST', '/inventario/ajustes', { producto_id: 1, modo: 'entrada', cantidad: 1.5, motivo: 'merma' })).status, 400);
    assert.equal((await s.pedir('POST', '/inventario/ajustes', { producto_id: 1, modo: 'entrada', cantidad: 1, motivo: 'inventado' })).status, 400);
    assert.equal((await s.pedir('POST', '/inventario/ajustes', { producto_id: 1, modo: 'entrada', cantidad: 1, motivo: 'otro' })).json.error.codigo, 'NOTA_REQUERIDA');
    assert.equal((await s.pedir('GET', '/inventario/kardex?desde=ayer')).status, 400);
    assert.equal((await s.pedir('GET', '/inventario/motivos')).json.length, 8);
    // el helper mete stock sin kárdex, así que el verificador debe avisar
    assert.equal((await s.pedir('GET', '/inventario/verificar')).json.consistente, false);
  } finally { s.cerrar(); }
});

test('GET /inventario/stock-bajo devuelve resumen y lista', async () => {
  const s = await levantar();
  try {
    s.db.prepare('UPDATE productos SET stock_minimo = 5, stock = 2 WHERE id = 2').run();
    const r = await s.pedir('GET', '/inventario/stock-bajo');
    assert.equal(r.status, 200);
    assert.equal(r.json.total, 1);
    assert.equal(r.json.productos[0].nombre, 'Galletas');
    assert.equal(r.json.productos[0].faltante, 3);
  } finally { s.cerrar(); }
});


// ================= Autenticación y permisos =================

test('sin sesión: rutas protegidas devuelven 401; las públicas responden', async () => {
  const s = await levantar({ sinSesion: true });
  try {
    for (const [m, r] of [['GET', '/productos'], ['GET', '/categorias'], ['POST', '/ventas'], ['GET', '/inventario/kardex'], ['GET', '/usuarios'], ['GET', '/config']]) {
      const x = await s.crudo(m, r, m === 'POST' ? {} : undefined);
      assert.equal(x.status, 401, `${m} ${r}`);
      assert.equal(x.json.error.codigo, 'SESION_REQUERIDA');
    }
    const e = await s.crudo('GET', '/auth/estado');
    assert.equal(e.status, 200);
    assert.equal(e.json.necesita_setup, true);
    assert.equal(e.json.usuario, null);
  } finally { s.cerrar(); }
});

test('setup por HTTP: crea al dueño, abre sesión con cookie segura y se cierra la puerta', async () => {
  const s = await levantar({ sinSesion: true });
  try {
    const r = await s.crudo('POST', '/auth/setup', { nombre: 'Ana', contrasena: 'contraseña-larga' });
    assert.equal(r.status, 200);
    assert.equal(r.json.usuario.rol, 'dueño');
    assert.match(r.setCookie, /zenit_sid=/);
    assert.match(r.setCookie, /HttpOnly/);
    assert.match(r.setCookie, /SameSite=Strict/);
    assert.equal((await s.crudo('GET', '/productos', undefined, { cookie: r.setCookie.split(';')[0] })).status, 200);
    assert.equal((await s.crudo('POST', '/auth/setup', { nombre: 'Intruso', contrasena: 'contraseña-larga' })).status, 409);
    const e = await s.crudo('GET', '/auth/estado');
    assert.equal(e.json.necesita_setup, false);
    assert.deepEqual(e.json.usuarios.map((u) => u.nombre), ['Ana']);
    assert.ok(!('contrasena_hash' in e.json.usuarios[0]) && !('rol' in e.json.usuarios[0]));
  } finally { s.cerrar(); }
});

test('login por HTTP: contraseña mala = 401 sin cookie; logout invalida la sesión', async () => {
  const s = await levantar({ sinSesion: true });
  try {
    const id = Number(await crearUsuario(s.db, 'Beto', 'cajero', '4321'));
    const mal = await s.crudo('POST', '/auth/login', { usuario_id: id, contrasena: 'x' });
    assert.equal(mal.status, 401);
    assert.equal(mal.setCookie, null);
    const ok = await s.crudo('POST', '/auth/login', { usuario_id: id, contrasena: '4321' });
    const cookie = ok.setCookie.split(';')[0];
    assert.equal((await s.crudo('GET', '/auth/yo', undefined, { cookie })).json.usuario.nombre, 'Beto');
    assert.equal((await s.crudo('POST', '/auth/logout', undefined, { cookie })).status, 204);
    assert.equal((await s.crudo('GET', '/auth/yo', undefined, { cookie })).status, 401);
  } finally { s.cerrar(); }
});

test('cajero: puede vender y consultar, pero NO escribir catálogo, ajustar, ver kárdex ni gestionar usuarios (403)', async () => {
  const s = await levantar();
  try {
    const caj = await s.como('Beto', 'cajero');
    assert.equal((await caj('GET', '/productos')).status, 200);
    assert.equal((await caj('GET', '/inventario/stock-bajo')).status, 200);
    assert.equal((await caj('POST', '/ventas', { items: [{ producto_id: 1, cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 1850 }] })).status, 201);
    const prohibidas = [
      ['POST', '/productos', { nombre: 'X', precio: 100 }], ['PUT', '/productos/1', { nombre: 'X', precio: 100 }], ['DELETE', '/productos/1'],
      ['POST', '/categorias', { nombre: 'Nueva' }], ['DELETE', '/categorias/1'],
      ['POST', '/inventario/ajustes', { producto_id: 1, modo: 'entrada', cantidad: 1, motivo: 'merma' }],
      ['GET', '/inventario/kardex'], ['GET', '/inventario/verificar'], ['GET', '/inventario/motivos'],
      ['GET', '/usuarios'], ['POST', '/usuarios', { nombre: 'Zed', rol: 'dueño', contrasena: 'abcdefgh1' }], ['PUT', '/usuarios/1', { nombre: 'A', rol: 'cajero', activo: true }],
      ['POST', '/usuarios/1/contrasena', { contrasena: 'abcdefgh1' }],
    ];
    for (const [m, r, c] of prohibidas) {
      const x = await caj(m, r, c);
      assert.equal(x.status, 403, `${m} ${r}`);
      assert.equal(x.json.error.codigo, 'PROHIBIDO');
    }
    assert.equal(stockDe(s.db, 1), 9); // solo la venta permitida movió el stock
  } finally { s.cerrar(); }
});

test('el cajero NO recibe el costo de los productos; el dueño sí', async () => {
  const s = await levantar();
  try {
    const caj = await s.como('Beto', 'cajero');
    const rutas = ['/productos', '/productos/1', '/productos/codigo/101', '/productos/botones-rapidos', '/productos/buscar?q=refresco'];
    for (const r of rutas) {
      const c = (await caj('GET', r)).json; const lista = Array.isArray(c) ? c : [c];
      lista.forEach((p) => assert.ok(!('costo' in p), `cajero ve costo en ${r}`));
      const d = (await s.pedir('GET', r)).json; (Array.isArray(d) ? d : [d]).forEach((p) => assert.ok('costo' in p, `dueño sin costo en ${r}`));
    }
  } finally { s.cerrar(); }
});

test('el cajero no ve productos desactivados aunque lo pida; el dueño sí', async () => {
  const s = await levantar();
  try {
    s.db.prepare('UPDATE productos SET activo = 0 WHERE id = 2').run();
    const caj = await s.como('Beto', 'cajero');
    assert.equal((await caj('GET', '/productos?incluir_inactivos=1')).json.length, 2);
    assert.equal((await s.pedir('GET', '/productos?incluir_inactivos=1')).json.length, 3);
  } finally { s.cerrar(); }
});

test('la venta y el ajuste guardan QUIÉN los hizo; el kárdex y el ticket lo muestran', async () => {
  const s = await levantar();
  try {
    const caj = await s.como('Beto', 'cajero');
    const v = await caj('POST', '/ventas', { items: [{ producto_id: 1, cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 1850 }] });
    assert.equal(v.json.usuario_id, caj.id);
    assert.equal(v.json.usuario_nombre, 'Beto');
    await s.pedir('POST', '/inventario/ajustes', { producto_id: 1, modo: 'entrada', cantidad: 3, motivo: 'error_captura' });
    const k = (await s.pedir('GET', '/inventario/kardex?producto_id=1')).json.filas;
    assert.deepEqual(k.map((f) => [f.tipo, f.usuario_nombre]), [['ajuste', 'Ana'], ['venta', 'Beto']]);
    await new Promise((r) => setImmediate(r));
    assert.equal(s.impresiones[0].usuario_nombre, 'Beto');
  } finally { s.cerrar(); }
});

test('gestión de usuarios por el dueño: crear, editar, restablecer; la sesión del desactivado cae', async () => {
  const s = await levantar();
  try {
    const c = await s.pedir('POST', '/usuarios', { nombre: 'Beto', rol: 'cajero', contrasena: '4321' });
    assert.equal(c.status, 201);
    assert.ok(!('contrasena_hash' in c.json));
    assert.equal((await s.pedir('POST', '/usuarios', { nombre: 'beto', rol: 'cajero', contrasena: '4321' })).status, 409);
    assert.equal((await s.pedir('POST', '/usuarios', { nombre: 'Corto', rol: 'cajero', contrasena: '12' })).json.error.codigo, 'CONTRASENA_DEBIL');
    const lista = (await s.pedir('GET', '/usuarios')).json;
    lista.forEach((u) => assert.ok(!('contrasena_hash' in u)));

    const beto = await s.crudo('POST', '/auth/login', { usuario_id: c.json.id, contrasena: '4321' });
    const cookieBeto = beto.setCookie.split(';')[0];
    assert.equal((await s.pedir('PUT', `/usuarios/${c.json.id}`, { nombre: 'Beto', rol: 'cajero', activo: false })).status, 200);
    assert.equal((await s.crudo('GET', '/auth/yo', undefined, { cookie: cookieBeto })).status, 401);
    assert.equal((await s.pedir('PUT', `/usuarios/${s.dueno.id}`, { nombre: 'Ana', rol: 'dueño', activo: false })).json.error.codigo, 'AUTO_DESACTIVACION');
  } finally { s.cerrar(); }
});

test('cambiar la propia contraseña por HTTP', async () => {
  const s = await levantar();
  try {
    const caj = await s.como('Beto', 'cajero');
    assert.equal((await caj('POST', '/auth/contrasena', { actual: 'incorrecta', nueva: '5555' })).status, 400);
    assert.equal((await caj('POST', '/auth/contrasena', { actual: '4321', nueva: '5555' })).status, 204);
    const r = await s.crudo('POST', '/auth/login', { usuario_id: caj.id, contrasena: '5555' });
    assert.equal(r.status, 200);
  } finally { s.cerrar(); }
});

test('petición con Origin de otro sitio se rechaza (anti-CSRF); con el mismo origen pasa', async () => {
  const s = await levantar();
  try {
    const cuerpo = { items: [{ producto_id: 1, cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 1850 }] };
    const mala = await s.crudo('POST', '/ventas', cuerpo, { cookie: s.dueno.cookie, headers: { origin: 'http://sitio-malo.example' } });
    assert.equal(mala.status, 403);
    assert.equal(mala.json.error.codigo, 'ORIGEN_INVALIDO');
    assert.equal(stockDe(s.db, 1), 10);
    const buena = await s.crudo('POST', '/ventas', cuerpo, { cookie: s.dueno.cookie, headers: { origin: `http://${s.host}` } });
    assert.equal(buena.status, 201);
    assert.equal(stockDe(s.db, 1), 9);
  } finally { s.cerrar(); }
});
