// Gráficas sin dependencias (SVG/HTML). Las usan la pantalla de estadísticas de la caja y la app del dueño.
// Reglas: una serie = un color · barras ≤ 24 px con el extremo de datos redondeado a 4 px · rejilla en hairline ·
// etiquetas solo donde importan · tooltip también con teclado · vista de tabla en cada gráfica · TODO texto con textContent.

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...hijos) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...hijos);
  return e;
};
const html = (tag, attrs = {}, ...hijos) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k === 'texto') e.textContent = v; else e.setAttribute(k, v); }
  e.append(...hijos);
  return e;
};

// ---- formato de dinero (los importes viven en CENTAVOS) ----
export function pesos(centavos) {
  const neg = centavos < 0 ? '-' : '';
  const a = Math.abs(Math.round(centavos));
  return `${neg}$${Math.floor(a / 100).toLocaleString('en-US')}.${String(a % 100).padStart(2, '0')}`;
}
export const pesosEnteros = (centavos) => `${centavos < 0 ? '-' : ''}$${Math.round(Math.abs(centavos) / 100).toLocaleString('en-US')}`;
// Eje: completo por debajo de 10,000 ("$2,000"), compacto cuando lo alcanza ("$12K")
function pesosEje(centavos) {
  const p = centavos / 100;
  return p >= 10000 ? `$${Math.round(p / 1000)}K` : `$${Math.round(p).toLocaleString('en-US')}`;
}

// 4 marcas "redondas" (1-2-5 × 10^k) que cubran el máximo
export function ticksLimpios(maxCentavos) {
  const max = Math.max(maxCentavos / 100, 1);
  const bruto = max / 4;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 5, 10].map((m) => m * pot).find((p) => p >= bruto);
  const n = Math.ceil(max / paso);
  return Array.from({ length: n + 1 }, (_, i) => Math.round(i * paso * 100));
}

// ---- tooltip único por gráfica ----
function crearTooltip(zona) {
  const tip = html('div', { class: 'viz-tip', role: 'tooltip' });
  tip.hidden = true;
  zona.append(tip);
  return {
    mostrar(x, y, valor, etiqueta, detalle) {
      tip.replaceChildren(html('b', { texto: valor }), html('span', { texto: etiqueta }), ...(detalle ? [html('br'), html('span', { texto: detalle })] : []));
      tip.hidden = false;
      const maxX = zona.clientWidth - tip.offsetWidth / 2;
      tip.style.left = `${Math.max(tip.offsetWidth / 2, Math.min(x, maxX))}px`;
      tip.style.top = `${Math.max(tip.offsetHeight + 4, y)}px`;
    },
    ocultar() { tip.hidden = true; },
  };
}

