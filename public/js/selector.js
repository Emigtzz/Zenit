import { api } from './api.js';
import { el } from './modal.js';

// Selector de producto con búsqueda tolerante a errores (lo usan Inventario y Compras).
// Escribe → pide /productos/buscar (tolerante a errores) → ↑↓ Enter elige.
export function selectorProducto(contenedor, alElegir, { placeholder }) {
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

