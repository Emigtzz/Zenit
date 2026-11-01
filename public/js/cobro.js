import { api } from './api.js';
import { venta, totales, alternarMayoreo } from './estado.js';
import { formatear, parsearPesos } from './dinero.js';
import { abrirModal, cerrarModal, el } from './modal.js';

const METODOS = [
  ['efectivo', 'E', 'Efectivo'], ['tarjeta', 'T', 'Tarjeta'],
  ['transferencia', 'R', 'Transferencia'], ['mixto', 'M', 'Mixto'],
];

export function abrirCobro({ alCobrar, alError }) {
  let metodo = 'efectivo';
  let enviando = false;

  const total = el('div', { class: 'cobro-total' });
  const pill = el('span', { class: 'pill', texto: 'Mayoreo' });
  const botonesMetodo = el('div', { class: 'metodos' });
  const campos = el('div');
  const resultado = el('div', { class: 'cambio' });
  const error = el('p', { class: 'cambio falta', style: 'font-size:16px' });
  const iEf = el('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off' });
  const iTa = el('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off' });
  const iTr = el('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off' });
  const campo = (rotulo, input) => el('div', { class: 'campo' }, el('label', { texto: rotulo }), input);

  // Devuelve { pagos, cambio, falta } según lo escrito. Vacío en efectivo = "pago exacto".
  function calcular() {
    const t = totales().total;
    const m = (i) => (i.value.trim() === '' ? null : parsearPesos(i.value));
    if (metodo === 'tarjeta' || metodo === 'transferencia') return { pagos: [{ metodo, monto: t }], cambio: 0, falta: 0 };
    if (metodo === 'efectivo') {
      const ef = m(iEf) ?? t;
      if (ef === null) return { invalido: true };
      return { pagos: [{ metodo: 'efectivo', monto: ef }], cambio: Math.max(0, ef - t), falta: Math.max(0, t - ef) };
    }
    const ta = m(iTa) ?? 0; const tr = m(iTr) ?? 0;
    if ([m(iEf), m(iTa), m(iTr)].includes(null) && [iEf, iTa, iTr].some((i) => i.value.trim() !== '' && parsearPesos(i.value) === null)) return { invalido: true };
    const resto = t - ta - tr;
    const ef = m(iEf) ?? Math.max(0, resto); // efectivo vacío = lo que falte, exacto
    const pagos = [];
    if (ef > 0) pagos.push({ metodo: 'efectivo', monto: ef });
    if (ta > 0) pagos.push({ metodo: 'tarjeta', monto: ta });
    if (tr > 0) pagos.push({ metodo: 'transferencia', monto: tr });
    return { pagos, cambio: Math.max(0, ef - Math.max(0, resto)), falta: Math.max(0, resto - ef), exceso: ta + tr > t };
  }

  function refrescar() {
    const t = totales().total;
    total.textContent = formatear(t);
    total.append(...(venta.mayoreo ? [pill] : []));
    botonesMetodo.replaceChildren(...METODOS.map(([id, tecla, nombre]) =>
      el('button', { type: 'button', tabindex: '-1', class: 'metodo' + (id === metodo ? ' on' : ''), onclick: () => elegirMetodo(id) }, `[${tecla}] ${nombre}`)));
    const hijos = [];
    if (metodo === 'efectivo') hijos.push(campo('Efectivo recibido (Enter sin escribir = pago exacto)', iEf));
    if (metodo === 'mixto') hijos.push(campo('Efectivo recibido (vacío = lo que falte)', iEf), campo('Tarjeta', iTa), campo('Transferencia', iTr));
    campos.replaceChildren(...hijos);
    actualizarResultado();
  }
  function actualizarResultado() {
    const r = calcular();
    error.textContent = '';
    if (r.invalido) { resultado.className = 'cambio falta'; resultado.textContent = 'Monto inválido'; return; }
    if (r.exceso) { resultado.className = 'cambio falta'; resultado.textContent = 'Tarjeta/transferencia exceden el total'; return; }
    if (r.falta > 0) { resultado.className = 'cambio falta'; resultado.textContent = `Faltan ${formatear(r.falta)}`; return; }
    resultado.className = 'cambio ok';
    resultado.textContent = r.cambio > 0 ? `Cambio: ${formatear(r.cambio)}` : (metodo === 'efectivo' || metodo === 'mixto') ? 'Pago exacto' : 'Listo para cobrar';
  }
  function elegirMetodo(id) {
    metodo = id;
    refrescar();
    (id === 'efectivo' ? iEf : id === 'mixto' ? iTa : null)?.focus();
  }

  async function confirmar() {
    if (enviando) return; // evita doble envío si presionan Enter dos veces
    const r = calcular();
    if (r.invalido || r.exceso || r.falta > 0) { actualizarResultado(); return; }
    enviando = true;
    try {
      const respuesta = await api.crearVenta({
        items: venta.lineas.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad })),
        pagos: r.pagos,
        mayoreo: venta.mayoreo,
      });
      cerrarModal();
      alCobrar(respuesta);
    } catch (e) {
      enviando = false;
      error.textContent = e.message; // el servidor es la autoridad: si rechaza, la venta sigue intacta
      alError?.(e);
    }
  }

  [iEf, iTa, iTr].forEach((i) => i.addEventListener('input', actualizarResultado));

  const contenido = el('div', {},
    el('h2', { texto: 'Cobrar' }), total, botonesMetodo, campos, resultado, error,
    el('div', { class: 'fila-btn' },
      el('button', { type: 'button', tabindex: '-1', class: 'btn sec', onclick: () => cerrarModal() }, 'Esc · Volver'),
      el('button', { type: 'button', tabindex: '-1', class: 'btn', onclick: confirmar }, 'Enter · Confirmar')),
    el('p', { class: 'ayuda', texto: 'E/T/R/M método · F8 mayoreo · Tab entre campos' }));

  abrirModal({
    contenido,
    onKey(e) {
      const k = e.key.toLowerCase();
      if (e.key === 'Escape') { e.preventDefault(); cerrarModal(); }
      else if (e.key === 'Enter') { e.preventDefault(); confirmar(); }
      else if (e.key === 'F8') { e.preventDefault(); alternarMayoreo(); refrescar(); }
      else if (!e.ctrlKey && !e.altKey && !e.metaKey) {
        const m = METODOS.find(([, tecla]) => tecla.toLowerCase() === k);
        if (m) { e.preventDefault(); elegirMetodo(m[0]); } // las letras no sirven en un monto, así que no estorban
      }
    },
  });
  refrescar();
  iEf.focus();
}
