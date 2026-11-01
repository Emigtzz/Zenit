'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const PWA = path.join(__dirname, '..', 'pwa');
const leer = (f) => fs.readFileSync(path.join(PWA, f), 'utf8');

test('manifest: instalable (nombre, inicio, modo app, íconos que EXISTEN con el tamaño declarado)', () => {
  const m = JSON.parse(leer('manifest.webmanifest'));
  assert.equal(m.display, 'standalone');
  assert.ok(m.name && m.short_name && m.start_url && m.theme_color && m.background_color);
  assert.ok(m.icons.some((i) => i.sizes === '192x192') && m.icons.some((i) => i.sizes === '512x512'));
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  for (const i of m.icons) {
    const png = fs.readFileSync(path.join(PWA, i.src));
    assert.equal(png.subarray(1, 4).toString(), 'PNG', i.src);
    const [w, h] = i.sizes.split('x').map(Number);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [w, h], `${i.src} no mide ${i.sizes}`);
  }
});

test('service worker: TODOS los archivos de su lista existen (si falta uno, cache.addAll falla y NO hay modo sin internet)', () => {
  const sw = leer('sw.js');
  const lista = [...sw.match(/const CASCARA = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(lista.length >= 10);
  for (const f of lista) {
    const ruta = f === './' ? 'index.html' : f.replace(/^\.\//, '');
    assert.ok(fs.existsSync(path.join(PWA, ruta)), `falta ${f}`);
  }
  // y todo lo que index.html carga está en la lista (si no, la app no abriría sin internet)
  const html = leer('index.html');
  for (const m of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
    if (/^https?:/.test(m[1])) assert.fail(`index.html carga un recurso externo: ${m[1]}`);
    assert.ok(lista.includes(`./${m[1]}`) || lista.includes(m[1]), `index.html usa ${m[1]} pero el service worker no lo guarda`);
  }
});

test('service worker: nunca intercepta otro origen (Supabase) ni escrituras: las cifras no se cachean ahí', () => {
  const sw = leer('sw.js');
  assert.match(sw, /req\.method !== 'GET' \|\| url\.origin !== self\.location\.origin\) return/);
});

test('el SDK de Supabase va incluido en la app (no depende de un CDN) y es el de las dependencias del proyecto', () => {
  const v = fs.readFileSync(path.join(PWA, 'vendor', 'supabase.js'), 'utf8');
  const version = require('@supabase/supabase-js/package.json').version;
  assert.ok(v.length > 100000);
  assert.ok(v.includes(version) || fs.statSync(path.join(PWA, 'vendor', 'supabase.js')).size === fs.statSync(path.join(__dirname, '..', 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js')).size,
    'vendor/supabase.js no corresponde a la versión instalada: vuelve a copiarlo');
});

test('config.js se entrega VACÍO (sin claves en el repositorio) y la app avisa si falta configurar', () => {
  const c = leer('config.js');
  assert.match(c, /SUPABASE_URL: ''/);
  assert.match(c, /SUPABASE_ANON_KEY: ''/);
  assert.match(leer('app.js'), /v-config/);
});

test('ningún archivo de la app ni del repositorio contiene una clave service_role ni inserta HTML sin escapar', () => {
  const archivos = ['app.js', 'index.html', 'lib/graficas.js', 'lib/tablero.js'].map((f) => [f, leer(f)]);
  for (const [f, txt] of archivos) {
    assert.ok(!/service_role/i.test(txt), `${f} menciona service_role`);
    assert.ok(!/\.innerHTML\s*=|insertAdjacentHTML|document\.write/.test(txt), `${f} inserta HTML: usa textContent`);
  }
});

test('pwa:configurar copia URL y clave anon del .env, renueva la versión del service worker y rechaza una clave service_role', () => {
  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'zenit-pwa-'));
  fs.cpSync(path.join(__dirname, '..', 'scripts'), path.join(tmp, 'scripts'), { recursive: true });
  fs.cpSync(path.join(__dirname, '..', 'src'), path.join(tmp, 'src'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'pwa')); fs.writeFileSync(path.join(tmp, 'pwa', 'sw.js'), "const VERSION = 'zenit-pwa-v1';\n");
  fs.symlinkSync(path.join(__dirname, '..', 'node_modules'), path.join(tmp, 'node_modules'));
  const correr = (env) => { try { return { ok: true, out: execFileSync('node', ['scripts/pwa-configurar.js'], { cwd: tmp, env: { PATH: process.env.PATH, ...env }, encoding: 'utf8', stdio: 'pipe' }) }; } catch (e) { return { ok: false, out: String(e.stderr) }; } };
  assert.equal(correr({}).ok, false);                                                                       // sin variables: avisa
  const jwtService = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from('{"role":"service_role"}').toString('base64url')}.x`;
  const mala = correr({ SUPABASE_URL: 'https://a.supabase.co', SUPABASE_ANON_KEY: jwtService });
  assert.equal(mala.ok, false);
  assert.match(mala.out, /service_role|ADMINISTRADOR/);
  const secreta = correr({ SUPABASE_URL: 'https://a.supabase.co', SUPABASE_ANON_KEY: 'sb_secret_abcdefghijklmnop' });   // formato NUEVO de Supabase
  assert.equal(secreta.ok, false);
  assert.match(secreta.out, /ADMINISTRADOR/);
  assert.match(fs.readFileSync(path.join(tmp, 'pwa', 'sw.js'), 'utf8'), /zenit-pwa-v1/);                    // no se tocó nada
  const buena = correr({ SUPABASE_URL: 'https://a.supabase.co/', SUPABASE_ANON_KEY: 'sb_publishable_abc' });
  assert.equal(buena.ok, true);
  assert.match(fs.readFileSync(path.join(tmp, 'pwa', 'config.js'), 'utf8'), /SUPABASE_URL: "https:\/\/a\.supabase\.co"/);   // sin la diagonal final
  assert.ok(!/zenit-pwa-v1/.test(fs.readFileSync(path.join(tmp, 'pwa', 'sw.js'), 'utf8')));                  // versión nueva
});