// ---- COLUMNAS ----
// datos: [{ etiqueta, valor (centavos u otra unidad), resaltar?, detalle? }]
// opciones: { formatoValor, formatoEje, etiquetaX(d,i) -> texto|null, altura, enfasis (resaltar uno y el resto en gris) }
export function columnas(zona, datos, { formatoValor = pesos, formatoEje = pesosEje, etiquetaX = (d) => d.etiqueta, altura = 200, enfasis = false } = {}) {
  zona.replaceChildren();
  if (!datos.length || datos.every((d) => !d.valor)) { zona.append(html('div', { class: 'viz-vacio', texto: 'Sin ventas en este periodo' })); return; }
  const ancho = Math.max(zona.clientWidth || 600, 280);
  const m = { i: 46, d: 8, s: 16, b: 24 };
  const W = ancho - m.i - m.d, H = altura - m.s - m.b;
  const ticks = ticksLimpios(Math.max(...datos.map((d) => d.valor)));
  const techo = ticks[ticks.length - 1] || 1;
  const y = (v) => m.s + H - (v / techo) * H;
  const banda = W / datos.length;
  const grosor = Math.min(24, Math.max(3, banda - 2));  // ≤ 24 px; 2 px de aire entre barras vecinas
  const cada = Math.ceil(34 / banda);                   // cada cuántas etiquetas del eje X cabe una
  const imax = datos.reduce((mi, d, i) => (d.valor > datos[mi].valor ? i : mi), 0);

  const raiz = svg('svg', { class: 'viz-svg', viewBox: `0 0 ${ancho} ${altura}`, role: 'group', 'aria-label': 'Gráfica de columnas' });
  for (const t of ticks) {
    raiz.append(svg('line', { class: t === 0 ? 'viz-base' : 'viz-grid', x1: m.i, x2: ancho - m.d, y1: y(t), y2: y(t) }));
    const tx = svg('text', { x: m.i - 6, y: y(t) + 4, 'text-anchor': 'end' }); tx.textContent = formatoEje(t); raiz.append(tx);
  }
  const tip = crearTooltip(zona);
  datos.forEach((d, i) => {
    const cx = m.i + banda * i + banda / 2, x0 = cx - grosor / 2, top = y(d.valor);
    const alto = m.s + H - top;
    const rotulo = etiquetaX(d, i);
    if (rotulo && i % cada === 0) { const tx = svg('text', { x: cx, y: altura - 6, 'text-anchor': 'middle' }); tx.textContent = rotulo; raiz.append(tx); }
    // La zona de golpe cubre TODA la banda (mayor que la barra) y recibe el foco del teclado.
    const hit = svg('rect', { class: 'viz-hit', x: m.i + banda * i, y: m.s, width: banda, height: H, tabindex: 0, role: 'img', 'aria-label': `${d.etiqueta}: ${formatoValor(d.valor)}${d.detalle ? `, ${d.detalle}` : ''}` });
    const mostrar = () => tip.mostrar(cx, top - 6, formatoValor(d.valor), d.etiqueta, d.detalle);
    hit.addEventListener('pointerenter', mostrar); hit.addEventListener('focus', mostrar);
    hit.addEventListener('pointerleave', tip.ocultar); hit.addEventListener('blur', tip.ocultar);
    raiz.append(hit);
    if (d.valor > 0) {
      const r = Math.min(4, alto, grosor / 2);
      // extremo de datos redondeado (4 px), base cuadrada pegada a la línea base
      const ruta = `M${x0},${top + alto} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + grosor - r} Q${x0 + grosor},${top} ${x0 + grosor},${top + r} V${top + alto} Z`;
      raiz.append(svg('path', { class: 'viz-barra' + (enfasis && !d.resaltar ? ' contexto' : ''), d: ruta, 'pointer-events': 'none' }));
      if (i === imax || (enfasis && d.resaltar)) { // etiqueta directa SOLO en el máximo y en lo resaltado
        const tx = svg('text', { class: 'viz-valor', x: cx, y: top - 5, 'text-anchor': 'middle' }); tx.textContent = formatoEje(d.valor); raiz.append(tx);
      }
    }
  });
  zona.prepend(raiz);
}

// ---- BARRAS HORIZONTALES ORDENADAS (una serie, un color) ----
// filas: [{ nombre, valor, detalle? }] ya ordenadas de mayor a menor
export function barrasH(zona, filas, { formatoValor = pesos, vacio = 'Sin datos' } = {}) {
  zona.replaceChildren();
  if (!filas.length || filas.every((f) => !f.valor)) { zona.append(html('div', { class: 'viz-vacio', texto: vacio })); return; }
  const max = Math.max(...filas.map((f) => f.valor)) || 1;
  const tip = crearTooltip(zona);
  const lista = html('div', { class: 'viz-filas', role: 'list' });
  for (const f of filas) {
    const barra = html('div', { class: 'barra' }); barra.style.setProperty('--p', String(f.valor / max));
    if (!f.valor) barra.style.visibility = 'hidden'; // un cero no se dibuja (ni siquiera la rayita mínima)
    const cifra = html('div', { class: 'cifra', texto: formatoValor(f.valor) });
    const fila = html('div', { class: 'viz-fila', role: 'listitem', tabindex: 0, 'aria-label': `${f.nombre}: ${formatoValor(f.valor)}${f.detalle ? `, ${f.detalle}` : ''}` },
      html('div', { class: 'nombre', texto: f.nombre, title: f.nombre }), html('div', { class: 'pista' }, barra, cifra));
    const mostrar = () => tip.mostrar(fila.offsetLeft + fila.offsetWidth / 2, fila.offsetTop - 2, formatoValor(f.valor), f.nombre, f.detalle);
    fila.addEventListener('pointerenter', mostrar); fila.addEventListener('focus', mostrar);
    fila.addEventListener('pointerleave', tip.ocultar); fila.addEventListener('blur', tip.ocultar);
    lista.append(fila);
  }
  zona.prepend(lista);
}

