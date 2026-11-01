'use strict';
// Verifica la conexión de la caja con Supabase, paso por paso, sin escribir nada (a menos que pidas --subir).
//   npm run sync:probar            revisa configuración, credenciales, negocio, esquema y seguridad
//   npm run sync:probar -- --subir además ejecuta UN ciclo real de sincronización
const config = require('../src/config');
const { abrirBase } = require('../src/db/connection');
const { migrar } = require('../src/db/migrate');
const { crearNubeSupabase } = require('../src/sync/nubeSupabase');
const { ErrorNube } = require('../src/sync/errores');

const ok = (t) => console.log(`  ✔ ${t}`);
const mal = (t) => console.log(`  ✖ ${t}`);
const aviso = (t) => console.log(`  ⚠ ${t}`);

(async () => {
  const s = config.sync;
  console.log('\nProbando la conexión con Supabase…\n');
  const falta = [['SUPABASE_URL', s.url], ['SUPABASE_ANON_KEY', s.anonKey], ['SYNC_EMAIL', s.email], ['SYNC_PASSWORD', s.password]].filter(([, v]) => !v).map(([k]) => k);
  if (falta.length) { mal(`Falta en el archivo .env: ${falta.join(', ')}. Sigue supabase/LEEME.md.`); process.exit(1); }
  ok(`Configuración completa (${s.url})`);
  if (/service_role/i.test(s.anonKey)) { mal('SUPABASE_ANON_KEY parece la clave service_role (administrador). Usa la clave "anon" / "publishable".'); process.exit(1); }

  const nube = crearNubeSupabase({ url: s.url, anonKey: s.anonKey, email: s.email, password: s.password });
  let r;
  try { r = await nube.probar(); }
  catch (e) { mal(e instanceof ErrorNube ? `${e.message}${e.detalle && e.detalle !== e.message ? `\n    ${e.detalle}` : ''}` : `Error inesperado: ${e.message}`); process.exit(1); }

  ok('El usuario de la caja inicia sesión');
  ok(`Pertenece al negocio "${r.negocio}" con rol de caja`);
  r.version_esquema === 1 ? ok(`El esquema de la base está instalado (versión ${r.version_esquema})`) : aviso(`Versión de esquema ${r.version_esquema}: vuelve a ejecutar supabase/schema.sql`);
  r.zona_horaria === config.zonaHoraria ? ok(`Zona horaria igual en la caja y en la nube (${r.zona_horaria})`)
    : aviso(`Zona horaria DISTINTA: la caja usa ${config.zonaHoraria} y la nube ${r.zona_horaria}. "Hoy" no coincidiría. Corrige NEGOCIO_ZONA_HORARIA o la tabla negocios.`);
  if (r.acceso_anonimo === 'bloqueado') ok('Sin iniciar sesión no se puede leer nada (seguridad correcta)');
  else if (r.acceso_anonimo === 'solo_rls') aviso('Sin sesión la tabla responde vacía (protegida solo por filas). Está bien, pero conviene volver a ejecutar supabase/schema.sql.');
  else mal(`⛔ SEGURIDAD: sin iniciar sesión se pudo leer datos (${r.acceso_anonimo}). Vuelve a ejecutar supabase/schema.sql ya.`);

  if (process.argv.includes('--subir')) {
    const db = abrirBase(config.dbPath); migrar(db);
    const { crearApp } = require('../src/app');
    const app = crearApp({ db, config, nube });
    const res = await app.locals.sync.ciclo();
    res.estado === 'ok' ? ok(`Ciclo real de sincronización: ${res.ventas_subidas} venta(s) subida(s)`) : mal(`El ciclo falló: ${res.mensaje}`);
    const e = app.locals.sync.estado(); console.log(`    Pendientes: ${e.pendientes.ventas} ventas, ${e.pendientes.cortes} cortes`);
    db.close();
  } else console.log('\n  (Para subir de verdad lo pendiente ahora: npm run sync:probar -- --subir)');
  console.log('\nTodo listo.\n');
  process.exit(r.acceso_anonimo === 'ABIERTO' ? 1 : 0);
})();
