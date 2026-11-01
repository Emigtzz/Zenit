'use strict';
// Copia SUPABASE_URL y SUPABASE_ANON_KEY del .env a pwa/config.js (lo que se publica para el celular) y renueva la versión del
// service worker para que los celulares descarguen la configuración nueva. Uso: npm run pwa:configurar
const fs = require('node:fs');
const path = require('node:path');
const config = require('../src/config');

const { url, anonKey } = config.sync;
if (!url || !anonKey) { console.error('Faltan SUPABASE_URL y SUPABASE_ANON_KEY en el archivo .env. Mira supabase/LEEME.md.'); process.exit(1); }
if (/service_role/i.test(anonKey) || anonKey.split('.').length === 3 && JSON.parse(Buffer.from(anonKey.split('.')[1], 'base64url').toString() || '{}').role === 'service_role') {
  console.error('⛔ Esa es la clave service_role (administrador total). NUNCA va en la app del celular. Usa la clave "anon" / "publishable".'); process.exit(1);
}
const dir = path.join(__dirname, '..', 'pwa');
fs.writeFileSync(path.join(dir, 'config.js'), `// Generado por "npm run pwa:configurar". La URL y la clave anon/publishable no son secretas: la seguridad la dan los permisos RLS.\nexport const CONFIG = {\n  SUPABASE_URL: ${JSON.stringify(url)},\n  SUPABASE_ANON_KEY: ${JSON.stringify(anonKey)},\n};\n`);
const sw = path.join(dir, 'sw.js');
fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/const VERSION = '[^']*';/, `const VERSION = 'zenit-pwa-${Date.now().toString(36)}';`));
console.log('Listo: pwa/config.js actualizado. Publica la carpeta "pwa" (ver supabase/LEEME.md).');
