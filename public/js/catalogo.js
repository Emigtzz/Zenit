import { api } from './api.js';
import { formatear, parsearPesos } from './dinero.js';
import { el } from './modal.js';

const $ = (id) => document.getElementById(id);
let productos = [], categorias = [];
let editandoProd = null, editandoCat = null;

const centavosATexto = (c) => (c / 100).toFixed(2);

async function cargar() {
  [productos, categorias] = await Promise.all([api.productosTodos(), api.categorias()]);
  pintarProductos(); pintarCategorias();
}

function pintarProductos() {
  const q = $('filtro').value.trim().toLowerCase();
  const verInactivos = $('ver-inactivos').checked;
  const filas = productos
    .filter((p) => (verInactivos || p.activo) && (!q || [p.nombre, p.codigo_barras, p.codigo_corto].some((v) => (v || '').toLowerCase().includes(q))))
    .map((p) => {
      const tr = el('tr', { class: p.activo ? '' : 'inactivo' },
        el('td', { texto: p.nombre }),
        el('td', {}, el('span', { class: 'swatch', style: `background:${p.categoria_color || '#64748b'}` }), p.categoria_nombre || '—'),
        el('td', { texto: [p.codigo_barras, p.codigo_corto && `#${p.codigo_corto}`].filter(Boolean).join('  ') || 'sin código' }),
        el('td', { class: 'num', texto: formatear(p.costo) }),
        el('td', { class: 'num', texto: formatear(p.precio) }),
        el('td', { class: 'num', texto: String(p.stock) }),
        el('td', { class: 'num' },
          el('button', { class: 'btn sec peq', type: 'button', onclick: () => abrirProducto(p) }, 'Editar'), ' ',
          p.activo
            ? el('button', { class: 'btn sec peq', type: 'button', onclick: () => desactivarProducto(p) }, 'Desactivar')
            : el('button', { class: 'btn sec peq', type: 'button', onclick: () => reactivarProducto(p) }, 'Reactivar')));
      return tr;
    });
  $('filas-prod').replaceChildren(...filas);
}

function pintarCategorias() {
  $('filas-cat').replaceChildren(...categorias.map((c) => el('tr', {},
    el('td', {}, el('span', { class: 'swatch', style: `background:${c.color}` }), c.nombre),
    el('td', { class: 'num' },
      el('button', { class: 'btn sec peq', type: 'button', onclick: () => abrirCategoria(c) }, 'Editar'), ' ',
      el('button', { class: 'btn sec peq', type: 'button', onclick: () => desactivarCategoria(c) }, 'Desactivar')))));
  const opciones = [el('option', { value: '', texto: 'Sin categoría' }), ...categorias.map((c) => el('option', { value: String(c.id), texto: c.nombre }))];
  $('p-cat').replaceChildren(...opciones);
}

// ---- Productos ----
function abrirProducto(p = null) {
  editandoProd = p;
  $('titulo-prod').textContent = p ? 'Editar producto' : 'Nuevo producto';
  $('p-nombre').value = p?.nombre ?? '';
  $('p-barras').value = p?.codigo_barras ?? '';
  $('p-corto').value = p?.codigo_corto ?? '';
  $('p-cat').value = p?.categoria_id ? String(p.categoria_id) : '';
  $('p-min').value = p?.stock_minimo ?? 0;
  $('p-costo').value = centavosATexto(p?.costo ?? 0);
  $('p-precio').value = p ? centavosATexto(p.precio) : '';
  $('p-stock').value = p?.stock ?? 0;
  $('p-stock').disabled = !!p; // el stock solo se mueve por kárdex (ajustes: fase 2)
  $('p-boton').checked = !!p?.boton_rapido;
  $('p-activo').checked = p ? !!p.activo : true;
  $('fila-activo').hidden = !p;
  $('err-prod').textContent = '';
  $('dlg-prod').showModal();
  $('p-nombre').focus();
}
$('form-prod').addEventListener('submit', async (e) => {
  e.preventDefault();
  const precio = parsearPesos($('p-precio').value);
  const costo = parsearPesos($('p-costo').value || '0');
  if (precio === null || costo === null) { $('err-prod').textContent = 'Precio y costo deben ser montos válidos (ej. 12.50)'; return; }
  const datos = {
    nombre: $('p-nombre').value, codigo_barras: $('p-barras').value, codigo_corto: $('p-corto').value,
    categoria_id: $('p-cat').value ? Number($('p-cat').value) : null,
    costo, precio, stock_minimo: Number($('p-min').value) || 0,
    boton_rapido: $('p-boton').checked ? 1 : 0, activo: $('p-activo').checked ? 1 : 0,
  };
  if (!editandoProd) datos.stock = Number($('p-stock').value) || 0;
  try {
    editandoProd ? await api.actualizarProducto(editandoProd.id, datos) : await api.crearProducto(datos);
    $('dlg-prod').close(); await cargar();
  } catch (err) {
    $('err-prod').textContent = err.detalles?.length ? err.detalles.map((d) => `${d.campo}: ${d.mensaje}`).join(' · ') : err.message;
  }
});
async function desactivarProducto(p) {
  if (!confirm(`¿Desactivar "${p.nombre}"? Ya no se podrá vender, pero su historial se conserva.`)) return;
  await api.desactivarProducto(p.id); await cargar();
}
async function reactivarProducto(p) {
  await api.actualizarProducto(p.id, { ...p, activo: 1 }); await cargar();
}

// ---- Categorías ----
function abrirCategoria(c = null) {
  editandoCat = c;
  $('titulo-cat').textContent = c ? 'Editar categoría' : 'Nueva categoría';
  $('c-nombre').value = c?.nombre ?? '';
  $('c-color').value = c?.color ?? '#64748b';
  $('err-cat').textContent = '';
  $('dlg-cat').showModal();
  $('c-nombre').focus();
}
$('form-cat').addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = { nombre: $('c-nombre').value, color: $('c-color').value, activo: 1 };
  try {
    editandoCat ? await api.actualizarCategoria(editandoCat.id, datos) : await api.crearCategoria(datos);
    $('dlg-cat').close(); await cargar();
  } catch (err) { $('err-cat').textContent = err.message; }
});
async function desactivarCategoria(c) {
  if (!confirm(`¿Desactivar la categoría "${c.nombre}"? Los productos conservan su categoría.`)) return;
  await api.desactivarCategoria(c.id); await cargar();
}

// ---- Pestañas y eventos ----
function pestaña(cual) {
  $('sec-prod').hidden = cual !== 'prod'; $('sec-cat').hidden = cual !== 'cat';
  $('tab-prod').className = 'btn' + (cual === 'prod' ? '' : ' sec');
  $('tab-cat').className = 'btn' + (cual === 'cat' ? '' : ' sec');
}
$('tab-prod').onclick = () => pestaña('prod'); $('tab-cat').onclick = () => pestaña('cat');
$('nuevo-prod').onclick = () => abrirProducto(); $('nueva-cat').onclick = () => abrirCategoria();
$('cancel-prod').onclick = () => $('dlg-prod').close(); $('cancel-cat').onclick = () => $('dlg-cat').close();
$('filtro').addEventListener('input', pintarProductos); $('ver-inactivos').addEventListener('change', pintarProductos);
cargar().catch((e) => alert(e.message));
