'use strict';
const { createClient } = require('@supabase/supabase-js');
const { ErrorNube } = require('./errores');

// Adaptador REAL a Supabase con el SDK oficial. La caja entra con SU PROPIO usuario (correo + contraseña, sin privilegios de
// administrador): lo que puede hacer lo decide la RLS de supabase/schema.sql, no este código.
const RED = /fetch failed|failed to fetch|network|timeout|timed out|aborted|abort|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|socket/i;

function clasificarAuth(e) {
  if (e.status === 0 || e.name === 'AuthRetryableFetchError' || RED.test(String(e.message))) return new ErrorNube('sin_conexion');
  if (e.status === 400 || e.status === 401 || e.status === 422) return new ErrorNube('credenciales');
  return new ErrorNube('servidor', e.message);
}
function clasificar(e) {
  const txt = `${e.message || ''} ${e.details || ''}`;
  if (!e.code && RED.test(txt)) return new ErrorNube('sin_conexion');
  if (e.code === '42501') return new ErrorNube('permiso');
  if (['PGRST202', 'PGRST205', '42883', '42P01'].includes(e.code)) return new ErrorNube('esquema');
  return new ErrorNube('servidor', e.message);
}
const sesionVencida = (e) => e && (e.code === 'PGRST301' || /JWT expired|jwt/i.test(String(e.message)) || e.status === 401);

function crearNubeSupabase({ url, anonKey, email, password, timeoutMs = 30000, fetchImpl = (...a) => fetch(...a), crearCliente = createClient }) {
  // Tiempo máximo por petición: con internet "colgado" no se queda esperando para siempre.
  const conTiempo = (input, init = {}) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const señal = init.signal ? AbortSignal.any([init.signal, ctl.signal]) : ctl.signal;
    return fetchImpl(input, { ...init, signal: señal }).finally(() => clearTimeout(t));
  };
  const cliente = crearCliente(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
    global: { fetch: conTiempo },
  });
  let sesion = false;
  let negocioId = null;

  async function iniciarSesion() {
    const { error } = await cliente.auth.signInWithPassword({ email, password });
    if (error) throw clasificarAuth(error);
    sesion = true;
  }
  async function resolverNegocio() {
    const { data, error } = await cliente.from('miembros').select('negocio_id, rol');
    if (error) throw clasificar(error);
    if (!data.length) throw new ErrorNube('sin_negocio');
    const mia = data.find((m) => m.rol === 'caja');
    if (!mia) throw new ErrorNube('permiso', 'Este usuario es "dueño", no "caja": solo puede leer. Usa el usuario de la caja en SYNC_EMAIL.');
    negocioId = mia.negocio_id;
  }
  async function asegurar() {
    if (!sesion) await iniciarSesion();
    if (!negocioId) await resolverNegocio();
  }
  async function rpc(nombre, args) {
    let r = await cliente.rpc(nombre, args);
    if (r.error && sesionVencida(r.error)) { sesion = false; await asegurar(); r = await cliente.rpc(nombre, args); } // un reintento con sesión nueva
    if (r.error) throw clasificar(r.error);
    return r.data;
  }

  return {
    async subir({ instalacion_id, lote, cortes, estado }) {
      await asegurar();
      return rpc('sincronizar', {
        p_negocio: negocioId, p_instalacion: instalacion_id,
        p_ventas: lote.ventas, p_detalle: lote.detalle, p_pagos: lote.pagos, p_cortes: cortes, p_estado: estado,
      });
    },
    // Para `npm run sync:probar`: verifica credenciales, negocio, rol, esquema, zona horaria y que SIN sesión no se pueda leer nada.
    // No escribe nada.
    async probar() {
      await asegurar();
      const version_esquema = await rpc('version_esquema', {});
      const { data: negocios, error } = await cliente.from('negocios').select('nombre, zona_horaria').eq('id', negocioId);
      if (error) throw clasificar(error);

      // Prueba de seguridad: con la clave pública y SIN iniciar sesión, las tablas deben estar cerradas.
      const anonimo = crearCliente(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: conTiempo } });
      const r = await anonimo.from('ventas').select('id_local').limit(1);
      const acceso_anonimo = r.error ? (r.error.code === '42501' || r.status === 401 || r.status === 403 ? 'bloqueado' : 'error') : (r.data.length ? 'ABIERTO' : 'solo_rls');
      return { negocio_id: negocioId, negocio: negocios[0]?.nombre ?? null, zona_horaria: negocios[0]?.zona_horaria ?? null, rol: 'caja', version_esquema, acceso_anonimo };
    },
  };
}

module.exports = { crearNubeSupabase };