// ---- VISTA DE TABLA (gemela accesible de cada gráfica) ----
export function tabla(columnasDef, filas) {
  const t = html('table', { class: 'viz-tabla' });
  t.append(html('thead', {}, html('tr', {}, ...columnasDef.map((c) => html('th', { class: c.num ? 'num' : '', texto: c.titulo })))));
  t.append(html('tbody', {}, ...filas.map((f) => html('tr', {}, ...columnasDef.map((c, i) => html('td', { class: c.num ? 'num' : '', texto: String(f[i]) }))))));
  return t;
}

// ---- TARJETA: título + zona + alternar tabla ----
export function tarjeta({ titulo, nota }) {
  const zona = html('div', { class: 'viz-zona' });
  const tablaZona = html('div'); tablaZona.hidden = true;
  const boton = html('button', { class: 'viz-toggle', type: 'button', texto: 'Ver como tabla' });
  let hayTabla = false;
  boton.addEventListener('click', () => {
    const ver = tablaZona.hidden;
    tablaZona.hidden = !ver; zona.hidden = ver;
    boton.textContent = ver ? 'Ver como gráfica' : 'Ver como tabla';
  });
  const el = html('section', { class: 'viz-tarjeta' }, html('h3', { texto: titulo }), nota ? html('p', { class: 'viz-nota', texto: nota }) : '', zona, tablaZona, boton);
  return {
    el, zona,
    // alDibujar se llama al redibujar; la tabla se rearma con los mismos datos
    pintarTabla(columnasDef, filas) { tablaZona.replaceChildren(tabla(columnasDef, filas)); hayTabla = true; boton.hidden = !hayTabla; },
    cargando(si) { zona.classList.toggle('cargando', si); },
  };
}

// Cifra con comparación: "▲ 12% vs ayer". Color = dirección × si subir es bueno (aquí siempre lo es). Nunca color solo: lleva flecha y texto.
// `parcial` = el día de "actual" NO ha terminado: no se compara contra un día completo como si fuera una caída (sería engañoso);
// se dice qué parte de lo vendido en la referencia ya se lleva, en neutro.
export function delta(actual, anterior, contra, parcial = false) {
  if (parcial) return anterior ? { texto: `lleva el ${Math.round((actual / anterior) * 100)}% de lo vendido ${contra}`, clase: '' } : { texto: `sin referencia ${contra}`, clase: '' };
  if (!anterior && !actual) return { texto: `= sin ventas ${contra}`, clase: '' };
  if (!anterior) return { texto: `▲ nuevo (antes: $0) ${contra}`, clase: 'sube' };
  const pct = Math.round(((actual - anterior) / anterior) * 100);
  if (pct === 0) return { texto: `= igual ${contra}`, clase: '' };
  return { texto: `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% ${contra}`, clase: pct > 0 ? 'sube' : 'baja' };
}

export function observarAncho(zona, redibujar) {
  if (typeof ResizeObserver === 'undefined') return;
  let previo = zona.clientWidth;
  new ResizeObserver(() => { if (Math.abs(zona.clientWidth - previo) > 8) { previo = zona.clientWidth; redibujar(); } }).observe(zona);
}
