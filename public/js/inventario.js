import { api } from './api.js';
import { el } from './modal.js';

const $ = (id) => document.getElementById(id);
const MODOS = [
  ['entrada', '➕ Entrada (sumar)', 'Piezas a sumar'],
  ['salida', '➖ Salida (restar)', 'Piezas a restar'],
  ['conteo', '🧮 Conteo físico', 'Piezas que CONTASTE en estante'],
];
let motivos = [], producto = null, modo = 'conteo';

// ---------- Selector de producto (reutilizable) ----------
// Escribe → pide /productos/buscar (tolerante a errores) → ↑↓ Enter elige.
function selectorProducto(contenedor, alElegir, { placeholder }) {
  const entrada = el('input', { type: 'text', placeholder, autocomplete: 'off', spellcheck: 'false' });
  const lista = el('ul', { hidden: '' });
  const quitar = el('button', { type: 'button', class: 'quitar', title: 'Quitar', hidden: '', onclick: () => limpiar() }, '×');
  contenedor.append(entrada, quitar, lista);
  let res = [], sel = 0, seq = 0, elegido = false;

  function limpiar() { entrada.value = ''; elegido = false; quitar.hidden = true; lista.hidden = true; entrada.disabled = false; alElegir(null); entrada.focus(); }
  function pintar() {
    lista.replaceChildren(...(res.length ? res.map((p, i) => el('li', { class: i === sel ? 'sel' : '', onmousedown: (e) => { e.preventDefault(); elegir(i); } },
      el('span', { texto: p.nombre }), el('span', { class: 'etq', texto: p.categoria_nombre || 'sin categoría' })))
      : [el('li', { texto: 'Sin resultados' })]));
    lista.hidden = false;
  }
  function elegir(i) { fijar(res[i]); }
  function fijar(p) {
    if (!p) return;
    entrada.value = p.nombre; elegido = true; entrada.disabled = true; quitar.hidden = false; lista.hidden = true;
    alElegir(p);
  }
  entrada.addEventListener('input', async () => {
    const q = entrada.value.trim(); const mi = ++seq;
    if (!q) { lista.hidden = true; return; }
    const r = await api.buscar(q).catch(() => []);
    if (mi !== seq) return;
    res = r; sel = 0; pintar();
  });
  entrada.addEventListener('keydown', (e) => {
    if (lista.hidden || elegido) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, res.length); pintar(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + res.length) % Math.max(1, res.length); pintar(); }
    else if (e.key === 'Enter') { e.preventDefault(); elegir(sel); }
    else if (e.key === 'Escape') { lista.hidden = true; }
  });
  entrada.addEventListener('blur', () => setTimeout(() => (lista.hidden = true), 120));
  return { limpiar, fijar, enfocar: () => entrada.focus() };
}

// ---------- Ajuste ----------
function pintarModos() {
  $('modos').replaceChildren(...MODOS.map(([id, texto]) =>
    el('label', { class: id === modo ? 'on' : '' }, el('input', { type: 'radio', name: 'modo', value: id, ...(id === modo ? { checked: '' } : {}), onchange: () => { modo = id; pintarModos(); vista(); } }), texto)));
  $('l-cant').textContent = MODOS.find((m) => m[0] === modo)[2];
}
function calcularDelta() {
  const c = $('a-cant').value.trim();
  if (!/^\d+$/.test(c) || !producto) return null;
  const n = Number(c);
  return modo === 'entrada' ? n : modo === 'salida' ? -n : n - producto.stock;
}
function vista() {
  const d = calcularDelta();
  const v = $('vista');
  if (d === null) { v.textContent = ''; return; }
  if (d === 0) { v.textContent = 'Sin diferencia: el conteo coincide con el sistema.'; v.className = 'vista'; return; }
  const nuevo = producto.stock + d;
  v.className = 'vista ' + (nuevo < 0 ? 'menos' : '');
  v.textContent = `Stock: ${producto.stock} → ${nuevo}  (${d > 0 ? '+' : ''}${d})`;
}
async function elegirProducto(p) {
  $('err-ajuste').textContent = '';
  if (!p) { producto = null; $('form-ajuste').hidden = true; $('ficha').textContent = ''; return; }
  producto = await api.producto(p.id); // stock ACTUAL desde el servidor (el índice de búsqueda puede estar atrasado)
  $('ficha').textContent = `Existencia en sistema: ${producto.stock} · mínimo: ${producto.stock_minimo}` + (producto.activo ? '' : ' · (producto desactivado)');
  $('form-ajuste').hidden = false;
  $('a-cant').value = ''; $('a-nota').value = ''; vista();
  $('a-cant').focus();
}
$('a-cant').addEventListener('input', vista);
$('form-ajuste').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('err-ajuste').textContent = '';
  const cantidad = Number($('a-cant').value);
  if (!/^\d+$/.test($('a-cant').value.trim())) { $('err-ajuste').textContent = 'La cantidad debe ser un número entero'; return; }
  $('btn-ajuste').disabled = true; // evita doble clic
  try {
    const r = await api.ajustar({ producto_id: producto.id, modo, cantidad, motivo: $('a-motivo').value, nota: $('a-nota').value });
    $('alerta').hidden = false; $('alerta').style.background = 'var(--ok)';
    $('alerta').textContent = `✔ ${r.nombre}: ${r.stock_anterior} → ${r.stock_nuevo} (${r.diferencia > 0 ? '+' : ''}${r.diferencia})`;
    setTimeout(() => ($('alerta').hidden = true), 5000);
    selAjuste.limpiar();
    verificar();
  } catch (err) {
    $('err-ajuste').textContent = err.detalles?.length ? err.detalles.map((d) => `${d.campo}: ${d.mensaje}`).join(' · ') : err.message;
  } finally { $('btn-ajuste').disabled = false; }
});

