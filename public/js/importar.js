import { api, requerirDueno } from './api.js';
import { formatear, parsearPesos } from './dinero.js';
import { el } from './modal.js';
import { selectorProducto } from './selector.js';

await requerirDueno();
const $ = (id) => document.getElementById(id);
const p2 = (n) => String(n).padStart(2, '0');
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const fechaCorta = (iso) => (iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const centavosATexto = (c) => (c / 100).toFixed(2);
const msg = (e) => (Array.isArray(e.detalles) && e.detalles[0]?.campo ? e.detalles.map((d) => `${d.campo}: ${d.mensaje}`).join(' · ') : e.message);
const enteroOK = (x) => Math.abs(x - Math.round(x)) < 1e-9;

let cfg = { ia_disponible: false, costo_incluye_impuestos: true };
let imp = null;          // importación abierta en la revisión
let proveedores = [];
let filas = [];          // estado de cada renglón en la pantalla de revisión
let modoProv = 'existente';

// ================= Lista =================
async function cargarLista() {
  const pend = await api.importaciones('pendiente');
  $('vacio-pend').hidden = pend.length > 0;
  $('filas-pend').replaceChildren(...pend.map((i) => el('tr', {},
    el('td', { texto: String(i.id) }), el('td', { texto: i.archivo_nombre }), el('td', { texto: i.proveedor || '—' }), el('td', { texto: i.folio_factura || '—' }),
    el('td', { class: 'num', texto: i.total === null ? '—' : formatear(i.total) }),
    el('td', {}, el('span', { class: 'etq ' + (i.fuente === 'pdf' ? 'ia' : 'xml'), texto: i.fuente === 'pdf' ? 'PDF · IA' : 'XML' })),
    el('td', { class: 'num' }, el('button', { class: 'btn peq', type: 'button', onclick: () => abrirRevision(i.id) }, 'Revisar')))));
}
async function cargarHistorial() {
  const todas = await api.importaciones();
  $('filas-hist').replaceChildren(...todas.map((i) => el('tr', {},
    el('td', { texto: String(i.id) }), el('td', { texto: fechaCorta(i.creado_en) }), el('td', { texto: i.archivo_nombre }), el('td', { texto: i.proveedor || '—' }),
    el('td', { texto: i.folio_factura || '—' }), el('td', { class: 'num', texto: i.total === null ? '—' : formatear(i.total) }),
    el('td', {}, i.estado === 'confirmada' ? `Registrada (compra #${i.compra_id})` : i.estado === 'pendiente'
      ? el('button', { class: 'btn peq', type: 'button', onclick: () => abrirRevision(i.id) }, 'Revisar') : 'Descartada'))));
}
async function cargarEquivalencias() {
  const eq = await api.equivalencias();
  $('filas-eq').replaceChildren(...(eq.length ? eq.map((e) => el('tr', {},
    el('td', { texto: e.proveedor_nombre }), el('td', { texto: e.descripcion || '—' }), el('td', { class: 'sub', texto: e.clave_proveedor }),
    el('td', { texto: e.producto_nombre }), el('td', { class: 'num', texto: String(e.factor) }),
    el('td', { class: 'num' }, el('button', { class: 'btn sec peq', type: 'button', onclick: async () => { await api.borrarEquivalencia(e.proveedor_id, e.clave_proveedor); cargarEquivalencias(); } }, 'Borrar'))))
    : [el('tr', {}, el('td', { colspan: '6', class: 'ayuda', texto: 'Todavía no se ha aprendido nada. Se llena solo al confirmar facturas.' }))]));
}
function pestaña(cual) {
  for (const [id, sec] of [['subir', 'sec-subir'], ['hist', 'sec-hist'], ['eq', 'sec-eq']]) { $(sec).hidden = id !== cual; $(`tab-${id}`).className = 'btn' + (id === cual ? '' : ' sec'); }
  if (cual === 'subir') cargarLista(); if (cual === 'hist') cargarHistorial(); if (cual === 'eq') cargarEquivalencias();
}
$('tab-subir').onclick = () => pestaña('subir'); $('tab-hist').onclick = () => pestaña('hist'); $('tab-eq').onclick = () => pestaña('eq');

// ================= Subir =================
async function subir(archivo) {
  $('err-subir').textContent = '';
  const esPdf = /\.pdf$/i.test(archivo.name) || archivo.type === 'application/pdf';
  $('cargando').hidden = false;
  $('cargando').textContent = esPdf ? '⏳ Leyendo el PDF con IA… puede tardar hasta un minuto.' : '⏳ Leyendo la factura…';
  try {
    const r = await api.subirFactura(archivo);
    await abrirRevision(r.id, r);
  } catch (e) {
    $('err-subir').textContent = e.message;
    if (e.codigo === 'ARCHIVO_REPETIDO' && e.detalles?.importacion_id && !e.detalles.compra_id) {
      $('err-subir').append(' ', el('button', { class: 'btn peq', type: 'button', onclick: () => abrirRevision(e.detalles.importacion_id) }, 'Abrirla'));
    }
  } finally { $('cargando').hidden = true; $('archivo').value = ''; }
}
const drop = $('drop');
drop.addEventListener('click', () => $('archivo').click());
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('archivo').click(); } });
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('sobre'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('sobre'); }));
drop.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) subir(e.dataTransfer.files[0]); });
$('archivo').addEventListener('change', () => { if ($('archivo').files[0]) subir($('archivo').files[0]); });

