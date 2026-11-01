import { api } from './api.js';
import { formatear } from './dinero.js';
import { abrirModal, cerrarModal, el } from './modal.js';

// F2: el servidor hace la búsqueda tolerante a errores; aquí solo se pide mientras se escribe.
export function abrirBusqueda({ alElegir }) {
  let resultados = [];
  let sel = 0;
  let secuencia = 0; // descarta respuestas viejas que lleguen tarde (el usuario ya escribió más)

  const entrada = el('input', { type: 'text', placeholder: 'Escribe el nombre… (tolera errores: "galetas")', autocomplete: 'off', spellcheck: 'false' });
  const lista = el('ul', { class: 'resultados', role: 'listbox' });
  const contenido = el('div', {},
    el('h2', { texto: 'Buscar producto' }), entrada, lista,
    el('p', { class: 'ayuda', texto: '↑↓ mover · Enter agregar · Esc cerrar' }));

  function pintar() {
    lista.replaceChildren();
    if (!resultados.length && entrada.value.trim()) {
      lista.append(el('li', { texto: 'Sin resultados' }));
      return;
    }
    resultados.forEach((p, i) => {
      const izq = el('span', {}, p.nombre, el('span', { class: 'cat', texto: p.categoria_nombre || '' }));
      const li = el('li', { class: i === sel ? 'sel' : '', role: 'option', onclick: () => elegir(i) }, izq, el('strong', { texto: formatear(p.precio) }));
      lista.append(li);
      if (i === sel) li.scrollIntoView({ block: 'nearest' });
    });
  }
  function elegir(i) {
    const p = resultados[i];
    if (!p) return;
    cerrarModal();
    alElegir(p);
  }

  entrada.addEventListener('input', async () => {
    const mi = ++secuencia;
    const q = entrada.value.trim();
    if (!q) { resultados = []; return pintar(); }
    try {
      const r = await api.buscar(q);
      if (mi !== secuencia) return;
      resultados = r; sel = 0; pintar();
    } catch { /* si falla una consulta, la siguiente tecla reintenta */ }
  });

  abrirModal({
    contenido,
    onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); cerrarModal(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (resultados.length) { sel = (sel + 1) % resultados.length; pintar(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (resultados.length) { sel = (sel - 1 + resultados.length) % resultados.length; pintar(); } }
      else if (e.key === 'Enter') { e.preventDefault(); elegir(sel); }
    },
  });
  entrada.focus();
}
