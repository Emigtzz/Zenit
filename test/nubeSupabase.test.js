'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearNubeSupabase } = require('../src/sync/nubeSupabase');

const URL_NUBE = 'https://proyecto.supabase.co';
const CLAVE = 'anon-key-de-prueba';
const NEG = '11111111-1111-4111-8111-111111111111';
const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });
const sesion = (n = 1) => json({ access_token: `jwt-${n}`, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `r-${n}`, user: { id: 'u1', email: 'caja@x.com', aud: 'authenticated' } });
const lote = { ventas: [{ id_local: 1 }], detalle: [], pagos: [] };
const entrada = { instalacion_id: '22222222-2222-4222-8222-222222222222', lote, cortes: [], estado: { caja: { abierta: false }, version: 't' } };
const tipo = async (p) => { try { await p; return null; } catch (e) { return e.tipo; } };

// Servidor de Supabase simulado a nivel de fetch: el SDK oficial es el REAL, lo único falso es la red.
function servidor(rutas) {
  const peticiones = [];
  const fetchSimulado = async (url, init = {}) => {
    const u = new URL(String(url)); const h = Object.fromEntries(new Headers(init.headers));
    const p = { metodo: init.method || 'GET', ruta: u.pathname, query: u.search, headers: h, cuerpo: init.body ? JSON.parse(init.body) : null };
    peticiones.push(p);
    const r = rutas(p, peticiones);
    if (r instanceof Error) throw r;
    return r;
  };
  return { fetchSimulado, peticiones };
}
const base = (extra = {}) => (p, todas) => {
  if (p.ruta === '/auth/v1/token') return extra.token ? extra.token(p, todas) : sesion();
  if (p.ruta === '/rest/v1/miembros') return extra.miembros ? extra.miembros(p) : json([{ negocio_id: NEG, rol: 'caja' }]);
  if (p.ruta === '/rest/v1/rpc/sincronizar') return extra.sincronizar ? extra.sincronizar(p, todas) : json({ ventas: 1, cortes: 0 });
  if (p.ruta === '/rest/v1/rpc/version_esquema') return json(1);
  if (p.ruta === '/rest/v1/negocios') return json([{ nombre: 'Luna de precios', zona_horaria: 'America/Mexico_City' }]);
  if (p.ruta === '/rest/v1/ventas') return extra.ventas ? extra.ventas(p) : json({ code: '42501', message: 'permission denied for table ventas' }, 401);
  return json({ message: 'ruta inesperada' }, 404);
};
const adaptador = (fetchSimulado, extra = {}) => crearNubeSupabase({ url: URL_NUBE, anonKey: CLAVE, email: 'caja@x.com', password: 'pw', fetchImpl: fetchSimulado, timeoutMs: 200, ...extra });

test('flujo real con el SDK oficial: inicia sesión, descubre su negocio y llama a `sincronizar` con los parámetros correctos', async () => {
  const s = servidor(base());
  const nube = adaptador(s.fetchSimulado);
  assert.deepEqual(await nube.subir(entrada), { ventas: 1, cortes: 0 });
  const [login, miembros, rpc] = s.peticiones;
  assert.equal(login.ruta, '/auth/v1/token');
  assert.match(login.query, /grant_type=password/);
  assert.deepEqual(login.cuerpo, { email: 'caja@x.com', password: 'pw', gotrue_meta_security: {} });
  assert.equal(login.headers.apikey, CLAVE);
  assert.equal(miembros.headers.authorization, 'Bearer jwt-1');          // la consulta ya va con el JWT del usuario
  assert.equal(rpc.metodo, 'POST');
  assert.equal(rpc.headers.apikey, CLAVE);
  assert.equal(rpc.headers.authorization, 'Bearer jwt-1');
  assert.deepEqual(Object.keys(rpc.cuerpo).sort(), ['p_cortes', 'p_detalle', 'p_estado', 'p_instalacion', 'p_negocio', 'p_pagos', 'p_ventas']);
  assert.equal(rpc.cuerpo.p_negocio, NEG);
  assert.equal(rpc.cuerpo.p_instalacion, entrada.instalacion_id);
  assert.deepEqual(rpc.cuerpo.p_ventas, [{ id_local: 1 }]);
  assert.equal(rpc.cuerpo.p_estado.version, 't');
});

test('la sesión y el negocio se reutilizan: el segundo ciclo no vuelve a iniciar sesión', async () => {
  const s = servidor(base());
  const nube = adaptador(s.fetchSimulado);
  await nube.subir(entrada); await nube.subir(entrada);
  assert.equal(s.peticiones.filter((p) => p.ruta === '/auth/v1/token').length, 1);
  assert.equal(s.peticiones.filter((p) => p.ruta === '/rest/v1/miembros').length, 1);
  assert.equal(s.peticiones.filter((p) => p.ruta === '/rest/v1/rpc/sincronizar').length, 2);
});