// ================= Revisión =================
function seleccionProveedor() {
  if (modoProv === 'existente') { const v = $('p-sel').value; return v ? { proveedor_id: Number(v) } : null; }
  const nombre = $('p-nombre').value.trim();
  return nombre.length >= 2 ? { nuevo_proveedor: { nombre, rfc: $('p-rfc').value.trim() || null } } : null;
}

function pintarProveedor(factura, sugerido) {
  const sel = el('select', { id: 'p-sel' }, el('option', { value: '', texto: '— elige —' }), ...proveedores.map((p) => el('option', { value: String(p.id), texto: p.nombre })));
  if (sugerido) sel.value = String(sugerido.id);
  const nombre = el('input', { id: 'p-nombre', type: 'text', maxlength: '80', value: factura.emisor.nombre || '', placeholder: 'Nombre del proveedor', autocomplete: 'off' });
  const rfc = el('input', { id: 'p-rfc', type: 'text', maxlength: '13', value: factura.emisor.rfc || '', placeholder: 'RFC (opcional)', autocomplete: 'off', style: 'text-transform:uppercase' });
  const caja = (modo, texto, extra) => el('label', { class: 'check' }, el('input', { type: 'radio', name: 'modo-prov', ...(modo === modoProv ? { checked: '' } : {}), onchange: () => { modoProv = modo; actualizarModo(); validar(); } }), texto, extra || '');
  const bloque = el('div', {},
    caja('existente', 'Es un proveedor que ya tengo: ', sugerido ? el('span', { class: 'etq xml', texto: `reconocido por ${sugerido.coincidencia === 'rfc' ? 'RFC' : 'nombre'}` }) : ''),
    el('div', { id: 'bloque-existente', style: 'margin:4px 0 10px 26px' }, sel),
    caja('nuevo', 'Es un proveedor nuevo:'),
    el('div', { id: 'bloque-nuevo', class: 'rejilla', style: 'margin:4px 0 0 26px' }, el('div', {}, nombre), el('div', {}, rfc)));
  $('prov-bloque').replaceChildren(bloque);
  function actualizarModo() { $('bloque-existente').style.opacity = modoProv === 'existente' ? 1 : 0.4; $('bloque-nuevo').style.opacity = modoProv === 'nuevo' ? 1 : 0.4; }
  actualizarModo();
  [sel, nombre, rfc].forEach((x) => x.addEventListener('input', validar));
  sel.addEventListener('change', () => { modoProv = 'existente'; bloque.querySelector('input[name=modo-prov]').checked = true; actualizarModo(); validar(); });
}

function importeLinea(f) { return $('r-imp').checked ? f.linea.importe_con_impuestos : f.linea.importe_sin_impuestos; }

