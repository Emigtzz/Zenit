import { api, requerirDueno } from './api.js';
import { formatear, parsearPesos } from './dinero.js';
import { el } from './modal.js';
import { selectorProducto } from './selector.js';

await requerirDueno();
const $ = (id) => document.getElementById(id);
const p2 = (n) => String(n).padStart(2, '0');
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const fechaCorta = (iso) => new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
const centavosATexto = (c) => (c / 100).toFixed(2);
const msg = (e) => (e.detalles?.length && Array.isArray(e.detalles) ? e.detalles.map((d) => `${d.campo}: ${d.mensaje}`).join(' · ') : e.message);

let proveedores = [];
const lineas = []; // { producto, inCant, inCosto, celdaImporte, celdaCambio }

// ---------- Nueva compra ----------
function pctTexto(anterior, nuevo) {
  if (!anterior) return '';
  const p = Math.round(((nuevo - anterior) / anterior) * 100);
  return p === 0 ? '' : ` (${p > 0 ? '+' : ''}${p}%)`;
}
function leerLinea(l) {
  const cant = /^\d+$/.test(l.inCant.value.trim()) ? Number(l.inCant.value.trim()) : null;
  const costo = l.inCosto.value.trim() === '' ? null : parsearPesos(l.inCosto.value);
  return { cant, costo };
}
function recalcular() {
  let total = 0;
  for (const l of lineas) {
    const { cant, costo } = leerLinea(l);
    l.celdaImporte.textContent = cant && costo ? formatear(cant * costo) : '—';
    if (cant && costo) total += cant * costo;
    const p = l.producto;
    l.celdaCambio.replaceChildren();
    if (costo) {
      l.celdaCambio.append(`${formatear(p.costo)} → ${formatear(costo)}${pctTexto(p.costo, costo)}`);
      if (costo >= p.precio) l.celdaCambio.append(el('div', { class: 'aviso-linea', texto: `⚠ Se vende a ${formatear(p.precio)}: sin ganancia` }));
    }
  }
  $('total').textContent = formatear(total);
  $('sin-lineas').hidden = lineas.length > 0;
}
async function agregarProducto(p) {
  if (!p) return;
  const existente = lineas.find((l) => l.producto.id === p.id);
  if (existente) { selCompra.limpiar(); existente.inCant.focus(); existente.inCant.select(); return; }
  const fresco = await api.producto(p.id); // costo y precio ACTUALES desde el servidor
  const inCant = el('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-label': `Cantidad de ${fresco.nombre}` });
  const inCosto = el('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', value: fresco.costo ? centavosATexto(fresco.costo) : '', 'aria-label': `Costo de ${fresco.nombre}` });
  const celdaImporte = el('td', { class: 'num' }); const celdaCambio = el('td');
  const l = { producto: fresco, inCant, inCosto, celdaImporte, celdaCambio };
  const quitar = el('button', { class: 'btn sec peq', type: 'button', onclick: () => { lineas.splice(lineas.indexOf(l), 1); l.tr.remove(); recalcular(); selCompra.enfocar(); } }, '✕');
  l.tr = el('tr', {}, el('td', { texto: fresco.nombre }), el('td', { class: 'num' }, inCant), el('td', { class: 'num' }, inCosto), celdaImporte, celdaCambio, el('td', {}, quitar));
  // Enter en cantidad -> costo; Enter en costo -> de vuelta al buscador (captura rápida solo con teclado)
  inCant.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inCosto.focus(); inCosto.select(); } });
  inCosto.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); selCompra.limpiar(); } });
  [inCant, inCosto].forEach((i) => i.addEventListener('input', recalcular));
  lineas.push(l); $('lineas').append(l.tr); recalcular();
  selCompra.limpiar(false);
  inCant.focus();
}
const selCompra = selectorProducto($('pick-compra'), (p) => { if (p) agregarProducto(p); }, { placeholder: 'Escribe el nombre o código del producto…' });

