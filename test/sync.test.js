'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const syncService = require('../src/sync/syncService');
const { construirLote, contarPendientes, marcarSubido } = require('../src/sync/payload');
const { ErrorNube } = require('../src/sync/errores');
const estadisticasService = require('../src/services/estadisticasService');
const corteService = require('../src/services/corteService');
const inventarioService = require('../src/services/inventarioService');
const ventaService = require('../src/services/ventaService');
const { crearBaseDePrueba } = require('./helpers');
const { crearNube } = require('./nube-helpers');

const MX = 'America/Mexico_City';

// Base de prueba con un usuario (id 1) para poder abrir la caja y firmar ventas
function baseConUsuario() {
  const db = crearBaseDePrueba({ cajaAbierta: false });
  db.prepare("INSERT INTO usuarios (nombre, rol, contrasena_hash) VALUES ('Ana','dueño','x')").run();
  return db;
}

// "Nube" de prueba: llama a la función SQL REAL `sincronizar` en un Postgres real, con la sesión del usuario de la caja (RLS incluida).
function nubeConPostgres(nube, ids, { falla } = {}) {
  const llamadas = [];
  return {
    llamadas,
    async subir({ instalacion_id, lote, cortes, estado }) {
      llamadas.push({ ventas: lote.ventas.length });
      if (falla) throw falla();
      return nube.como(ids.cajaA).rpc('sincronizar', [ids.negA, instalacion_id, JSON.stringify(lote.ventas), JSON.stringify(lote.detalle), JSON.stringify(lote.pagos), JSON.stringify(cortes), JSON.stringify(estado)]);
    },
  };
}
function montar(db, nubeAdaptador, zona = MX) {
  const corte = corteService(db), inventario = inventarioService(db);
  const estadisticas = estadisticasService(db, { zona, corte, inventario });
  return { sync: syncService(db, { nube: nubeAdaptador, estadisticas, version: 'test', programar: () => null }), estadisticas, corte };
}

// Ventas deterministas repartidas en varios días, con canceladas, pagos mixtos, mayoreo y horas de todo el día.
function generarVentas(db, { desde = '2026-09-20', dias = 44, semilla = 12345 } = {}) {
  let s = semilla; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const ins = db.prepare("INSERT INTO productos (nombre, categoria_id, costo, precio, stock) VALUES (?, 1, 100, ?, 100)");
  for (let i = 4; i <= 15; i++) ins.run(`Producto ${i}`, 500 + i * 137);
  const prods = db.prepare('SELECT id, precio FROM productos').all();
  const iv = db.prepare("INSERT INTO ventas (fecha, subtotal, descuento_mayoreo, total, cambio, estado, sincronizada) VALUES (?, ?, ?, ?, 0, ?, 0)");
  const id_ = db.prepare('INSERT INTO venta_detalle (venta_id, producto_id, cantidad, precio_unitario, importe) VALUES (?, ?, ?, ?, ?)');
  const ip = db.prepare('INSERT INTO pagos (venta_id, metodo, monto) VALUES (?, ?, ?)');
  const base = Date.parse(`${desde}T00:00:00Z`);
  let total = 0;
  db.transaction(() => {
    for (let d = 0; d < dias; d++) {
      const n = Math.floor(rnd() * 40);
      for (let i = 0; i < n; i++) {
        const fecha = new Date(base + d * 86400000 + Math.floor(rnd() * 86400000)).toISOString(); // cualquier hora UTC: cruza medianoches locales
        const L = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => { const p = prods[Math.floor(rnd() * prods.length)]; return [p.id, 1 + Math.floor(rnd() * 3), p.precio]; });
        const sub = L.reduce((a, [, c, pr]) => a + c * pr, 0);
        const desc = rnd() < 0.2 ? Math.floor(sub * 0.05) : 0;
        const estado = rnd() < 0.05 ? 'cancelada' : 'completada';
        const id = iv.run(fecha, sub, desc, sub - desc, estado).lastInsertRowid;
        for (const [pid, c, pr] of L) id_.run(id, pid, c, pr, c * pr);
        const t = sub - desc;
        const m = rnd();
        if (m < 0.6) ip.run(id, 'efectivo', t);
        else if (m < 0.8) ip.run(id, 'tarjeta', t);
        else { const a = Math.floor(t / 3); ip.run(id, 'efectivo', t - a); ip.run(id, 'transferencia', a); }
        total++;
      }
    }
  })();
  return total;
}

