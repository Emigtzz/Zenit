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
module.exports = { esClaveDeAdministrador };
