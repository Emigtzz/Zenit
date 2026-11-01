'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearNube, venta, lote } = require('./nube-helpers');

const subir = (c, neg, inst, l, extra = {}) => c.rpc('sincronizar', [neg, inst, JSON.stringify(l.ventas), JSON.stringify(l.detalle), JSON.stringify(l.pagos), JSON.stringify(extra.cortes || []), extra.estado ? JSON.stringify(extra.estado) : null]);
const rechaza = async (p) => { try { await p; return null; } catch (e) { return e.message; } };

test('el esquema se puede ejecutar dos veces seguidas sin romperse (idempotente)', async () => {
  const nube = await crearNube();
  try {
    const fs = require('node:fs'); const sql = fs.readFileSync(require('node:path').join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
    await nube.db.exec(sql);
    await nube.db.exec(sql);
    assert.equal((await nube.db.query('select public.version_esquema() v')).rows[0].v, 1);
  } finally { await nube.cerrar(); }
});

test('la CAJA sube un lote completo (ventas, líneas, pagos, corte y latido) y puede repetirlo sin duplicar', async () => {
  const nube = await crearNube(); const ids = await nube.sembrar();
  try {
    const caja = nube.como(ids.cajaA);
    const l = lote(venta(1, { fecha: '2026-11-02T15:30:00Z', total: 3700 }), venta(2, { fecha: '2026-11-02T16:00:00Z', total: 1200, pagos: [{ metodo: 'tarjeta', monto: 1200 }] }));
    const corte = { id_local: 1, apertura: '2026-11-02T14:00:00Z', cierre: '2026-11-02T23:00:00Z', usuario_apertura: 'Ana', usuario_cierre: 'Beto', fondo_inicial: 50000, efectivo_esperado: 53700, efectivo_contado: 53700, diferencia: 0, num_ventas: 2, total_ventas: 4900 };
    const estado = { caja: { abierta: false }, ultimo_corte: { id: 1 }, stock_bajo: { total: 0 }, version: '1.0.0' };
    assert.deepEqual(await subir(caja, ids.negA, ids.instA, l, { cortes: [corte], estado }), { ventas: 2, cortes: 1 });
    assert.deepEqual(await subir(caja, ids.negA, ids.instA, l, { cortes: [corte], estado }), { ventas: 2, cortes: 1 }); // reintento: mismas filas, no el doble
    const c = (t) => nube.db.query(`select count(*)::int n from ${t}`).then((r) => r.rows[0].n);
    assert.deepEqual([await c('ventas'), await c('venta_detalle'), await c('pagos'), await c('cortes'), await c('estado_negocio')], [2, 2, 2, 1, 1]);
    const e = (await nube.db.query('select latido, stock_bajo, version from estado_negocio')).rows[0];
    assert.ok(Math.abs(Date.now() - new Date(e.latido).getTime()) < 60000); // el latido lo pone el SERVIDOR
    assert.equal(e.version, '1.0.0');
  } finally { await nube.cerrar(); }
});

test('un reintento ACTUALIZA lo que cambió (una venta que pasa a cancelada) en vez de ignorarlo', async () => {
  const nube = await crearNube(); const ids = await nube.sembrar();
  try {
    const caja = nube.como(ids.cajaA);
    await subir(caja, ids.negA, ids.instA, lote(venta(1, { fecha: '2026-11-02T15:30:00Z', total: 3700 })));
    await subir(caja, ids.negA, ids.instA, lote(venta(1, { fecha: '2026-11-02T15:30:00Z', total: 3700, estado: 'cancelada' })));
    assert.equal((await nube.db.query('select estado from ventas')).rows[0].estado, 'cancelada');
  } finally { await nube.cerrar(); }
});

test('la instalación evita pisar historial: una caja reinstalada (ids desde 1 otra vez) suma, no sobrescribe', async () => {
  const nube = await crearNube(); const ids = await nube.sembrar();
  try {
    const caja = nube.como(ids.cajaA);
    await subir(caja, ids.negA, ids.instA, lote(venta(1, { fecha: '2026-11-01T15:30:00Z', total: 1111 })));
    await subir(caja, ids.negA, '00000000-0000-4000-8000-000000000002', lote(venta(1, { fecha: '2026-11-02T15:30:00Z', total: 2222 })));
    assert.deepEqual((await nube.db.query('select total::int t from ventas order by total')).rows.map((r) => r.t), [1111, 2222]);
  } finally { await nube.cerrar(); }
});

test('un lote que falla a la mitad NO deja nada: es atómico', async () => {
  const nube = await crearNube(); const ids = await nube.sembrar();
  try {
    const caja = nube.como(ids.cajaA);
    const bueno = venta(1, { fecha: '2026-11-02T15:30:00Z', total: 3700 });
    const malo = venta(2, { fecha: '2026-11-02T16:00:00Z', total: 1200, pagos: [{ metodo: 'cheque', monto: 1200 }] }); // método inválido -> viola el CHECK
    assert.ok(await rechaza(subir(caja, ids.negA, ids.instA, lote(bueno, malo))));
    assert.equal((await nube.db.query('select count(*)::int n from ventas')).rows[0].n, 0);
    assert.equal((await nube.db.query('select count(*)::int n from venta_detalle')).rows[0].n, 0);
  } finally { await nube.cerrar(); }
});

test('el DUEÑO solo lee: no puede subir lotes ni insertar, actualizar ni borrar', async () => {
  const nube = await crearNube(); const ids = await nube.sembrar();
  try {
    await subir(nube.como(ids.cajaA), ids.negA, ids.instA, lote(venta(1, { fecha: '2026-11-02T15:30:00Z', total: 3700 })));
    const dueno = nube.como(ids.duenoA);
    assert.equal((await dueno.query('select count(*)::int n from ventas')).rows[0].n, 1);       // sí ve
    assert.match(await rechaza(subir(dueno, ids.negA, ids.instA, lote(venta(9, { fecha: '2026-11-02T15:30:00Z' })))), /row-level security|permission/i);
    // un UPDATE que la RLS no permite no da error: simplemente no toca ninguna fila
    assert.equal((await dueno.query('update ventas set total = 1')).affectedRows, 0);
    assert.equal((await nube.db.query('select total::int t from ventas')).rows[0].t, 3700);     // el UPDATE no cambió nada
    assert.ok(await rechaza(dueno.query('delete from ventas')));                                  // sin permiso de DELETE
    assert.equal((await nube.db.query('select count(*)::int n from ventas')).rows[0].n, 1);
  } finally { await nube.cerrar(); }
});

test('la CAJA no puede borrar y no puede escribir en el negocio de otro', async () => {
  const nube = await crearNube(); const ids = await nube.sembrar();
  try {
    const caja = nube.como(ids.cajaA);
    await subir(caja, ids.negA, ids.instA, lote(venta(1, { fecha: '2026-11-02T15:30:00Z', total: 3700 })));
    assert.ok(await rechaza(caja.query('delete from ventas')));
    assert.match(await rechaza(subir(caja, ids.negB, ids.instA, lote(venta(5, { fecha: '2026-11-02T15:30:00Z' })))), /row-level security/i);
    assert.equal((await nube.db.query('select count(*)::int n from ventas where negocio_id = $1', [ids.negB])).rows[0].n, 0);
  } finally { await nube.cerrar(); }
});

test('aislamiento entre negocios: cada quien ve SOLO lo suyo, y el intruso nada', async () => {
  const nube = await crearNube(); const ids = await nube.sembrar();
  try {
    await subir(nube.como(ids.cajaA), ids.negA, ids.instA, lote(venta(1, { fecha: '2026-11-02T15:30:00Z', total: 1000 })));
    await subir(nube.como(ids.cajaB), ids.negB, ids.instB, lote(venta(1, { fecha: '2026-11-02T15:30:00Z', total: 2000 }), venta(2, { fecha: '2026-11-02T16:30:00Z', total: 3000 })));
    const n = async (u, t) => (await nube.como(u).query(`select count(*)::int n from ${t}`)).rows[0].n;
    assert.equal(await n(ids.duenoA, 'ventas'), 1);
    assert.equal(await n(ids.duenoB, 'ventas'), 2);
    assert.equal(await n(ids.cajaA, 'venta_detalle'), 1);
    assert.equal(await n(ids.intruso, 'ventas'), 0);
    assert.equal(await n(ids.intruso, 'negocios'), 0);
    assert.equal(await n(ids.duenoA, 'negocios'), 1);
    assert.equal(await n(ids.cajaA, 'miembros'), 1);   // solo su propia membresía
  } finally { await nube.cerrar(); }
});

test('el rol ANÓNIMO no puede leer tablas ni llamar funciones', async () => {
  const nube = await crearNube(); const ids = await nube.sembrar();
  try {
    await subir(nube.como(ids.cajaA), ids.negA, ids.instA, lote(venta(1, { fecha: '2026-11-02T15:30:00Z' })));
    const anon = nube.como(null);
    for (const t of ['ventas', 'negocios', 'miembros', 'estado_negocio', 'cortes', 'pagos', 'venta_detalle']) {
      assert.match(await rechaza(anon.query(`select * from ${t}`)), /permission denied/i, t);
    }
    assert.match(await rechaza(anon.query('select public.estado_dueno($1)', [ids.negA])), /permission denied/i);
    assert.match(await rechaza(anon.query('select public.version_esquema()')), /permission denied/i);
  } finally { await nube.cerrar(); }
});

test('estado_dueno: solo el DUEÑO de ese negocio (la caja y otros, no)', async () => {
  const nube = await crearNube(); const ids = await nube.sembrar();
  try {
    assert.ok((await nube.como(ids.duenoA).rpc('estado_dueno', [ids.negA, '2026-11-02'])).resumen);
    for (const u of [ids.cajaA, ids.intruso, ids.duenoB]) assert.match(await rechaza(nube.como(u).rpc('estado_dueno', [ids.negA, '2026-11-02'])), /No tienes permiso/);
  } finally { await nube.cerrar(); }
});

test('estado_dueno: día en la zona del negocio (23:59 y 00:00 locales), método, hora, comparativo, serie y top', async () => {
  const nube = await crearNube(); const ids = await nube.sembrar();
  try {
    const V = (id, fecha, total, opts = {}) => venta(id, { fecha, total, ...opts });
    const caja = nube.como(ids.cajaA);
    await subir(caja, ids.negA, ids.instA, lote(
      V(1, '2026-11-02T15:30:00Z', 3700, { lineas: [{ producto: 1, nombre: 'Refresco', cantidad: 2, precio: 1850 }] }),
      V(2, '2026-11-02T15:45:00Z', 1200, { lineas: [{ producto: 2, nombre: 'Galletas', cantidad: 1, precio: 1200 }], pagos: [{ metodo: 'tarjeta', monto: 1200 }] }),
      V(3, '2026-11-03T05:59:00Z', 4750, { descuento: 250, lineas: [{ producto: 3, nombre: 'Hielo', cantidad: 2, precio: 2500 }], pagos: [{ metodo: 'efectivo', monto: 3000 }, { metodo: 'transferencia', monto: 1750 }] }),
      V(4, '2026-11-03T06:00:00Z', 1850, { lineas: [{ producto: 1, nombre: 'Refresco', cantidad: 1, precio: 1850 }] }),         // 00:00 del 3: mañana
      V(5, '2026-11-02T10:00:00Z', 16650, { estado: 'cancelada', lineas: [{ producto: 1, nombre: 'Refresco', cantidad: 9, precio: 1850 }] }), // cancelada
      V(6, '2026-11-02T05:59:00Z', 1200, { lineas: [{ producto: 2, nombre: 'Galletas', cantidad: 1, precio: 1200 }] }),           // 23:59 del 1: ayer
      V(7, '2026-10-26T18:00:00Z', 1200, { lineas: [{ producto: 2, nombre: 'Galletas', cantidad: 1, precio: 1200 }] }),           // semana pasada
      V(8, '2026-10-30T18:00:00Z', 6000, { lineas: [{ producto: 2, nombre: 'Galletas', cantidad: 5, precio: 1200 }] }),
    ));
    const r = await nube.como(ids.duenoA).rpc('estado_dueno', [ids.negA, '2026-11-02']);
    assert.equal(r.zona_horaria, 'America/Mexico_City');
    const x = r.resumen;
    assert.deepEqual([x.num_ventas, x.total, x.subtotal, x.descuentos, x.piezas], [3, 9650, 9900, 250, 5]);
    assert.equal(x.ticket_promedio, Math.round(9650 / 3));
    assert.deepEqual(x.por_metodo, { efectivo: 3700 + 3000, tarjeta: 1200, transferencia: 1750 });
    assert.equal(x.por_hora.length, 24);
    assert.deepEqual([x.por_hora[9].num_ventas, x.por_hora[9].total, x.por_hora[23].num_ventas, x.por_hora[23].total], [2, 4900, 1, 4750]);
    assert.deepEqual(r.comparativo.ayer, { dia: '2026-11-01', num_ventas: 1, total: 1200 });
    assert.deepEqual(r.comparativo.semana_pasada, { dia: '2026-10-26', num_ventas: 1, total: 1200 });
    assert.equal(r.serie.length, 30);
    assert.deepEqual([r.serie[0].dia, r.serie[29].dia], ['2026-10-04', '2026-11-02']);
    assert.deepEqual(r.serie[29], { dia: '2026-11-02', num_ventas: 3, total: 9650 });
    assert.equal(r.serie.find((s) => s.dia === '2026-10-10').total, 0);
    assert.deepEqual([r.top.desde, r.top.hasta], ['2026-10-27', '2026-11-02']);
    assert.deepEqual(r.top.por_piezas.map((p) => [p.producto_id, p.nombre, p.piezas]), [[2, 'Galletas', 7], [3, 'Hielo', 2], [1, 'Refresco', 2]]); // empate 2-2 en piezas: gana el de más importe
  } finally { await nube.cerrar(); }
});

test('estado_dueno sin día usa "hoy" de la zona del negocio y negocio vacío devuelve ceros, no error', async () => {
  const nube = await crearNube(); const ids = await nube.sembrar();
  try {
    const r = await nube.como(ids.duenoA).rpc('estado_dueno', [ids.negA, null]);
    assert.match(r.dia, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual([r.resumen.num_ventas, r.resumen.total, r.resumen.ticket_promedio], [0, 0, 0]);
    assert.deepEqual(r.top.por_piezas, []);
    assert.equal(r.serie.length, 30);
  } finally { await nube.cerrar(); }
});
