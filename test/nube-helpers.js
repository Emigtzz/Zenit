'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Postgres REAL en memoria (PGlite). Simula SOLO lo que Supabase ya trae de fábrica: el esquema `auth`, `auth.uid()` y los roles
// `anon` / `authenticated`. Todo lo demás (tablas, RLS, funciones) es el archivo supabase/schema.sql tal cual se pegará en Supabase.
async function crearNube() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon nologin; create role authenticated nologin;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  await db.exec(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8'));

  // Ejecuta como un usuario de Supabase: rol "authenticated" + JWT con ese `sub` (así actúa la RLS). userId = null -> rol anónimo.
  const como = (userId) => ({
    async query(sql, params = []) {
      await db.exec(userId ? 'set role authenticated' : 'set role anon');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId || '']);
      try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
    },
    rpc: async (fn, args) => (await como(userId).query(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args)).rows[0].r,
  });

  // Dos negocios (A y B) con su dueño y su caja, más alguien sin ningún negocio.
  async function sembrar() {
    const ids = { negA: randomUUID(), negB: randomUUID(), duenoA: randomUUID(), cajaA: randomUUID(), duenoB: randomUUID(), cajaB: randomUUID(), intruso: randomUUID(), instA: randomUUID(), instB: randomUUID() };
    for (const [k, id] of Object.entries(ids)) if (/^(dueno|caja|intruso)/.test(k)) await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${k}@x.com`]);
    await db.query("insert into negocios (id, nombre) values ($1, 'Luna de precios'), ($2, 'Otra tienda')", [ids.negA, ids.negB]);
    for (const [u, n, r] of [[ids.duenoA, ids.negA, 'dueno'], [ids.cajaA, ids.negA, 'caja'], [ids.duenoB, ids.negB, 'dueno'], [ids.cajaB, ids.negB, 'caja']]) {
      await db.query('insert into miembros (user_id, negocio_id, rol) values ($1, $2, $3)', [u, n, r]);
    }
    return ids;
  }
  return { db, como, sembrar, cerrar: () => db.close() };
}

// Un lote mínimo de una venta (ids locales elegidos por el llamador)
function venta(id, { fecha, total = 1000, estado = 'completada', lineas = [{ producto: 1, nombre: 'Refresco', cantidad: 1, precio: 1000 }], pagos = [{ metodo: 'efectivo', monto: total }], descuento = 0 } = {}) {
  const subtotal = total + descuento;
  return {
    venta: { id_local: id, fecha, usuario_nombre: 'Beto', subtotal, descuento_mayoreo: descuento, total, cambio: 0, estado, corte_id_local: 1 },
    detalle: lineas.map((l, i) => ({ venta_id_local: id, linea: i + 1, producto_id_local: l.producto, producto_nombre: l.nombre, categoria: 'X', cantidad: l.cantidad, precio_unitario: l.precio, importe: l.cantidad * l.precio })),
    pagos: pagos.map((p, i) => ({ venta_id_local: id, n: i + 1, metodo: p.metodo, monto: p.monto })),
  };
}
const lote = (...ventas) => ({ ventas: ventas.map((v) => v.venta), detalle: ventas.flatMap((v) => v.detalle), pagos: ventas.flatMap((v) => v.pagos) });

module.exports = { crearNube, venta, lote };