function pintarResultado(r) {
  const cont = $('resultado'); cont.hidden = false; cont.replaceChildren();
  cont.append(el('div', { class: 'ok-caja', texto: `✔ Compra #${r.compra.id} registrada · ${formatear(r.compra.total)} · ${r.compra.proveedor_nombre}` + (r.compra.pagada_de_caja ? ' · retiro registrado en caja' : '') }));
  if (r.cambios_costo.length) {
    cont.append(el('div', { class: 'tarjeta' }, el('b', { texto: 'Costos actualizados' }),
      ...r.cambios_costo.map((c) => el('div', { class: 'lin' }, el('span', { texto: c.nombre }), el('span', { texto: `${formatear(c.costo_anterior)} → ${formatear(c.costo_nuevo)}${pctTexto(c.costo_anterior, c.costo_nuevo)}` })))));
  }
  if (r.advertencias.length) {
    cont.append(el('div', { class: 'adv' }, el('b', { texto: '⚠ Revisa el precio de venta: ' }),
      r.advertencias.map((a) => `${a.nombre} (costo ${formatear(a.costo)}, precio ${formatear(a.precio)})`).join(' · '), ' → corrígelo en el Catálogo.'));
  }
}
function limpiarCaptura() {
  lineas.length = 0; $('lineas').replaceChildren(); $('c-folio').value = ''; $('c-notas').value = ''; $('c-caja').checked = false; $('c-fecha').value = hoy(); recalcular();
}
$('registrar').addEventListener('click', async () => {
  $('err-compra').textContent = '';
  const items = [];
  for (const l of lineas) {
    const { cant, costo } = leerLinea(l);
    if (!cant) { $('err-compra').textContent = `Falta la cantidad de "${l.producto.nombre}" (piezas enteras)`; l.inCant.focus(); return; }
    if (!costo) { $('err-compra').textContent = `Falta el costo de "${l.producto.nombre}" (mayor a 0)`; l.inCosto.focus(); return; }
    items.push({ producto_id: l.producto.id, cantidad: cant, costo_unitario: costo });
  }
  if (!items.length) { $('err-compra').textContent = 'Agrega al menos un producto'; return; }
  if (!$('c-prov').value) { $('err-compra').textContent = 'Elige el proveedor'; return; }
  $('registrar').disabled = true; // evita doble clic = compra duplicada
  try {
    const r = await api.registrarCompra({
      proveedor_id: Number($('c-prov').value), folio_factura: $('c-folio').value, fecha: $('c-fecha').value || undefined,
      notas: $('c-notas').value, pagar_de_caja: $('c-caja').checked, items,
    });
    pintarResultado(r); limpiarCaptura(); selCompra.enfocar();
  } catch (e) { $('err-compra').textContent = msg(e); }
  finally { $('registrar').disabled = false; }
});

// ---------- Historial ----------
let pagina = 1, viendo = null;
async function cargarHistorial() {
  const r = await api.compras({ proveedor_id: $('h-prov').value, estado: $('h-estado').value, desde: $('h-desde').value, hasta: $('h-hasta').value, pagina });
  $('filas-hist').replaceChildren(...r.filas.map((c) => el('tr', { class: c.estado === 'anulada' ? 'anulada' : '' },
    el('td', { texto: String(c.id) }), el('td', { texto: fechaCorta(c.fecha) }), el('td', { texto: c.proveedor_nombre || '—' }), el('td', { texto: c.folio_factura || '—' }),
    el('td', { class: 'num', texto: formatear(c.total) }), el('td', { texto: c.usuario_nombre || '—' }),
    el('td', { class: 'num' }, el('button', { class: 'btn sec peq', type: 'button', onclick: () => ver(c.id) }, 'Ver')))));
  const hasta = Math.min(r.total, pagina * r.por_pagina);
  $('h-info').textContent = r.total ? `${(pagina - 1) * r.por_pagina + 1}–${hasta} de ${r.total} compras` : 'Sin compras con esos filtros';
  $('h-ant').disabled = pagina <= 1; $('h-sig').disabled = hasta >= r.total;
}
const lin = (a, b, fuerte) => el('div', { class: 'lin' + (fuerte ? ' fuerte' : '') }, el('span', { texto: a }), el('span', { texto: b }));
async function ver(id) {
  viendo = await api.compra(id); const c = viendo;
  $('detalle').replaceChildren(
    el('h2', { texto: `Compra #${c.id}${c.estado === 'anulada' ? ' (ANULADA)' : ''}` }),
    lin('Proveedor', c.proveedor_nombre || '—'), lin('Factura', c.folio_factura || '—'), lin('Fecha', fechaCorta(c.fecha)), lin('Capturó', c.usuario_nombre || '—'),
    c.pagada_de_caja ? lin('Pago', 'Efectivo del cajón') : '',
    el('hr'), ...c.detalle.map((d) => lin(`${d.cantidad} × ${d.nombre} @ ${formatear(d.costo_unitario)}`, formatear(d.importe))),
    lin('Total', formatear(c.total), true),
    c.notas ? el('p', { class: 'ayuda', texto: `Notas: ${c.notas}` }) : '',
    c.estado === 'anulada' ? el('p', { class: 'ayuda', texto: `Anulada ${fechaCorta(c.anulada_en)} por ${c.anulada_por_nombre || '—'}: ${c.motivo_anulacion}` }) : '',
    c.estado === 'registrada' && c.pagada_de_caja ? el('p', { class: 'ayuda', texto: 'Se pagó con efectivo del cajón: si anulas y te devuelven el dinero, regístralo como ingreso en la caja (F6).' }) : '');
  $('bloque-anular').hidden = true; $('err-det').textContent = ''; $('a-motivo').value = '';
  $('anular').hidden = c.estado !== 'registrada'; $('anular').textContent = 'Anular compra';
  $('dlg-det').showModal();
}
$('anular').addEventListener('click', async () => {
  if ($('bloque-anular').hidden) { $('bloque-anular').hidden = false; $('anular').textContent = 'Confirmar anulación'; $('a-motivo').focus(); return; }
  try {
    const r = await api.anularCompra(viendo.id, $('a-motivo').value);
    $('dlg-det').close(); await cargarHistorial();
    const cont = $('resultado'); cont.hidden = false;
    cont.replaceChildren(el('div', { class: 'ok-caja', texto: `✔ Compra #${r.compra.id} anulada. Stock revertido.` + (r.cambios_costo.length ? ` Costos regresados: ${r.cambios_costo.map((c) => `${c.nombre} → ${formatear(c.costo_nuevo)}`).join(', ')}` : '') }));
  } catch (e) { $('err-det').textContent = msg(e); }
});
$('cerrar-det').onclick = () => $('dlg-det').close();
$('h-buscar').onclick = () => { pagina = 1; cargarHistorial(); };
$('h-ant').onclick = () => { pagina--; cargarHistorial(); }; $('h-sig').onclick = () => { pagina++; cargarHistorial(); };