test('migración 007: instalacion_id (UUID v4, una sola fila) y bandera en cortes', () => {
  const db = crearBaseDePrueba({ cajaAbierta: false });
  const f = db.prepare('SELECT * FROM sync_estado').all();
  assert.equal(f.length, 1);
  assert.match(f[0].instalacion_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.throws(() => db.prepare('INSERT INTO sync_estado (id, instalacion_id) VALUES (2, ?)').run('x'));
  const otra = crearBaseDePrueba({ cajaAbierta: false });
  assert.notEqual(otra.prepare('SELECT instalacion_id i FROM sync_estado').get().i, f[0].instalacion_id); // cada base tiene el suyo
});

test('lote: forma exacta, líneas y pagos numerados, nombre del cajero y categoría; solo pendientes', () => {
  const db = crearBaseDePrueba({ cajaAbierta: false });
  db.prepare("INSERT INTO usuarios (nombre, rol, contrasena_hash) VALUES ('Beto','cajero','x')").run();
  corteService(db).abrir({ fondo_inicial: 0 }, 1);
  const v = ventaService(db).crear({ items: [{ producto_id: 1, cantidad: 2 }, { producto_id: 2, cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 2000 }, { metodo: 'tarjeta', monto: 2900 }], mayoreo: false }, { usuarioId: 1 });
  const l = construirLote(db);
  assert.equal(l.ventas.length, 1);
  assert.deepEqual(Object.keys(l.ventas[0]).sort(), ['cambio', 'corte_id_local', 'descuento_mayoreo', 'estado', 'fecha', 'id_local', 'subtotal', 'total', 'usuario_nombre']);
  assert.equal(l.ventas[0].usuario_nombre, 'Beto');
  assert.deepEqual(l.detalle.map((d) => [d.venta_id_local, d.linea, d.producto_nombre, d.categoria, d.cantidad]), [[v.id, 1, 'Refresco 600ml', 'Abarrotes', 2], [v.id, 2, 'Galletas', 'Abarrotes', 1]]);
  assert.deepEqual(l.pagos.map((p) => [p.n, p.metodo]), [[1, 'efectivo'], [2, 'tarjeta']]);
  marcarSubido(db, l._marcas);
  assert.equal(construirLote(db).ventas.length, 0);
  assert.deepEqual(contarPendientes(db), { ventas: 0, cortes: 0 });
});

test('marcar como subido NO marca lo que cambió mientras se subía (se volverá a subir)', () => {
  const db = baseConUsuario();
  corteService(db).abrir({ fondo_inicial: 0 }, 1);
  const v = ventaService(db).crear({ items: [{ producto_id: 1, cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 1850 }], mayoreo: false });
  const l = construirLote(db);
  db.prepare("UPDATE ventas SET estado = 'cancelada' WHERE id = ?").run(v.id);   // se cancela justo mientras "se sube"
  marcarSubido(db, l._marcas);
  assert.equal(db.prepare('SELECT sincronizada s FROM ventas').get().s, 0);
});

test('ciclo: sube todo a la nube, marca lo subido y el siguiente ciclo solo manda el latido', async () => {
  const nube = await crearNube(); const ids = await nube.sembrar();
  try {
    const db = baseConUsuario();
    corteService(db).abrir({ fondo_inicial: 1000 }, 1);
    for (let i = 0; i < 3; i++) ventaService(db).crear({ items: [{ producto_id: 1, cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 1850 }], mayoreo: false });
    const adaptador = nubeConPostgres(nube, ids);
    const { sync } = montar(db, adaptador);
    assert.equal(sync.estado().pendientes.ventas, 3);
    assert.equal(sync.estado().situacion, 'pendiente');
    const r = await sync.ciclo();
    assert.deepEqual(r, { estado: 'ok', ventas_subidas: 3 });
    assert.equal(sync.estado().pendientes.ventas, 0);
    assert.equal(sync.estado().situacion, 'ok');
    assert.equal(sync.estado().ventas_subidas, 3);
    assert.ok(sync.estado().ultimo_exito);
    assert.equal((await nube.db.query('select count(*)::int n from ventas')).rows[0].n, 3);
    const caja1 = (await nube.db.query('select caja, latido from estado_negocio')).rows[0];
    assert.equal(caja1.caja.abierta, true);
    assert.equal(caja1.caja.fondo_inicial, 1000);
    await new Promise((r2) => setTimeout(r2, 20));
    assert.deepEqual(await sync.ciclo(), { estado: 'ok', ventas_subidas: 0 });
    assert.equal((await nube.db.query('select count(*)::int n from ventas')).rows[0].n, 3);                 // sin duplicados
    assert.ok(new Date((await nube.db.query('select latido from estado_negocio')).rows[0].latido) > new Date(caja1.latido)); // pero el latido avanzó
  } finally { await nube.cerrar(); }
});

test('más de 200 ventas se suben en varios lotes y llegan completas', async () => {
  const nube = await crearNube(); const ids = await nube.sembrar();
  try {
    const db = crearBaseDePrueba({ cajaAbierta: false });
    const total = generarVentas(db, { dias: 30, semilla: 99 });
    assert.ok(total > 400, `se esperaban >400 ventas y hay ${total}`);
    const adaptador = nubeConPostgres(nube, ids);
    const { sync } = montar(db, adaptador);
    const r = await sync.ciclo();
    assert.equal(r.ventas_subidas, total);
    assert.ok(adaptador.llamadas.length >= Math.ceil(total / 200));
    assert.ok(adaptador.llamadas.every((c) => c.ventas <= 200));
    assert.equal((await nube.db.query('select count(*)::int n from ventas')).rows[0].n, total);
    assert.equal((await nube.db.query('select count(*)::int n from venta_detalle')).rows[0].n, db.prepare('SELECT COUNT(*) n FROM venta_detalle').get().n);
    assert.equal((await nube.db.query('select count(*)::int n from pagos')).rows[0].n, db.prepare('SELECT COUNT(*) n FROM pagos').get().n);
  } finally { await nube.cerrar(); }
});

test('SIN INTERNET: el cobro sigue funcionando, lo pendiente se acumula y al volver se sube todo solo', async () => {
  const nube = await crearNube(); const ids = await nube.sembrar();
  try {
    const db = baseConUsuario();
    corteService(db).abrir({ fondo_inicial: 0 }, 1);
    let sinInternet = true;
    const adaptador = { async subir(x) { if (sinInternet) throw new ErrorNube('sin_conexion'); return nubeConPostgres(nube, ids).subir(x); } };
    const { sync } = montar(db, adaptador);
    const vender = () => ventaService(db).crear({ items: [{ producto_id: 1, cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 1850 }], mayoreo: false });

    vender(); vender();
    let r = await sync.ciclo();                                       // no lanza: el error se guarda
    assert.deepEqual([r.estado, r.tipo], ['error', 'sin_conexion']);
    assert.match(r.mensaje, /Sin conexión/);
    vender();                                                         // el cobro NO se entera de que no hay nube
    assert.equal(sync.estado().pendientes.ventas, 3);
    assert.equal(sync.estado().situacion, 'error');
    assert.equal(sync.estado().intentos_fallidos, 1);
    await sync.ciclo();
    assert.equal(sync.estado().intentos_fallidos, 2);

    sinInternet = false;
    assert.equal((await sync.ciclo()).ventas_subidas, 3);
    assert.equal(sync.estado().situacion, 'ok');
    assert.equal(sync.estado().intentos_fallidos, 0);                 // éxito: se limpia el error
    assert.equal(sync.estado().ultimo_error, null);
    assert.equal((await nube.db.query('select count(*)::int n from ventas')).rows[0].n, 3);
  } finally { await nube.cerrar(); }
});

test('si la nube RECHAZA el lote, nada se marca como subido y se reintenta completo (sin huecos)', async () => {
  const nube = await crearNube(); const ids = await nube.sembrar();
  try {
    const db = baseConUsuario();
    corteService(db).abrir({ fondo_inicial: 0 }, 1);
    for (let i = 0; i < 3; i++) ventaService(db).crear({ items: [{ producto_id: 1, cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 1850 }], mayoreo: false });
    db.prepare("UPDATE pagos SET metodo = 'efectivo' WHERE id = 2").run();
    // ids de negocio equivocado: la RLS de la nube rechaza todo el lote
    const mala = { async subir(x) { return nube.como(ids.cajaA).rpc('sincronizar', [ids.negB, x.instalacion_id, JSON.stringify(x.lote.ventas), '[]', '[]', '[]', null]); } };
    const { sync } = montar(db, mala);
    const r = await sync.ciclo();
    assert.equal(r.estado, 'error');
    assert.equal(sync.estado().pendientes.ventas, 3);
    assert.equal((await nube.db.query('select count(*)::int n from ventas')).rows[0].n, 0);
  } finally { await nube.cerrar(); }
});

test('una venta que se cancela DESPUÉS de subirse vuelve a pendiente y la nube se corrige', async () => {
  const nube = await crearNube(); const ids = await nube.sembrar();
  try {
    const db = baseConUsuario();
    corteService(db).abrir({ fondo_inicial: 0 }, 1);
    const v = ventaService(db).crear({ items: [{ producto_id: 1, cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 1850 }], mayoreo: false });
    const { sync } = montar(db, nubeConPostgres(nube, ids));
    await sync.ciclo();
    assert.equal(sync.estado().pendientes.ventas, 0);
    db.prepare("UPDATE ventas SET estado = 'cancelada' WHERE id = ?").run(v.id);
    assert.equal(sync.estado().pendientes.ventas, 1);                  // el disparador la volvió a marcar
    await sync.ciclo();
    assert.equal((await nube.db.query('select estado from ventas')).rows[0].estado, 'cancelada');
    assert.equal(sync.estado().pendientes.ventas, 0);
  } finally { await nube.cerrar(); }
});

test('cortes: solo se suben los CERRADOS; uno corregido después vuelve a pendiente', async () => {
  const nube = await crearNube(); const ids = await nube.sembrar();
  try {
    const db = crearBaseDePrueba({ cajaAbierta: false });
    db.prepare("INSERT INTO usuarios (nombre, rol, contrasena_hash) VALUES ('Ana','dueño','x')").run();
    const { sync, corte } = montar(db, nubeConPostgres(nube, ids));
    corte.abrir({ fondo_inicial: 5000 }, 1);
    await sync.ciclo();
    assert.equal((await nube.db.query('select count(*)::int n from cortes')).rows[0].n, 0);       // el abierto NO se sube como corte
    corte.cerrar({ efectivo_contado: 4800, notas: 'faltaron 2 pesos' }, 1);
    assert.equal(sync.estado().pendientes.cortes, 1);
    await sync.ciclo();
    const c = (await nube.db.query('select usuario_apertura, usuario_cierre, diferencia::int d, notas from cortes')).rows[0];
    assert.deepEqual([c.usuario_apertura, c.usuario_cierre, c.d, c.notas], ['Ana', 'Ana', -200, 'faltaron 2 pesos']);
    assert.equal(sync.estado().pendientes.cortes, 0);
    db.prepare("UPDATE cortes_caja SET notas = 'corregido' WHERE id = 1").run();
    assert.equal(sync.estado().pendientes.cortes, 1);
    await sync.ciclo();
    assert.equal((await nube.db.query('select notas from cortes')).rows[0].notas, 'corregido');
    // el estado reporta la caja cerrada y el último corte
    const e = (await nube.db.query('select caja, ultimo_corte from estado_negocio')).rows[0];
    assert.equal(e.caja.abierta, false);
    assert.equal(e.ultimo_corte.diferencia, -200);
  } finally { await nube.cerrar(); }
});

test('sin configurar la nube: no lanza, no hace nada y lo dice; dos ciclos a la vez no se pisan', async () => {
  const db = crearBaseDePrueba({ cajaAbierta: false });
  const { sync } = montar(db, null);
  assert.deepEqual(await sync.ciclo(), { estado: 'no_configurado' });
  assert.equal(sync.estado().situacion, 'no_configurada');
  assert.equal(sync.configurada(), false);

  let liberar; const espera = new Promise((r) => (liberar = r));
  const lenta = { async subir() { await espera; return {}; } };
  const { sync: s2 } = montar(db, lenta);
  const primero = s2.ciclo();
  assert.deepEqual(await s2.ciclo(), { estado: 'en_curso' });
  assert.equal(s2.estado().sincronizando, true);
  liberar(); await primero;
  assert.equal(s2.estado().sincronizando, false);
});

test('espera entre intentos: la normal, y si falla se duplica hasta un tope de 10 minutos', () => {
  const { esperaMs } = syncService(crearBaseDePrueba({ cajaAbierta: false }), { nube: null, estadisticas: {} });
  assert.equal(esperaMs(60000, 0), 60000);
  assert.deepEqual([1, 2, 3, 4].map((n) => esperaMs(60000, n)), [120000, 240000, 480000, 600000]);
  assert.equal(esperaMs(60000, 50), 600000);
});

test('iniciar/detener programan y cancelan el temporizador; el primer ciclo es corto y no pasa nada si no hay nube', async () => {
  const db = crearBaseDePrueba({ cajaAbierta: false });
  const prog = []; const canc = [];
  const mk = (nube) => syncService(db, { nube, estadisticas: { estadoNegocio: () => ({}) }, programar: (fn, ms) => { prog.push({ fn, ms }); return { unref() {}, id: prog.length }; }, cancelar: (t) => canc.push(t) });
  mk(null).iniciar();
  assert.equal(prog.length, 0);                                       // sin nube no se agenda nada
  const s = mk({ async subir() { return {}; } });
  s.iniciar(); s.iniciar();                                           // iniciar dos veces no duplica
  assert.equal(prog.length, 1);
  assert.equal(prog[0].ms, 5000);
  await prog[0].fn();                                                 // corre el ciclo y agenda el siguiente
  assert.equal(prog.length, 2);
  assert.equal(prog[1].ms, 60000);
  s.detener();
  assert.equal(canc.length, 1);
  await prog[1].fn();                                                 // un ciclo ya agendado no re-agenda tras detener
  assert.equal(prog.length, 2);
});

// ================================================================================================================
// LA PRUEBA CLAVE: la caja y la nube deben dar EXACTAMENTE las mismas estadísticas con los mismos datos.
// ================================================================================================================
test('EQUIVALENCIA caja vs nube: mismas estadísticas (SQLite+JS contra Postgres+SQL) en muchos días y dos zonas horarias', async () => {
  const nube = await crearNube(); const ids = await nube.sembrar();
  try {
    const db = crearBaseDePrueba({ cajaAbierta: false });
    const total = generarVentas(db, { desde: '2026-09-20', dias: 44, semilla: 4242 });
    assert.ok(total > 500, `dataset: ${total} ventas`);
    const { sync } = montar(db, nubeConPostgres(nube, ids));
    await sync.ciclo();
    assert.equal(sync.estado().pendientes.ventas, 0);

    const casos = [
      [MX, ['2026-11-02', '2026-11-01', '2026-10-25', '2026-10-04', '2026-10-31', '2026-12-25', '2026-10-15', '2026-10-28']],
      ['America/Tijuana', ['2026-11-01', '2026-10-31', '2026-11-02', '2026-10-20']],   // 1/nov/2026: Tijuana retrasa el reloj → día de 25 horas
      ['Asia/Tokyo', ['2026-11-02', '2026-10-10']],                                      // al otro lado del mundo: el día local casi no coincide con el UTC
    ];
    for (const [zona, dias] of casos) {
      await nube.db.query('update negocios set zona_horaria = $1 where id = $2', [zona, ids.negA]);
      const local = estadisticasService(db, { zona, corte: corteService(db), inventario: inventarioService(db) });
      for (const dia of dias) {
        const esperado = JSON.parse(JSON.stringify(local.estadoDueno(dia)));
        const enNube = await nube.como(ids.duenoA).rpc('estado_dueno', [ids.negA, dia]);
        assert.deepEqual(enNube, esperado, `${zona} ${dia}`);
      }
    }
    // y el día con ventas realmente tiene contenido (la prueba no es vacía)
    const r = await nube.como(ids.duenoA).rpc('estado_dueno', [ids.negA, '2026-11-02']);
    assert.ok(r.serie.reduce((s, x) => s + x.total, 0) > 0);
    assert.ok(r.top.por_piezas.length === 10);
  } finally { await nube.cerrar(); }
});