test('sin internet (fetch lanza) -> sin_conexion; internet colgado (no responde) -> sin_conexion por tiempo agotado', async () => {
  assert.equal(await tipo(adaptador(servidor(() => new TypeError('fetch failed')).fetchSimulado).subir(entrada)), 'sin_conexion');
  const colgado = (url, init) => new Promise((_, rechazar) => init.signal.addEventListener('abort', () => rechazar(new DOMException('The operation was aborted', 'AbortError'))));
  const t0 = Date.now();
  assert.equal(await tipo(adaptador(colgado).subir(entrada)), 'sin_conexion');
  assert.ok(Date.now() - t0 < 3000, 'no debe esperar para siempre');
});

test('credenciales malas -> credenciales (y se reintentará el login en el siguiente ciclo)', async () => {
  const s = servidor(base({ token: () => json({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400) }));
  const nube = adaptador(s.fetchSimulado);
  assert.equal(await tipo(nube.subir(entrada)), 'credenciales');
  assert.equal(await tipo(nube.subir(entrada)), 'credenciales');
  assert.equal(s.peticiones.filter((p) => p.ruta === '/auth/v1/token').length, 2);
});

test('usuario sin ningún negocio -> sin_negocio; usuario que solo es DUEÑO -> permiso (no puede subir)', async () => {
  assert.equal(await tipo(adaptador(servidor(base({ miembros: () => json([]) })).fetchSimulado).subir(entrada)), 'sin_negocio');
  const e = await adaptador(servidor(base({ miembros: () => json([{ negocio_id: NEG, rol: 'dueno' }]) })).fetchSimulado).subir(entrada).catch((x) => x);
  assert.equal(e.tipo, 'permiso');
  assert.match(e.detalle, /dueño/);
});

test('esquema sin instalar (función inexistente) -> esquema; RLS que rechaza -> permiso; error del servidor -> servidor', async () => {
  const noExiste = base({ sincronizar: () => json({ code: 'PGRST202', message: 'Could not find the function public.sincronizar', details: null, hint: null }, 404) });
  assert.equal(await tipo(adaptador(servidor(noExiste).fetchSimulado).subir(entrada)), 'esquema');
  const rls = base({ sincronizar: () => json({ code: '42501', message: 'new row violates row-level security policy for table "ventas"' }, 403) });
  assert.equal(await tipo(adaptador(servidor(rls).fetchSimulado).subir(entrada)), 'permiso');
  const caido = base({ sincronizar: () => json({ code: 'XX000', message: 'boom' }, 500) });
  assert.equal(await tipo(adaptador(servidor(caido).fetchSimulado).subir(entrada)), 'servidor');
});

test('JWT vencido: vuelve a iniciar sesión UNA vez y reintenta con el token nuevo', async () => {
  let intento = 0; let logins = 0;
  const s = servidor(base({
    token: () => sesion(++logins),
    sincronizar: (p) => (p.headers.authorization === 'Bearer jwt-1' ? json({ code: 'PGRST301', message: 'JWT expired' }, 401) : json({ ventas: 7, cortes: 0 })),
  }));
  assert.deepEqual(await adaptador(s.fetchSimulado).subir(entrada), { ventas: 7, cortes: 0 });
  assert.equal(logins, 2);
  const llamadas = s.peticiones.filter((p) => p.ruta === '/rest/v1/rpc/sincronizar');
  assert.deepEqual(llamadas.map((p) => p.headers.authorization), ['Bearer jwt-1', 'Bearer jwt-2']);
  void intento;
});

test('probar(): sesión, negocio, zona, esquema y acceso anónimo cerrado; sin escribir nada', async () => {
  const s = servidor(base());
  const r = await adaptador(s.fetchSimulado).probar();
  assert.deepEqual(r, { negocio_id: NEG, negocio: 'Luna de precios', zona_horaria: 'America/Mexico_City', rol: 'caja', version_esquema: 1, acceso_anonimo: 'bloqueado' });
  assert.ok(!s.peticiones.some((p) => p.ruta === '/rest/v1/rpc/sincronizar'));
  const anon = s.peticiones.find((p) => p.ruta === '/rest/v1/ventas');
  assert.equal(anon.headers.authorization, `Bearer ${CLAVE}`);   // la prueba anónima va con la clave pública, SIN el JWT del usuario
});

test('probar() detecta un esquema mal protegido: anónimo que puede leer ventas = ABIERTO', async () => {
  const abierto = servidor(base({ ventas: () => json([{ id_local: 1 }]) }));
  assert.equal((await adaptador(abierto.fetchSimulado).probar()).acceso_anonimo, 'ABIERTO');
  const soloRls = servidor(base({ ventas: () => json([]) }));
  assert.equal((await adaptador(soloRls.fetchSimulado).probar()).acceso_anonimo, 'solo_rls');
});
