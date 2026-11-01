import { venta, totales } from './estado.js';
import { formatear } from './dinero.js';

const $ = (id) => document.getElementById(id);

// textContent (no innerHTML) con datos de productos: evita inyectar HTML desde nombres.
export function pintarTicket() {
  const cuerpo = $('lineas');
  cuerpo.replaceChildren();
  venta.lineas.forEach((l, i) => {
    const tr = document.createElement('tr');
    if (i === venta.seleccion) tr.className = 'sel';
    for (const [texto, clase] of [[l.nombre], [String(l.cantidad), 'num'], [formatear(l.precio), 'num'], [formatear(l.precio * l.cantidad), 'num']]) {
      const td = document.createElement('td');
      td.textContent = texto;
      if (clase) td.className = clase;
      tr.append(td);
    }
    cuerpo.append(tr);
    if (i === venta.seleccion) tr.scrollIntoView({ block: 'nearest' });
  });
  $('vacio').hidden = venta.lineas.length > 0;
  const t = totales();
  $('t-piezas').textContent = t.piezas;
  $('t-subtotal').textContent = formatear(t.subtotal);
  $('t-total').textContent = formatear(t.total);
  $('fila-desc').hidden = !venta.mayoreo;
  $('t-pct').textContent = `${venta.pctMayoreo}%`;
  $('t-desc').textContent = '-' + formatear(t.descuento);
}

let temporizador;
export function avisar(texto, tipo = 'aviso', ms = 4000) {
  const el = $('aviso');
  el.textContent = texto;
  el.className = tipo;
  el.hidden = false;
  clearTimeout(temporizador);
  if (ms) temporizador = setTimeout(() => (el.hidden = true), ms);
}
export function pitar(grave = false) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = grave ? 180 : 880; g.gain.value = 0.15;
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + (grave ? 0.35 : 0.08));
    o.onended = () => ctx.close();
  } catch { /* sin audio: no pasa nada */ }
}

export function pintarBotones(botones, categoriaActiva, alElegirCategoria, alElegirProducto) {
  const cats = new Map();
  botones.forEach((p) => cats.set(p.categoria_id, { nombre: p.categoria_nombre, color: p.categoria_color }));
  const chips = $('chips');
  chips.replaceChildren();
  const hacerChip = (id, nombre, color) => {
    const b = document.createElement('button');
    b.type = 'button'; b.tabIndex = -1; b.className = 'chip' + (categoriaActiva === id ? ' on' : '');
    b.textContent = nombre;
    if (color) b.style.setProperty('--c', color);
    b.addEventListener('click', () => alElegirCategoria(id));
    chips.append(b);
  };
  hacerChip(null, 'Todos');
  cats.forEach((c, id) => hacerChip(id, c.nombre ?? 'Sin categoría', c.color));

  const cont = $('botones');
  cont.replaceChildren();
  botones.filter((p) => categoriaActiva === null || p.categoria_id === categoriaActiva).forEach((p) => {
    const b = document.createElement('button');
    b.type = 'button'; b.tabIndex = -1; b.className = 'boton';
    b.style.setProperty('--c', p.categoria_color || '#64748b');
    const n = document.createElement('span'); n.textContent = p.nombre;
    const pr = document.createElement('small'); pr.textContent = formatear(p.precio);
    b.append(n, pr);
    b.addEventListener('click', () => alElegirProducto(p));
    cont.append(b);
  });
}

export function iniciarReloj() {
  const el = $('reloj');
  const tick = () => (el.textContent = new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }));
  tick(); setInterval(tick, 15000);
}
