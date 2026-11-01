// Un solo modal a la vez. Mientras hay uno abierto, las teclas las atiende el modal (onKey), no la pantalla de venta.
let actual = null;

export function modalActivo() { return actual; }

export function abrirModal({ contenido, onKey, alCerrar }) {
  cerrarModal();
  const velo = document.createElement('div');
  velo.className = 'velo';
  const caja = document.createElement('div');
  caja.className = 'modal';
  caja.setAttribute('role', 'dialog');
  caja.setAttribute('aria-modal', 'true');
  caja.append(contenido);
  velo.append(caja);
  document.getElementById('modal-raiz').append(velo);
  actual = { velo, onKey, alCerrar };
  return actual;
}

export function cerrarModal() {
  if (!actual) return;
  const { velo, alCerrar } = actual;
  actual = null;
  velo.remove();
  alCerrar?.();
}

// Crea elementos sin escribir HTML a mano (y sin riesgo de inyección).
export function el(tag, props = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'texto') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  e.append(...hijos);
  return e;
}