// ---------- Kárdex ----------
let pagina = 1, kProducto = null, ultimo = null;
const fmtFecha = (iso) => new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
const nombreMotivo = (id) => motivos.find((m) => m.id === id)?.nombre || id;
async function consultar() {
  const r = await api.kardex({ producto_id: kProducto?.id, tipo: $('k-tipo').value, desde: $('k-desde').value, hasta: $('k-hasta').value, pagina, por_pagina: 50 });
  ultimo = r;
  $('filas').replaceChildren(...r.filas.map((f) => el('tr', {},
    el('td', { texto: fmtFecha(f.fecha) }),
    el('td', { texto: f.producto_nombre }),
    el('td', {}, el('span', { class: 'etq', texto: f.tipo })),
    el('td', { class: 'num ' + (f.cantidad > 0 ? 'mas' : 'menos'), texto: (f.cantidad > 0 ? '+' : '') + f.cantidad }),
    el('td', { class: 'num', texto: String(f.saldo) }),
    el('td', { texto: [f.motivo && nombreMotivo(f.motivo), f.nota, !f.motivo && f.referencia].filter(Boolean).join(' · ') }))));
  const hasta = Math.min(r.total, r.pagina * r.por_pagina);
  $('k-info').textContent = r.total ? `${(r.pagina - 1) * r.por_pagina + 1}–${hasta} de ${r.total} movimientos` : 'Sin movimientos con esos filtros';
  $('k-ant').disabled = pagina <= 1; $('k-sig').disabled = hasta >= r.total;
}
$('k-buscar').onclick = () => { pagina = 1; consultar(); };
$('k-ant').onclick = () => { pagina--; consultar(); };
$('k-sig').onclick = () => { pagina++; consultar(); };

// ---------- Integridad: el stock debe ser igual a la suma del kárdex ----------
async function verificar() {
  const r = await api.verificarInventario().catch(() => null);
  if (r && !r.consistente) {
    $('alerta').hidden = false; $('alerta').style.background = 'var(--aviso)';
    $('alerta').textContent = `⚠ ${r.productos.length} producto(s) con stock distinto a su kárdex (ej.: ${r.productos[0].nombre}: sistema ${r.productos[0].stock}, kárdex ${r.productos[0].esperado}). Haz un conteo físico para corregirlo.`;
  }
}

// ---------- Stock bajo ----------
const NIVELES = { negativo: 'Contar (negativo)', agotado: 'Agotado', bajo: 'Bajo' };
async function cargarBajo() {
  const r = await api.stockBajo();
  $('badge-bajo').hidden = r.total === 0;
  $('badge-bajo').textContent = r.total;
  const n = r.por_nivel;
  $('resumen-bajo').textContent = r.total ? `${r.total} por reponer: ${n.negativo} por contar, ${n.agotado} agotados, ${n.bajo} bajos` : '';
  $('vacio-bajo').hidden = r.total !== 0;
  $('filas-bajo').replaceChildren(...r.productos.map((p) => el('tr', {},
    el('td', {}, el('span', { class: 'nivel ' + p.nivel, texto: NIVELES[p.nivel] })),
    el('td', { texto: p.nombre }),
    el('td', { texto: p.categoria_nombre || '—' }),
    el('td', { class: 'num', texto: String(p.stock) }),
    el('td', { class: 'num', texto: String(p.stock_minimo) }),
    el('td', { class: 'num', texto: p.faltante ? String(p.faltante) : '—' }),
    el('td', { class: 'num no-print' }, el('button', { class: 'btn sec peq', type: 'button', onclick: () => { pestaña('ajuste'); selAjuste.limpiar(); selAjuste.fijar(p); } }, 'Ajustar')))));
  return r;
}
$('imprimir-bajo').onclick = () => window.print();

// ---------- Pestañas e inicio ----------
function pestaña(cual) {
  $('sec-bajo').hidden = cual !== 'bajo';
  $('tab-bajo').className = 'btn' + (cual === 'bajo' ? '' : ' sec');
  if (cual === 'bajo') cargarBajo();
  $('sec-ajuste').hidden = cual !== 'ajuste'; $('sec-kardex').hidden = cual !== 'kardex';
  $('tab-ajuste').className = 'btn' + (cual === 'ajuste' ? '' : ' sec');
  $('tab-kardex').className = 'btn' + (cual === 'kardex' ? '' : ' sec');
  if (cual === 'kardex') consultar();
}
$('tab-bajo').onclick = () => pestaña('bajo'); $('tab-ajuste').onclick = () => pestaña('ajuste'); $('tab-kardex').onclick = () => pestaña('kardex');
const selAjuste = selectorProducto($('pick-ajuste'), elegirProducto, { placeholder: 'Escribe el nombre o código del producto…' });
selectorProducto($('pick-kardex'), (p) => { kProducto = p; pagina = 1; }, { placeholder: 'Todos los productos' });

(async () => {
  motivos = await api.motivos();
  $('a-motivo').replaceChildren(...motivos.map((m) => el('option', { value: m.id, texto: m.nombre })));
  pintarModos();
  verificar();
  // Si hay algo por reponer, esa es la primera pantalla; si no, directo a ajustar.
  const bajo = await cargarBajo();
  if (bajo.total) pestaña('bajo'); else { pestaña('ajuste'); selAjuste.enfocar(); }
})().catch((e) => { $('alerta').hidden = false; $('alerta').textContent = e.message; });
