'use strict';
// Por qué falló una sincronización, en palabras que entiende quien atiende la tienda.
const MENSAJES = {
  sin_conexion: 'Sin conexión a internet. Las ventas se guardan en la caja y se subirán solas cuando vuelva.',
  credenciales: 'Supabase rechazó el usuario de la caja. Revisa SYNC_EMAIL y SYNC_PASSWORD en el archivo .env.',
  permiso: 'El usuario de la caja no tiene permiso en el negocio. Revisa la tabla "miembros" en Supabase.',
  sin_negocio: 'El usuario de la caja no pertenece a ningún negocio. Revisa la tabla "miembros" en Supabase.',
  esquema: 'Falta ejecutar (o actualizar) supabase/schema.sql en Supabase.',
  servidor: 'Supabase respondió con un error. Se reintentará solo.',
};
class ErrorNube extends Error {
  constructor(tipo, detalle) { super(MENSAJES[tipo] || detalle || tipo); this.name = 'ErrorNube'; this.tipo = tipo; this.detalle = detalle; }
}
module.exports = { ErrorNube, MENSAJES };
