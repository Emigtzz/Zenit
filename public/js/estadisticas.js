import { api, requerirDueno } from './api.js';
import { columnas, barrasH, tarjeta, pesos, delta, observarAncho } from '/pwa/lib/graficas.js';

await requerirDueno();
const $ = (id) => document.getElementById(id);
const p2 = (n) => String(n).padStart(2, '0');
const nodo = (tag, props = {}, ...hijos) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(props)) { if (k === 'class') e.className = v; else if (k === 'texto') e.textContent = v; else e.setAttribute(k, v); } e.append(...hijos); return e; };

const METODOS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
const fechaLarga = (dia) => new Date(`${dia}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
const diaCorto = (dia) => { const d = dia.split('-'); return `${Number(d[2])}/${Number(d[1])}`; };
const hora12 = (h) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`;
const hhmm = (iso) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

// Las tarjetas se crean UNA vez y se vuelven a pintar con cada consulta (la estructura no salta).
const cHora = tarjeta({ titulo: 'Ventas por hora', nota: 'Hora local de la tienda' });
const cSerie = tarjeta({ titulo: 'Últimos 30 días', nota: 'Total vendido por día; el día elegido va resaltado' });
const cMetodo = tarjeta({ titulo: 'Por método de pago', nota: 'Lo cobrado en cada método (en efectivo, sin el cambio devuelto)' });
const cTop = tarjeta({ titulo: 'Más vendidos · últimos 7 días', nota: 'Cargando…' });
$('g-hora').append(cHora.el); $('g-serie').append(cSerie.el); $('g-metodo').append(cMetodo.el); $('g-top').append(cTop.el);

const conmutador = nodo('div', { class: 'conmutador', role: 'group', 'aria-label': 'Ordenar por' });
let ordenTop = 'piezas';
for (const [id, texto] of [['piezas', 'Piezas'], ['importe', 'Importe']]) {
  const b = nodo('button', { type: 'button', 'aria-pressed': String(id === ordenTop), texto });
  b.addEventListener('click', () => { ordenTop = id; conmutador.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); if (datos) pintarTop(); });
  conmutador.append(b);
}
cTop.zona.before(conmutador);

let datos = null, diaActual = null;

function pintarKpis(r) {
  const tile = (etq, valor, nota) => nodo('section', { class: 'viz-tarjeta tile' }, nodo('div', { class: 'viz-etq', texto: etq }), nodo('div', { class: 'viz-valor', texto: valor }), nota ? nodo('div', { class: 'viz-delta', texto: nota }) : '');
  $('kpis').replaceChildren(
    tile('Tickets', String(r.num_ventas)), tile('Ticket promedio', pesos(r.ticket_promedio)),
    tile('Piezas vendidas', String(r.piezas)), tile('Descuento de mayoreo', pesos(r.descuentos), r.descuentos ? 'ya restado del total' : ''));
}

function pintarHero(d) {
  const esHoy = d.dia === d.hoy;
  $('hero-etq').textContent = esHoy ? `Ventas de hoy · ${fechaLarga(d.dia)}` : `Ventas del ${fechaLarga(d.dia)}`;
  $('hero-valor').textContent = pesos(d.resumen.total);
  // Hoy es un día A MEDIAS: no se compara contra un día completo como si fuera una caída; se dice cuánto se lleva.
  for (const [id, ref, nombre] of [['hero-d1', d.comparativo.ayer, 'ayer'], ['hero-d2', d.comparativo.semana_pasada, 'el mismo día de la semana pasada']]) {
    const x = esHoy ? delta(d.resumen.total, ref.total, nombre, true) : delta(d.resumen.total, ref.total, `vs ${nombre}`);
    $(id).className = `viz-delta ${x.clase}`; $(id).textContent = `${x.texto} (${pesos(ref.total)})`;
  }
}

function pintarHora(d) {
  const filas = d.resumen.por_hora;
  // se muestran las horas con actividad ±1 para no dibujar 24 columnas casi vacías; si no hay ventas, todo el día
  const activas = filas.filter((h) => h.num_ventas > 0).map((h) => h.hora);
  const ini = activas.length ? Math.max(0, Math.min(...activas) - 1) : 0, fin = activas.length ? Math.min(23, Math.max(...activas) + 1) : 23;
  const vis = filas.slice(ini, fin + 1);
  const dibujar = () => columnas(cHora.zona, vis.map((h) => ({ etiqueta: `${hora12(h.hora)} (${String(h.hora).padStart(2, '0')}:00)`, valor: h.total, detalle: `${h.num_ventas} ticket${h.num_ventas === 1 ? '' : 's'}` })), { etiquetaX: (x) => x.etiqueta.split(' ')[0] });
  dibujar(); hora.redibujar = dibujar;
  cHora.pintarTabla([{ titulo: 'Hora' }, { titulo: 'Tickets', num: true }, { titulo: 'Total', num: true }], filas.filter((h) => h.num_ventas).map((h) => [`${String(h.hora).padStart(2, '0')}:00`, h.num_ventas, pesos(h.total)]));
}
const hora = { redibujar: null }; const serie = { redibujar: null };
observarAncho(cHora.zona, () => hora.redibujar?.()); observarAncho(cSerie.zona, () => serie.redibujar?.());

function pintarSerie(d) {
  const dibujar = () => columnas(cSerie.zona, d.serie.map((s) => ({ etiqueta: fechaLarga(s.dia), valor: s.total, resaltar: s.dia === d.dia, detalle: `${s.num_ventas} ticket${s.num_ventas === 1 ? '' : 's'}` })), { enfasis: true, etiquetaX: (x, i) => diaCorto(d.serie[i].dia) });
  dibujar(); serie.redibujar = dibujar;
  cSerie.pintarTabla([{ titulo: 'Día' }, { titulo: 'Tickets', num: true }, { titulo: 'Total', num: true }], [...d.serie].reverse().map((s) => [s.dia, s.num_ventas, pesos(s.total)]));
}

