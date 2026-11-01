// App del dueño: solo LEE de Supabase con su propio inicio de sesión. Si no hay internet, muestra lo último que vio y lo dice.
import { CONFIG } from './config.js';
import { crearTablero, hoyEn } from './lib/tablero.js';

const $ = (id) => document.getElementById(id);
const UMBRAL_LATIDO_MIN = 5;   // la caja avisa cada ~1 min; pasados 5 sin avisar se considera desconectada
const MAX_CACHE = 6;

// localStorage puede estar bloqueado (modo privado): todo va en try/catch y la app funciona igual, solo sin memoria.
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin memoria */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* nada */ } },
};

// Tiempo máximo por petición: con señal mala el navegador puede esperar minutos. A los 10 s se rinde y se muestra lo guardado.
const TIEMPO_MS = 10000;
function fetchConTiempo(input, init = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIEMPO_MS);
  const señal = init.signal && AbortSignal.any ? AbortSignal.any([init.signal, ctl.signal]) : (init.signal || ctl.signal);
  return fetch(input, { ...init, signal: señal }).finally(() => clearTimeout(t));
}

let cliente = null; let diaPintado; let negocio = null; let tablero = null; let diaPedido = null; let zona = 'America/Mexico_City'; let cargandoAhora = false;

const hhmm = (iso) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
const hace = (ms) => { const m = Math.floor(ms / 60000); return m < 1 ? 'hace menos de 1 min' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.floor(m / 60)} h` : `hace ${Math.floor(m / 1440)} d`; };
function mostrar(vista) { for (const v of ['v-config', 'v-login', 'v-tablero']) $(v).hidden = v !== vista; }
const esRed = (e) => !e || e.status === 0 || e.name === 'AuthRetryableFetchError' || (!e.code && /fetch|network|failed|load failed|abort|timeout/i.test(String(e.message)));

// ---------- memoria local de lo último que se vio ----------
const claveCache = (dia) => `zenit:cache:${negocio.id}:${dia || 'hoy'}`;
function guardarCache(dia, datos, estado) {
  const clave = claveCache(dia);
  LS.set(clave, { ts: Date.now(), datos, estado });
  const claves = (LS.get('zenit:claves') || []).filter((k) => k !== clave); claves.unshift(clave);
  for (const vieja of claves.splice(MAX_CACHE)) LS.del(vieja);
  LS.set('zenit:claves', claves);
}
const leerCache = (dia) => LS.get(claveCache(dia));
function olvidarTodo() { for (const k of LS.get('zenit:claves') || []) LS.del(k); LS.del('zenit:claves'); LS.del('zenit:negocio'); }

// ---------- aviso de frescura ----------
function pintarBanner({ estado, desdeCache, ts, actualizando }) {
  const b = $('banner');
  b.hidden = false;
  let clase = 'banner'; let texto;
  if (desdeCache && actualizando) { clase += ' aviso'; texto = `Mostrando lo último que viste (${hace(Date.now() - ts)}) · actualizando…`; }
  else if (desdeCache) { clase += ' aviso'; texto = `Sin internet en tu celular: mostrando lo último que viste (${hace(Date.now() - ts)}).`; }
  else if (!estado || !estado.latido) { clase += ' aviso'; texto = 'La caja todavía no se ha conectado a la nube.'; }
  else {
    const edad = Date.now() - Date.parse(estado.latido);
    if (edad > UMBRAL_LATIDO_MIN * 60000) { clase += ' error'; texto = `⚠ La caja no se conecta desde las ${hhmm(estado.latido)} (${hace(edad)}). Las cifras pueden estar incompletas.`; }
    else texto = `✔ Caja conectada · última sincronización ${hace(edad)}`;
  }
  b.className = clase; b.textContent = texto;
}

function pintar(datos, estado, { desdeCache, ts, actualizando = false }) {
  zona = datos.zona_horaria || zona;
  $('f-dia').value = datos.dia; $('f-dia').max = hoyEn(zona);
  tablero.pintar(datos, estado ? { caja: estado.caja, ultimo_corte: estado.ultimo_corte, stock_bajo: estado.stock_bajo } : null);
  pintarBanner({ estado, desdeCache, ts, actualizando });
  diaPintado = datos.dia; $('pie').textContent = `Actualizado ${new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · zona ${zona}`;
}

async function cargar(dia = diaPedido) {
  if (cargandoAhora || !negocio) return;
  cargandoAhora = true; diaPedido = dia; tablero.cargando(true);
  // Lo primero que se ve es lo ÚLTIMO que se vio (al instante, aunque no haya señal); luego se reemplaza con lo nuevo.
  const guardado = leerCache(dia);
  if (guardado && guardado.datos.dia !== diaPintado) pintar(guardado.datos, guardado.estado, { desdeCache: true, ts: guardado.ts, actualizando: true });
  try {
    const [a, b] = await Promise.all([
      cliente.rpc('estado_dueno', { p_negocio: negocio.id, p_dia: dia || null }),
      cliente.from('estado_negocio').select('*').eq('negocio_id', negocio.id).maybeSingle(),
    ]);
    if (a.error) throw a.error;
    const estado = b.error ? null : b.data;
    guardarCache(dia, a.data, estado);
    pintar(a.data, estado, { desdeCache: false, ts: Date.now() });
  } catch (e) {
    const c = leerCache(dia);
    if (esRed(e) && c) pintar(c.datos, c.estado, { desdeCache: true, ts: c.ts });
    else {
      const b = $('banner'); b.hidden = false; b.className = 'banner error';
      b.textContent = esRed(e) ? 'Sin internet y todavía no hay datos guardados en este celular.' : e.code === '42501' ? 'Esta cuenta no tiene permiso de dueño en este negocio.' : 'No se pudieron cargar los datos. Intenta de nuevo.';
    }
  } finally { cargandoAhora = false; tablero.cargando(false); }
}

// ---------- negocio y sesión ----------
async function descubrirNegocio() {
  const guardado = LS.get('zenit:negocio');
  if (guardado) return guardado;
  const { data, error } = await cliente.from('miembros').select('negocio_id, rol, negocios(nombre)');
  if (error) throw error;
  const m = (data || []).find((x) => x.rol === 'dueno');
  if (!m) throw Object.assign(new Error('Esta cuenta no es de dueño.'), { code: 'NO_DUENO' });
  const n = { id: m.negocio_id, nombre: m.negocios?.nombre || 'Mi negocio' };
  LS.set('zenit:negocio', n);
  return n;
}
async function abrirTablero() {
  negocio = await descubrirNegocio();
  $('negocio').textContent = negocio.nombre; document.title = `${negocio.nombre} · Dueño`;
  mostrar('v-tablero');
  await cargar(null);
}

async function iniciar() {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) return mostrar('v-config');
  tablero = crearTablero($('tablero'));
  cliente = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'zenit-auth' }, global: { fetch: fetchConTiempo } });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => { /* sin service worker: igual funciona, solo sin modo sin internet de la app */ });

  const nombreGuardado = LS.get('zenit:negocio');
  const { data } = await cliente.auth.getSession().catch(() => ({ data: {} }));
  if (data?.session || (nombreGuardado && !navigator.onLine)) {
    try { await abrirTablero(); return; } catch (e) { if (!esRed(e)) { if (e.code === 'NO_DUENO') $('err-login').textContent = e.message; } }
  }
  if (nombreGuardado) $('login-titulo').textContent = nombreGuardado.nombre;
  mostrar('v-login'); $('email').focus();
}

// ---------- eventos ----------
$('f-login').addEventListener('submit', async (ev) => {
  ev.preventDefault(); $('err-login').textContent = ''; $('btn-entrar').disabled = true;
  try {
    const { error } = await cliente.auth.signInWithPassword({ email: $('email').value.trim(), password: $('pass').value });
    if (error) { $('err-login').textContent = esRed(error) ? 'Sin internet: conéctate para iniciar sesión.' : 'Correo o contraseña incorrectos.'; return; }
    $('pass').value = '';
    await abrirTablero();
  } catch (e) { $('err-login').textContent = e.code === 'NO_DUENO' ? e.message : esRed(e) ? 'Sin internet: conéctate para iniciar sesión.' : 'No se pudo entrar. Intenta de nuevo.'; if (e.code === 'NO_DUENO') await cliente.auth.signOut(); }
  finally { $('btn-entrar').disabled = false; }
});
$('salir').addEventListener('click', async () => { olvidarTodo(); negocio = null; await cliente.auth.signOut().catch(() => {}); mostrar('v-login'); $('email').focus(); });
$('actualizar').addEventListener('click', () => cargar());
$('f-hoy').addEventListener('click', () => cargar(null));
// Día anterior con aritmética pura de calendario (sin zonas del celular, que pueden ser otras que las de la tienda)
$('f-ayer').addEventListener('click', () => { const [y, m, d] = hoyEn(zona).split('-').map(Number); cargar(new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)); });
$('f-dia').addEventListener('change', () => { if ($('f-dia').value) cargar($('f-dia').value === hoyEn(zona) ? null : $('f-dia').value); });
setInterval(() => { if (!document.hidden && negocio) cargar(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && negocio) cargar(); });
window.addEventListener('online', () => { if (negocio) cargar(); });

iniciar();