function recalcularFila(f) {
  const factor = /^\d+$/.test(f.inFactor.value.trim()) ? Number(f.inFactor.value.trim()) : null;
  f.factor = factor && factor >= 1 ? factor : null;
  f.piezas = f.factor ? f.linea.cantidad * f.factor : null;
  f.piezasOk = f.piezas !== null && f.piezas > 0 && enteroOK(f.piezas);
  f.celdaPiezas.textContent = f.piezas === null ? '—' : String(Math.round(f.piezas * 100) / 100);
  f.celdaPiezas.style.color = f.piezasOk ? '' : 'var(--error)';
  f.celdaPiezas.title = f.piezasOk ? '' : 'Las piezas deben ser un número entero: ajusta "piezas por unidad"';
  if (!f.costoManual && f.piezasOk) f.inCosto.value = centavosATexto(Math.round(importeLinea(f) / f.piezas));
  f.costo = f.inCosto.value.trim() === '' ? null : parsearPesos(f.inCosto.value);
  f.celdaCambio.replaceChildren();
  if (f.producto && f.costo) {
    f.celdaCambio.append(`${formatear(f.producto.costo)} → ${formatear(f.costo)}`);
    if (f.costo >= f.producto.precio) f.celdaCambio.append(el('div', { class: 'aviso-linea', texto: `⚠ Se vende a ${formatear(f.producto.precio)}: sin ganancia` }));
  }
  const pista = f.linea.unidad && /caja|paquete|bulto|display|fardo|c\/\d+/i.test(f.linea.unidad) && f.factor === 1 && !f.producto?.__aprendido;
  f.pistaFactor.textContent = pista ? `¿Cuántas piezas trae cada ${f.linea.unidad.toLowerCase()}?` : '';
  f.tr.classList.toggle('mal', f.incluir && !(f.producto && f.piezasOk && f.costo > 0));
}

function recalcularTodo() {
  filas.forEach(recalcularFila);
  const capturado = filas.filter((f) => f.incluir && f.piezasOk && f.costo > 0).reduce((s, f) => s + f.piezas * f.costo, 0);
  $('t-capturado').textContent = formatear(capturado);
  const total = imp.factura.total;
  $('t-factura').textContent = total === null ? '—' : formatear(total);
  $('t-capturado').style.color = total !== null && Math.abs(capturado - total) > Math.max(100, total * 0.01) ? 'var(--aviso)' : '';
  validar();
}

function validar() {
  const faltan = [];
  const bloqueada = imp.factura.advertencias.some((a) => a.startsWith('⛔'));
  if (bloqueada) faltan.push('esta factura ya está registrada');
  if (!seleccionProveedor()) faltan.push('elegir o crear el proveedor');
  const incl = filas.filter((f) => f.incluir);
  if (!incl.length) faltan.push('marcar al menos un renglón');
  const sinProd = incl.filter((f) => !f.producto).length; if (sinProd) faltan.push(`elegir el producto en ${sinProd} renglón(es)`);
  const malas = incl.filter((f) => f.producto && !f.piezasOk).length; if (malas) faltan.push(`corregir las piezas en ${malas} renglón(es)`);
  const sinCosto = incl.filter((f) => f.producto && f.piezasOk && !(f.costo > 0)).length; if (sinCosto) faltan.push(`capturar el costo en ${sinCosto} renglón(es)`);
  const fecha = $('r-fecha').value; if (!fecha || fecha > hoy()) faltan.push('poner una fecha válida (no futura)');
  $('confirmar').disabled = faltan.length > 0;
  $('err-conf').textContent = faltan.length ? `Para confirmar falta: ${faltan.join('; ')}.` : '';
  $('err-conf').style.color = faltan.length ? 'var(--suave)' : '';
}

async function fijarProducto(f, p, { aprendido = false } = {}) {
  f.producto = p ? await api.producto(p.producto_id ?? p.id) : null; // costo y precio ACTUALES
  if (f.producto) f.producto.__aprendido = aprendido;
  pintarCeldaProducto(f);
  recalcularTodo();
}

