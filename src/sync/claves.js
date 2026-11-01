'use strict';
// ¿Esta clave es de ADMINISTRADOR (se salta toda la seguridad)? Nunca debe estar en la caja ni en la app del celular.
// Supabase tiene dos formatos: el nuevo (sb_publishable_… pública / sb_secret_… administrador) y el anterior
// (JWT cuyo rol es "anon" o "service_role").
function esClaveDeAdministrador(clave) {
  const k = String(clave || '').trim();
  if (/^sb_secret_/i.test(k)) return true;
  const partes = k.split('.');
  if (partes.length === 3) {
    try { return JSON.parse(Buffer.from(partes[1], 'base64url').toString()).role === 'service_role'; } catch { /* no es un JWT legible */ }
  }
  return /service_role/i.test(k);
}

// Errores típicos al copiar la URL de Supabase. Devuelve un mensaje para el usuario, o null si se ve bien.
function problemaConUrlSupabase(url) {
  let u;
  try { u = new URL(url); } catch { return 'no es una dirección válida. Debe verse como https://abcdefgh.supabase.co'; }
  const local = /^(localhost|127\.0\.0\.1)$/.test(u.hostname);
  if (u.protocol !== 'https:' && !local) return 'debe empezar con https://';
  if (/(^|\.)supabase\.com$/i.test(u.hostname) || /\/dashboard/i.test(u.pathname)) {
    return 'esa es la dirección del PANEL de Supabase (la de la barra del navegador), no la de tu proyecto. En el panel abre Project Settings → API y copia la "Project URL": se ve como https://abcdefgh.supabase.co';
  }
  if (/\.supabase\.(co|in)$/i.test(u.hostname) && u.pathname.replace(/\/+$/, '') !== '') {
    return 'la URL del proyecto no lleva nada después de ".supabase.co" (quita la parte "' + u.pathname + '")';
  }
  return null;
}
module.exports = { esClaveDeAdministrador, problemaConUrlSupabase };
