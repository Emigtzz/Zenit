// Configuración de la app del dueño. La URL y la clave "anon/publishable" NO son secretas (la seguridad la dan los permisos RLS
// de la base), pero sí hay que ponerlas: Supabase → Project Settings → API. `npm run pwa:configurar` las copia desde el .env.
export const CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
};