function pintarCeldaProducto(f) {
  f.celdaProducto.replaceChildren();
  if (f.producto) {
    f.celdaProducto.append(el('div', {}, el('b', { texto: f.producto.nombre }), ' ',
      el('button', { class: 'btn sec peq', type: 'button', onclick: () => { f.producto = null; f.inFactor.value = '1'; pintarCeldaProducto(f); recalcularTodo(); } }, 'Cambiar')),
    f.producto.__aprendido ? el('div', { class: 'sub', texto: '✔ aprendido de una factura anterior' }) : '');
    return;
  }
  f.celdaProducto.append(el('div', { class: 'pick' }));
  selectorProducto(f.celdaProducto.firstChild, (p) => { if (p) fijarProducto(f, p); }, { placeholder: 'Buscar producto…' });
  if (f.linea.candidatos?.length) {
    f.celdaProducto.append(el('div', { class: 'sub', texto: '¿Es alguno de estos?' }),
      ...f.linea.candidatos.map((c) => el('button', { class: 'cand', type: 'button', onclick: () => fijarProducto(f, c) }, c.nombre)));
  }
}

async function abrirRevision(id, ya) {
  imp = ya || await api.importacion(id);
  if (imp.estado !== 'pendiente') { mostrarResultado(`Esta factura ya fue ${imp.estado === 'confirmada' ? `registrada (compra #${imp.compra_id})` : 'descartada'}.`, 'adv'); pestaña('hist'); return; }
  proveedores = await api.proveedores();
  location.hash = String(imp.id);
  $('vista-lista').hidden = true; $('vista-revision').hidden = false; $('resultado').hidden = true;
  const fa = imp.factura;
  $('ver-original').href = `/api/importaciones/${imp.id}/archivo`;
  $('origen').replaceChildren(el('span', { class: 'etq ' + (imp.fuente === 'pdf' ? 'ia' : 'xml'), texto: imp.fuente === 'pdf' ? 'PDF · leído con IA: verifica todo' : `XML CFDI ${fa.version || ''}` }));
  $('advertencias').replaceChildren(...fa.advertencias.map((a) => el('div', { class: 'adv' + (a.startsWith('⛔') ? ' bloqueo' : ''), texto: a })));
  modoProv = imp.proveedor_sugerido ? 'existente' : 'nuevo';
  pintarProveedor(fa, imp.proveedor_sugerido);
  $('r-folio').value = fa.folio_factura || ''; $('r-fecha').value = fa.fecha || hoy(); $('r-fecha').max = hoy();
  $('r-uuid').textContent = fa.uuid || '— (sin UUID: PDF)'; $('r-caja').checked = false; $('r-notas').value = ''; $('r-imp').checked = imp.costo_incluye_impuestos;

  filas = fa.lineas.map((linea) => {
    const f = { linea, incluir: true, producto: null, factor: 1, costoManual: false };
    f.chk = el('input', { type: 'checkbox', checked: '', title: 'Quitar este renglón (ej. un flete o cargo que no es mercancía)' });
    f.inFactor = el('input', { type: 'text', inputmode: 'numeric', value: String(linea.sugerido?.factor || 1), autocomplete: 'off', 'aria-label': 'Piezas por unidad' });
    f.inCosto = el('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': 'Costo por pieza' });
    f.pistaFactor = el('div', { class: 'aviso-linea' });
    f.celdaProducto = el('td', { class: 'pick-celda' }); f.celdaPiezas = el('td', { class: 'num' }); f.celdaCambio = el('td');
    f.tr = el('tr', {}, el('td', {}, f.chk),
      el('td', {}, el('b', { texto: linea.descripcion }), el('div', { class: 'sub', texto: `${linea.no_identificacion ? `Clave ${linea.no_identificacion} · ` : ''}${linea.cantidad} ${linea.unidad || ''} · ${formatear(importeLinea({ linea }))}` })),
      f.celdaProducto, el('td', { class: 'num' }, f.inFactor, f.pistaFactor), f.celdaPiezas, el('td', { class: 'num' }, f.inCosto), f.celdaCambio);
    f.chk.addEventListener('change', () => { f.incluir = f.chk.checked; f.tr.classList.toggle('ignorada', !f.incluir); recalcularTodo(); });
    f.inFactor.addEventListener('input', () => { f.costoManual = false; recalcularTodo(); });
    f.inCosto.addEventListener('input', () => { f.costoManual = true; recalcularTodo(); });
    return f;
  });
  $('lineas').replaceChildren(...filas.map((f) => f.tr));
  await Promise.all(filas.map((f) => (f.linea.sugerido ? fijarProducto(f, f.linea.sugerido, { aprendido: true }) : (pintarCeldaProducto(f), null))));
  recalcularTodo();
  window.scrollTo(0, 0);
}

function volverALista() {
  imp = null; location.hash = '';
  $('vista-revision').hidden = true; $('vista-lista').hidden = false; pestaña('subir');
}

function mostrarResultado(texto, clase = 'ok-caja', extras = []) {
  const c = $('resultado'); c.hidden = false;
  c.replaceChildren(el('div', { class: clase, texto }), ...extras);
}

$('confirmar').addEventListener('click', async () => {
  $('err-conf').textContent = '';
  const prov = seleccionProveedor();
  const items = filas.filter((f) => f.incluir).map((f) => ({ linea: f.linea.indice, producto_id: f.producto.id, cantidad: Math.round(f.piezas), costo_unitario: f.costo, factor: f.factor }));
  $('confirmar').disabled = true; // un solo clic: evita registrar la compra dos veces
  try {
    const r = await api.confirmarImportacion(imp.id, { ...prov, folio_factura: $('r-folio').value, fecha: $('r-fecha').value, notas: $('r-notas').value, pagar_de_caja: $('r-caja').checked, items });
    const extras = [];
    if (r.cambios_costo.length) extras.push(el('div', { class: 'tarjeta' }, el('b', { texto: 'Costos actualizados' }), ...r.cambios_costo.map((c) => el('div', {}, `${c.nombre}: ${formatear(c.costo_anterior)} → ${formatear(c.costo_nuevo)}`))));
    if (r.advertencias.length) extras.push(el('div', { class: 'adv', texto: `⚠ Revisa el precio de venta: ${r.advertencias.map((a) => `${a.nombre} (costo ${formatear(a.costo)}, precio ${formatear(a.precio)})`).join(' · ')}` }));
    const d = r.comparacion.diferencia;
    if (d !== null && Math.abs(d) > 100) extras.push(el('div', { class: 'adv', texto: `El total registrado (${formatear(r.comparacion.total_capturado)}) difiere del de la factura (${formatear(r.comparacion.total_factura)}) por ${formatear(Math.abs(d))}.` }));
    mostrarResultado(`✔ Compra #${r.compra.id} registrada · ${formatear(r.compra.total)} · ${r.compra.proveedor_nombre}${r.compra.pagada_de_caja ? ' · retiro registrado en caja' : ''} · ${r.equivalencias_guardadas} equivalencia(s) aprendida(s)`, 'ok-caja', extras);
    volverALista();
  } catch (e) {
    $('err-conf').style.color = 'var(--error)'; $('err-conf').textContent = msg(e);
    if (e.codigo === 'YA_RESUELTA' || e.codigo === 'FACTURA_YA_REGISTRADA') volverALista();
    else $('confirmar').disabled = false;
  }
});
$('descartar').addEventListener('click', async () => {
  if (!confirm('¿Descartar esta factura? Se borra el borrador y el archivo subido; no se registra nada.')) return;
  await api.descartarImportacion(imp.id); mostrarResultado('Factura descartada.', 'adv'); volverALista();
});
$('volver').onclick = volverALista;
['r-folio', 'r-fecha', 'r-notas', 'r-caja'].forEach((id) => $(id).addEventListener('input', () => imp && validar()));
$('r-imp').addEventListener('change', () => { filas.forEach((f) => { f.costoManual = false; }); recalcularTodo(); });

// ================= Inicio =================
(async () => {
  cfg = await api.importarConfig();
  $('nota-ia').textContent = cfg.ia_disponible ? 'Los PDF se leen con IA (se envían a Anthropic). Los XML se leen aquí mismo, sin internet.'
    : 'Los XML se leen aquí mismo, sin internet. Para leer PDF hay que configurar la clave de IA (ANTHROPIC_API_KEY en el archivo .env).';
  const id = Number((location.hash || '').slice(1));
  if (id) await abrirRevision(id).catch(() => pestaña('subir')); else pestaña('subir');
})().catch((e) => { $('err-subir').textContent = e.message; });
