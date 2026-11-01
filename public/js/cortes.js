import { api, requerirDueno } from './api.js';
import { formatear } from './dinero.js';
import { el } from './modal.js';

await requerirDueno();
const $ = (id) => document.getElementById(id);
const fecha = (iso) => (iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '');
let pagina = 1, viendo = null;

function celdaDif(c) {
  if (!c.cierre) return el('td', { class: 'num' }, el('span', { class: 'abierto', texto: 'abierto' }));
  const d = c.diferencia;
  return el('td', { class: 'num ' + (d === 0 ? 'cero' : d > 0 ? 'mas' : 'menos'), texto: d === 0 ? '$0.00' : (d > 0 ? '+' : '') + formatear(d) });
}

async function cargar() {
  const r = await api.cortes(pagina);
  $('vacio').hidden = r.total > 0;
  $('filas').replaceChildren(...r.filas.map((c) => el('tr', {},
    el('td', { texto: String(c.id) }), el('td', { texto: fecha(c.apertura) }), el('td', { texto: fecha(c.cierre) || '—' }),
    el('td', { texto: [c.usuario_apertura, c.usuario_cierre].filter((v, i, a) => v && a.indexOf(v) === i).join(' → ') || '—' }),
    el('td', { class: 'num', texto: c.cierre ? String(c.num_ventas) : '—' }),
    el('td', { class: 'num', texto: c.cierre ? formatear(c.total_ventas) : '—' }),
    el('td', { class: 'num', texto: c.cierre ? formatear(c.efectivo_esperado) : '—' }),
    el('td', { class: 'num', texto: c.cierre ? formatear(c.efectivo_contado) : '—' }),
    celdaDif(c),
    el('td', { class: 'num' }, el('button', { class: 'btn sec peq', type: 'button', onclick: () => ver(c.id) }, 'Ver')))));
  const hasta = Math.min(r.total, pagina * r.por_pagina);
  $('info').textContent = r.total ? `${(pagina - 1) * r.por_pagina + 1}–${hasta} de ${r.total} cortes` : '';
  $('ant').disabled = pagina <= 1; $('sig').disabled = hasta >= r.total;
}

const lin = (a, b, fuerte) => el('div', { class: 'lin' + (fuerte ? ' fuerte' : '') }, el('span', { texto: a }), el('span', { texto: b }));
async function ver(id) {
  viendo = id;
  const d = await api.corte(id); const c = d.corte;
  const dif = c.diferencia;
  $('detalle').replaceChildren(
    el('h2', { texto: `Corte #${String(c.id).padStart(6, '0')}` }),
    lin('Apertura', `${fecha(c.apertura)} · ${c.usuario_apertura || '—'}`),
    lin('Cierre', c.cierre ? `${fecha(c.cierre)} · ${c.usuario_cierre || '—'}` : 'ABIERTO'),
    el('h3', { texto: 'Ventas' }),
    lin(`Total (${d.num_ventas} ventas)`, formatear(d.total_ventas), true),
    d.descuentos ? lin('  incluye descuento de mayoreo', '-' + formatear(d.descuentos)) : '',
    lin('Efectivo', formatear(d.ventas_efectivo)), lin('Tarjeta', formatear(d.ventas_tarjeta)), lin('Transferencia', formatear(d.ventas_transferencia)),
    el('h3', { texto: 'Por cajero' }),
    ...(d.por_cajero.length ? d.por_cajero.map((x) => lin(`${x.nombre} (${x.num_ventas})`, formatear(x.total))) : [el('div', { class: 'ayuda', texto: 'Sin ventas' })]),
    el('h3', { texto: 'Efectivo del cajón' }),
    lin('Fondo inicial', formatear(c.fondo_inicial)), lin('+ Ventas en efectivo', formatear(d.ventas_efectivo)),
    lin('+ Ingresos', formatear(d.ingresos)), lin('− Retiros', formatear(d.retiros)),
    ...d.movimientos.map((m) => el('div', { class: 'ayuda', texto: `   ${m.tipo === 'ingreso' ? '+' : '−'}${formatear(m.monto)} · ${m.motivo} (${m.usuario_nombre || '—'})` })),
    lin('Esperado', formatear(d.efectivo_esperado), true),
    c.cierre ? lin('Contado', formatear(c.efectivo_contado), true) : '',
    c.cierre ? el('div', { class: 'lin fuerte ' + (dif === 0 ? 'cero' : dif > 0 ? 'mas' : 'menos') }, el('span', { texto: dif < 0 ? 'FALTANTE' : dif > 0 ? 'SOBRANTE' : 'Cuadrada' }), el('span', { texto: dif === 0 ? '$0.00' : formatear(Math.abs(dif)) })) : '',
    c.notas ? el('p', { class: 'ayuda', texto: `Notas: ${c.notas}` }) : '');
  $('imprimir').disabled = !c.cierre;
  $('dlg').showModal();
}

$('ant').onclick = () => { pagina--; cargar(); }; $('sig').onclick = () => { pagina++; cargar(); };
$('cerrar').onclick = () => $('dlg').close();
$('imprimir').onclick = async () => { await api.imprimirCorte(viendo); $('imprimir').textContent = '✔ Enviado a la impresora'; setTimeout(() => ($('imprimir').textContent = '🖨 Reimprimir'), 2500); };
cargar().catch((e) => alert(e.message));
