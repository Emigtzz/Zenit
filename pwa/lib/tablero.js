// El tablero del dueño: se dibuja IGUAL en la pantalla de Estadísticas de la caja y en la app del celular.
// Recibe lo que devuelve estado_dueno (SQL en la nube / estadisticasService en la caja) y el estado del negocio (caja y stock bajo).
import { columnas, barrasH, tarjeta, pesos, delta, observarAncho } from './graficas.js';

const nodo = (tag, props = {}, ...hijos) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(props)) { if (k === 'class') e.className = v; else if (k === 'texto') e.textContent = v; else e.setAttribute(k, v); } e.append(...hijos); return e; };

const METODOS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
const fechaLarga = (dia) => new Date(`${dia}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
const diaCorto = (dia) => { const d = dia.split('-'); return `${Number(d[2])}/${Number(d[1])}`; };
const hora12 = (h) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`;
const hhmm = (iso) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
export const hoyEn = (zona, ahora = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);

export function crearTablero(raiz) {
  const cHora = tarjeta({ titulo: 'Ventas por hora', nota: 'Hora local de la tienda' });
  const cSerie = tarjeta({ titulo: 'Últimos 30 días', nota: 'Total vendido por día; el día elegido va resaltado' });
  const cMetodo = tarjeta({ titulo: 'Por método de pago', nota: 'Lo cobrado en cada método (en efectivo, sin el cambio devuelto)' });
  const cTop = tarjeta({ titulo: 'Más vendidos · últimos 7 días', nota: 'Cargando…' });

  const heroEtq = nodo('div', { class: 'viz-etq' }); const heroValor = nodo('div', { class: 'viz-hero', texto: '$0.00' });
  const d1 = nodo('div', { class: 'viz-delta' }); const d2 = nodo('div', { class: 'viz-delta' });
  const hero = nodo('section', { class: 'viz-tarjeta c8' }, heroEtq, heroValor, d1, d2);
  const kpis = nodo('div', { class: 'tab-kpis c4' });
  const caja = nodo('div'); const stock = nodo('div');
  const lateral = nodo('div', { class: 'tab-lateral c4 f2' },
    nodo('section', { class: 'viz-tarjeta' }, nodo('h3', { texto: 'Caja' }), caja), nodo('section', { class: 'viz-tarjeta' }, nodo('h3', { texto: 'Stock bajo' }), stock));
  const wrap = (c, clase) => { c.el.classList.add(clase); return c.el; };
  raiz.replaceChildren(nodo('div', { class: 'tab' }, hero, kpis, wrap(cHora, 'c8'), lateral, wrap(cSerie, 'c8'), wrap(cMetodo, 'c4'), wrap(cTop, 'c8')));

  let datos = null; let ordenTop = 'piezas';
  const redibujar = { hora: null, serie: null };
  observarAncho(cHora.zona, () => redibujar.hora?.()); observarAncho(cSerie.zona, () => redibujar.serie?.());

  const conmutador = nodo('div', { class: 'conmutador', role: 'group', 'aria-label': 'Ordenar por' });
  for (const [id, texto] of [['piezas', 'Piezas'], ['importe', 'Importe']]) {
    const b = nodo('button', { type: 'button', 'aria-pressed': String(id === ordenTop), texto });
    b.addEventListener('click', () => { ordenTop = id; conmutador.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); if (datos) pintarTop(); });
    conmutador.append(b);
  }
  cTop.zona.before(conmutador);

  function pintarHero(d) {
    const esHoy = d.dia === hoyEn(d.zona_horaria);
    heroEtq.textContent = esHoy ? `Ventas de hoy · ${fechaLarga(d.dia)}` : `Ventas del ${fechaLarga(d.dia)}`;
    heroValor.textContent = pesos(d.resumen.total);
    // Hoy es un día A MEDIAS: no se compara contra un día completo como si fuera una caída; se dice cuánto se lleva.
    for (const [el, ref, nombre] of [[d1, d.comparativo.ayer, 'ayer'], [d2, d.comparativo.semana_pasada, 'el mismo día de la semana pasada']]) {
      const x = esHoy ? delta(d.resumen.total, ref.total, nombre, true) : delta(d.resumen.total, ref.total, `vs ${nombre}`);
      el.className = `viz-delta ${x.clase}`; el.textContent = `${x.texto} (${pesos(ref.total)})`;
    }
  }
  function pintarKpis(r) {
    const tile = (etq, valor, nota) => nodo('section', { class: 'viz-tarjeta tile' }, nodo('div', { class: 'viz-etq', texto: etq }), nodo('div', { class: 'viz-valor', texto: valor }), nota ? nodo('div', { class: 'viz-delta', texto: nota }) : '');
    kpis.replaceChildren(tile('Tickets', String(r.num_ventas)), tile('Ticket promedio', pesos(r.ticket_promedio)), tile('Piezas vendidas', String(r.piezas)), tile('Descuento de mayoreo', pesos(r.descuentos), r.descuentos ? 'ya restado del total' : ''));
  }
  function pintarHora(d) {
    const filas = d.resumen.por_hora;
    const activas = filas.filter((h) => h.num_ventas > 0).map((h) => h.hora); // solo las horas con actividad ±1: 24 columnas casi vacías no dicen nada
    const ini = activas.length ? Math.max(0, Math.min(...activas) - 1) : 0, fin = activas.length ? Math.min(23, Math.max(...activas) + 1) : 23;
    const vis = filas.slice(ini, fin + 1);
    const dibujar = () => columnas(cHora.zona, vis.map((h) => ({ etiqueta: `${hora12(h.hora)} (${String(h.hora).padStart(2, '0')}:00)`, valor: h.total, detalle: `${h.num_ventas} ticket${h.num_ventas === 1 ? '' : 's'}` })), { etiquetaX: (x) => x.etiqueta.split(' ')[0] });
    dibujar(); redibujar.hora = dibujar;
    cHora.pintarTabla([{ titulo: 'Hora' }, { titulo: 'Tickets', num: true }, { titulo: 'Total', num: true }], filas.filter((h) => h.num_ventas).map((h) => [`${String(h.hora).padStart(2, '0')}:00`, h.num_ventas, pesos(h.total)]));
  }
  function pintarSerie(d) {
    const dibujar = () => columnas(cSerie.zona, d.serie.map((s) => ({ etiqueta: fechaLarga(s.dia), valor: s.total, resaltar: s.dia === d.dia, detalle: `${s.num_ventas} ticket${s.num_ventas === 1 ? '' : 's'}` })), { enfasis: true, etiquetaX: (x, i) => diaCorto(d.serie[i].dia) });
    dibujar(); redibujar.serie = dibujar;
    cSerie.pintarTabla([{ titulo: 'Día' }, { titulo: 'Tickets', num: true }, { titulo: 'Total', num: true }], [...d.serie].reverse().map((s) => [s.dia, s.num_ventas, pesos(s.total)]));
  }
  function pintarMetodo(d) {
    const m = d.resumen.por_metodo; const suma = Object.values(m).reduce((s, v) => s + v, 0);
    const filas = Object.entries(m).map(([k, v]) => ({ nombre: METODOS[k], valor: v, detalle: suma ? `${Math.round((v / suma) * 100)}% del día` : '' })).sort((a, b) => b.valor - a.valor);
    barrasH(cMetodo.zona, filas, { vacio: 'Sin cobros en este día' });
    cMetodo.pintarTabla([{ titulo: 'Método' }, { titulo: 'Monto', num: true }, { titulo: '%', num: true }], filas.map((f) => [f.nombre, pesos(f.valor), suma ? `${Math.round((f.valor / suma) * 100)}%` : '0%']));
  }
  function pintarTop() {
    const t = datos.top; const lista = ordenTop === 'piezas' ? t.por_piezas : t.por_importe;
    cTop.el.querySelector('.viz-nota').textContent = `Del ${diaCorto(t.desde)} al ${diaCorto(t.hasta)} · el importe es precio × cantidad, antes del descuento de mayoreo`;
    barrasH(cTop.zona, lista.map((p) => ({ nombre: p.nombre, valor: ordenTop === 'piezas' ? p.piezas : p.importe, detalle: ordenTop === 'piezas' ? pesos(p.importe) : `${p.piezas} piezas` })),
      { formatoValor: ordenTop === 'piezas' ? (v) => `${v} pzas` : pesos, vacio: 'Sin ventas en estos 7 días' });
    cTop.pintarTabla([{ titulo: 'Producto' }, { titulo: 'Piezas', num: true }, { titulo: 'Importe', num: true }], t.por_piezas.map((p) => [p.nombre, p.piezas, pesos(p.importe)]));
  }
  function pintarCaja(n) {
    if (!n) { caja.replaceChildren(nodo('div', { class: 'viz-nota', texto: 'Sin información de la caja todavía.' })); return; }
    const c = n.caja || { abierta: false }, u = n.ultimo_corte; const filas = [];
    const linea = (a, b, clase) => nodo('div', { class: 'linea' }, nodo('span', { texto: a }), nodo('span', { class: clase || '', texto: b }));
    filas.push(c.abierta ? nodo('div', { class: 'estado bien', texto: `🟢 Abierta desde las ${hhmm(c.desde)}` }) : nodo('div', { class: 'estado', texto: '🔴 Cerrada' }));
    if (c.abierta) filas.push(linea('Ventas del turno', `${c.num_ventas} · ${pesos(c.total_ventas)}`), linea('Efectivo esperado', pesos(c.efectivo_esperado)), linea('Abrió', c.usuario_apertura || '—'));
    if (u) {
      const d = u.diferencia;
      filas.push(nodo('div', { class: 'viz-nota', style: 'margin-top:8px', texto: `Último corte · ${new Date(u.cierre).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}` }));
      filas.push(d === 0 ? linea('Resultado', '✔ Caja cuadrada', 'bien') : linea('Resultado', d < 0 ? `▼ Faltaron ${pesos(-d)}` : `▲ Sobraron ${pesos(d)}`, 'mal'));
    }
    caja.replaceChildren(...filas);
  }
  function pintarStock(n) {
    const s = n?.stock_bajo;
    if (!s) { stock.replaceChildren(nodo('div', { class: 'viz-nota', texto: 'Sin información todavía.' })); return; }
    if (!s.total) { stock.replaceChildren(nodo('div', { class: 'estado bien', texto: '✔ Nada por reponer' })); return; }
    const l = (a, b) => nodo('div', { class: 'linea' }, nodo('span', { texto: a }), nodo('span', { class: 'estado', texto: String(b) }));
    stock.replaceChildren(nodo('div', { class: 'estado mal', texto: `⚠ ${s.total} por reponer` }),
      ...[['Por contar (negativo)', s.por_nivel.negativo], ['Agotados', s.por_nivel.agotado], ['Bajos', s.por_nivel.bajo]].filter(([, v]) => v).map(([a, b]) => l(a, b)),
      nodo('ul', { style: 'margin:8px 0 0;padding-left:18px;font-size:13px' }, ...s.productos.slice(0, 5).map((p) => nodo('li', { texto: `${p.nombre} (${p.stock}/${p.stock_minimo})` }))));
  }

  return {
    lateral,
    cargando(si) { [cHora, cSerie, cMetodo, cTop].forEach((c) => c.cargando(si)); }, // el marco no salta: solo baja la opacidad
    pintar(d, negocio) { datos = d; pintarHero(d); pintarKpis(d.resumen); pintarHora(d); pintarSerie(d); pintarMetodo(d); pintarTop(); pintarCaja(negocio); pintarStock(negocio); },
  };
}