// ---------- Proveedores ----------
let editando = null;
function llenarSelects() {
  const opciones = (vacio) => [el('option', { value: '', texto: vacio }), ...proveedores.filter((p) => p.activo).map((p) => el('option', { value: String(p.id), texto: p.nombre }))];
  const actual = $('c-prov').value;
  $('c-prov').replaceChildren(...opciones('— elige —')); $('c-prov').value = actual;
  $('h-prov').replaceChildren(...proveedores.map((p) => el('option', { value: String(p.id), texto: p.nombre })), ); $('h-prov').prepend(el('option', { value: '', texto: 'Todos' })); $('h-prov').value = '';
}
async function cargarProveedores() {
  proveedores = await api.proveedores(true);
  llenarSelects();
  const ver = $('p-inactivos').checked;
  $('filas-prov').replaceChildren(...proveedores.filter((p) => ver || p.activo).map((p) => el('tr', { style: p.activo ? '' : 'opacity:.5' },
    el('td', { texto: p.nombre }), el('td', { texto: p.rfc || '—' }), el('td', { texto: p.activo ? 'Activo' : 'Desactivado' }),
    el('td', { class: 'num' }, el('button', { class: 'btn sec peq', type: 'button', onclick: () => abrirProv(p) }, 'Editar')))));
}
function abrirProv(p = null) {
  editando = p; $('titulo-prov').textContent = p ? 'Editar proveedor' : 'Nuevo proveedor';
  $('pv-nombre').value = p?.nombre ?? ''; $('pv-rfc').value = p?.rfc ?? ''; $('pv-activo').checked = p ? !!p.activo : true;
  $('fila-pv-activo').hidden = !p; $('err-prov').textContent = ''; $('dlg-prov').showModal(); $('pv-nombre').focus();
}
$('form-prov').addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = { nombre: $('pv-nombre').value, rfc: $('pv-rfc').value, activo: editando ? $('pv-activo').checked : true };
  try {
    const guardado = editando ? await api.actualizarProveedor(editando.id, d) : await api.crearProveedor(d);
    $('dlg-prov').close(); await cargarProveedores();
    if (!editando) $('c-prov').value = String(guardado.id); // el recién creado queda elegido en la compra
  } catch (err) { $('err-prov').textContent = msg(err); }
});
$('nuevo-prov').onclick = () => abrirProv(); $('cancelar-prov').onclick = () => $('dlg-prov').close(); $('p-inactivos').onchange = cargarProveedores;

// ---------- Pestañas ----------
function pestaña(cual) {
  for (const [id, sec] of [['nueva', 'sec-nueva'], ['hist', 'sec-hist'], ['prov', 'sec-prov']]) {
    $(sec).hidden = id !== cual; $(`tab-${id}`).className = 'btn' + (id === cual ? '' : ' sec');
  }
  if (cual === 'hist') cargarHistorial(); if (cual === 'prov') cargarProveedores(); if (cual === 'nueva') selCompra.enfocar();
}
$('tab-nueva').onclick = () => pestaña('nueva'); $('tab-hist').onclick = () => pestaña('hist'); $('tab-prov').onclick = () => pestaña('prov');

$('c-fecha').value = hoy(); $('c-fecha').max = hoy();
cargarProveedores().then(() => { if (!proveedores.length) pestaña('prov'); else selCompra.enfocar(); }).catch((e) => alert(e.message));
recalcular();