function pintarMetodo(d) {
  const m = d.resumen.por_metodo;
  const suma = Object.values(m).reduce((s, v) => s + v, 0);
  const filas = Object.entries(m).map(([k, v]) => ({ nombre: METODOS[k], valor: v, detalle: suma ? `${Math.round((v / suma) * 100)}% del día` : '' })).sort((a, b) => b.valor - a.valor);
  barrasH(cMetodo.zona, filas, { vacio: 'Sin cobros en este día' });
  cMetodo.pintarTabla([{ titulo: 'Método' }, { titulo: 'Monto', num: true }, { titulo: '%', num: true }], filas.map((f) => [f.nombre, pesos(f.valor), suma ? `${Math.round((f.valor / suma) * 100)}%` : '0%']));
}

function pintarTop() {
  const t = datos.top;
  const lista = ordenTop === 'piezas' ? t.por_piezas : t.por_importe;
  cTop.el.querySelector('.viz-nota').textContent = `Del ${diaCorto(t.desde)} al ${diaCorto(t.hasta)} · el importe es precio × cantidad, antes del descuento de mayoreo`;
  barrasH(cTop.zona, lista.map((p) => ({ nombre: p.nombre, valor: ordenTop === 'piezas' ? p.piezas : p.importe, detalle: ordenTop === 'piezas' ? pesos(p.importe) : `${p.piezas} piezas` })),
    { formatoValor: ordenTop === 'piezas' ? (v) => `${v} pzas` : pesos, vacio: 'Sin ventas en estos 7 días' });
  cTop.pintarTabla([{ titulo: 'Producto' }, { titulo: 'Piezas', num: true }, { titulo: 'Importe', num: true }], t.por_piezas.map((p) => [p.nombre, p.piezas, pesos(p.importe)]));
}

function pintarCaja(n) {
  const c = n.caja, u = n.ultimo_corte;
  const filas = [];
  const linea = (a, b, clase) => nodo('div', { class: 'linea' }, nodo('span', { texto: a }), nodo('span', { class: clase || '', texto: b }));
  filas.push(c.abierta
    ? nodo('div', { class: 'estado bien', texto: `🟢 Abierta desde las ${hhmm(c.desde)}` })
    : nodo('div', { class: 'estado', texto: '🔴 Cerrada' }));
  if (c.abierta) { filas.push(linea('Ventas del turno', `${c.num_ventas} · ${pesos(c.total_ventas)}`), linea('Efectivo esperado', pesos(c.efectivo_esperado)), linea('Abrió', c.usuario_apertura || '—')); }
  if (u) {
    const d = u.diferencia;
    filas.push(nodo('div', { class: 'viz-nota', style: 'margin-top:8px', texto: `Último corte · ${new Date(u.cierre).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}` }));
    filas.push(d === 0 ? linea('Resultado', '✔ Caja cuadrada', 'bien') : linea('Resultado', d < 0 ? `▼ Faltaron ${pesos(-d)}` : `▲ Sobraron ${pesos(d)}`, 'mal'));
  }
  $('caja').replaceChildren(...filas);
}

function pintarStock(n) {
  const s = n.stock_bajo;
  if (!s.total) { $('stock').replaceChildren(nodo('div', { class: 'estado bien', texto: '✔ Nada por reponer' })); return; }
  const l = (a, b) => nodo('div', { class: 'linea' }, nodo('span', { texto: a }), nodo('span', { class: 'estado', texto: String(b) }));
  $('stock').replaceChildren(nodo('div', { class: 'estado mal', texto: `⚠ ${s.total} por reponer` }),
    ...[['Por contar (negativo)', s.por_nivel.negativo], ['Agotados', s.por_nivel.agotado], ['Bajos', s.por_nivel.bajo]].filter(([, v]) => v).map(([a, b]) => l(a, b)),
    nodo('ul', { style: 'margin:8px 0 0;padding-left:18px;font-size:13px' }, ...s.productos.slice(0, 5).map((p) => nodo('li', { texto: `${p.nombre} (${p.stock}/${p.stock_minimo})` }))),
    nodo('a', { href: '/inventario.html', class: 'enlace', texto: 'Ver todo en Inventario' }));
}

async function cargar(dia) {
  [cHora, cSerie, cMetodo, cTop].forEach((c) => c.cargando(true)); // se mantiene el marco: solo baja la opacidad
  try {
    datos = await api.estadisticas(dia);
    diaActual = datos.dia;
    $('error').hidden = true;
    $('f-dia').value = datos.dia; $('f-dia').max = datos.hoy;
    pintarHero(datos); pintarKpis(datos.resumen); pintarHora(datos); pintarSerie(datos); pintarMetodo(datos); pintarTop(); pintarCaja(datos.negocio); pintarStock(datos.negocio);
    $('actualizado').textContent = `Actualizado ${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · zona ${datos.zona_horaria}`;
  } catch (e) { $('error').hidden = false; $('error').textContent = e.message; }
  finally { [cHora, cSerie, cMetodo, cTop].forEach((c) => c.cargando(false)); }
}

$('f-hoy').onclick = () => cargar();
$('f-ayer').onclick = () => { const d = new Date(`${datos.hoy}T12:00:00`); d.setDate(d.getDate() - 1); cargar(`${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`); };
$('f-dia').addEventListener('change', () => { if ($('f-dia').value) cargar($('f-dia').value); });
setInterval(() => { if (!document.hidden && datos && diaActual === datos.hoy) cargar(); }, 60000); // el día de hoy se refresca solo
cargar();
