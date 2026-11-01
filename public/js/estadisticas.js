import { api, requerirDueno } from './api.js';
import { crearTablero, hoyEn } from '/pwa/lib/tablero.js';

await requerirDueno();
const $ = (id) => document.getElementById(id);
const p2 = (n) => String(n).padStart(2, '0');
const nodo = (tag, props = {}, ...hijos) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(props)) { if (k === 'class') e.className = v; else if (k === 'texto') e.textContent = v; else e.setAttribute(k, v); } e.append(...hijos); return e; };

const tablero = crearTablero($('tablero'));
let datos = null;

// Tarjeta propia de la caja: estado de la sincronización con la nube
const cuerpoSync = nodo('div');
const botonSync = nodo('button', { class: 'btn sec', type: 'button', style: 'margin-top:8px;padding:5px 12px;font-size:13px', texto: 'Sincronizar ahora' });
tablero.lateral.append(nodo('section', { class: 'viz-tarjeta' }, nodo('h3', { texto: 'Nube y celular' }), cuerpoSync, botonSync));
const haceCuanto = (iso) => { const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'hace menos de 1 min' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.floor(m / 60)} h` : `hace ${Math.floor(m / 1440)} d`; };
async function pintarSync() {
  try {
    const e = await api.syncEstado();
    const l = (a, b) => nodo('div', { class: 'linea' }, nodo('span', { texto: a }), nodo('span', { texto: b }));
    const pend = e.pendientes.ventas + e.pendientes.cortes;
    if (!e.configurada) { cuerpoSync.replaceChildren(nodo('div', { class: 'estado', texto: 'Sin configurar' }), nodo('div', { class: 'viz-nota', texto: 'La caja funciona igual, pero el celular del dueño no recibe datos. Guía: supabase/LEEME.md' })); botonSync.hidden = true; return; }
    botonSync.hidden = false;
    cuerpoSync.replaceChildren(
      e.situacion === 'error' ? nodo('div', { class: 'estado mal', texto: '⚠ No se pudo sincronizar' }) : e.situacion === 'pendiente' ? nodo('div', { class: 'estado', texto: `⏳ ${pend} por subir` }) : nodo('div', { class: 'estado bien', texto: '✔ Todo en la nube' }),
      l('Última vez', e.ultimo_exito ? haceCuanto(e.ultimo_exito) : 'nunca'), l('Por subir', `${e.pendientes.ventas} ventas · ${e.pendientes.cortes} cortes`), l('Ventas subidas', String(e.ventas_subidas)),
      ...(e.ultimo_error ? [nodo('div', { class: 'viz-nota mal', style: 'margin-top:6px', texto: e.ultimo_error })] : []));
  } catch { /* sin tarjeta */ }
}
botonSync.addEventListener('click', async () => { botonSync.disabled = true; botonSync.textContent = 'Sincronizando…'; try { await api.syncAhora(); } finally { botonSync.disabled = false; botonSync.textContent = 'Sincronizar ahora'; pintarSync(); } });

async function cargar(dia) {
  tablero.cargando(true);
  try {
    datos = await api.estadisticas(dia);
    $('error').hidden = true; $('f-dia').value = datos.dia; $('f-dia').max = hoyEn(datos.zona_horaria);
    tablero.pintar(datos, datos.negocio);
    pintarSync();
    $('actualizado').textContent = `Actualizado ${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · zona ${datos.zona_horaria}`;
  } catch (e) { $('error').hidden = false; $('error').textContent = e.message; }
  finally { tablero.cargando(false); }
}
$('f-hoy').onclick = () => cargar();
$('f-ayer').onclick = () => { const d = new Date(`${datos.hoy}T12:00:00`); d.setDate(d.getDate() - 1); cargar(`${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`); };
$('f-dia').addEventListener('change', () => { if ($('f-dia').value) cargar($('f-dia').value); });
setInterval(() => { if (!document.hidden && datos && datos.dia === datos.hoy) cargar(); }, 60000);
cargar();
