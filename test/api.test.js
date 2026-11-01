'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { crearApp } = require('../src/app');
const { crearBaseDePrueba, stockDe } = require('./helpers');

const config = {
  raiz: path.join(__dirname, '..'), mayoreoPorcentaje: 5,
  negocio: { nombre: 'Luna de precios', direccion: '', leyenda: '' },
  impresora: { modo: 'console', columnas: 48 },
};

async function levantar() {
  const db = crearBaseDePrueba();
  const impresiones = [];
  const impresora = { imprimirVenta: async (v) => { impresiones.push(v); return { impreso: true }; } };
  const servidor = crearApp({ db, config, impresora }).listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  const base = `http://127.0.0.1:${servidor.address().port}/api`;
  const pedir = async (metodo, ruta, cuerpo) => {
    const res = await fetch(base + ruta, { method: metodo, headers: { 'content-type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const texto = await res.text();
    return { status: res.status, json: texto ? JSON.parse(texto) : null };
  };
  return { db, pedir, impresiones, cerrar: () => servidor.close() };
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
