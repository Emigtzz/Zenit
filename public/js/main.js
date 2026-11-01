import { api } from './api.js';
import { venta, alCambiar, agregar, moverSeleccion, cambiarCantidad, quitarSeleccionada, alternarMayoreo, vaciar, totales } from './estado.js';
import { pintarTicket, pintarBotones, avisar, pitar, iniciarReloj } from './vista.js';
import { modalActivo, abrirModal, cerrarModal, el } from './modal.js';
import { abrirBusqueda } from './busqueda.js';
import { abrirCobro } from './cobro.js';
import { formatear } from './dinero.js';

const entrada = document.getElementById('codigo');
let porCodigo = new Map();   // código de barras o corto -> producto (búsqueda instantánea, sin ir al servidor)
let botones = [];
let categoriaActiva = null;

// ---------- Catálogo en memoria ----------
async function cargarCatalogo() {
  const [productos, rapidos] = await Promise.all([api.productos(), api.botonesRapidos()]);
  porCodigo = new Map();
  for (const p of productos) {
    if (p.codigo_barras) porCodigo.set(p.codigo_barras, p);
    if (p.codigo_corto) porCodigo.set(p.codigo_corto, p);
  }
  botones = rapidos;
  dibujarBotones();
}
function dibujarBotones() {
  pintarBotones(botones, categoriaActiva, (id) => { categoriaActiva = id; dibujarBotones(); enfocar(); }, (p) => { agregarProducto(p); enfocar(); });
}

// ---------- Escáner ----------
// Un escáner USB en modo HID se comporta como un teclado: "escribe" el código muy rápido y termina con Enter.
// Por eso basta un <input> enfocado y escuchar la tecla Enter; no hay drivers ni librerías.
function enfocar() { if (!modalActivo()) entrada.focus(); }

function agregarProducto(p, cantidad = 1) {
  const i = agregar(p, cantidad);
  const fila = document.querySelectorAll('#lineas tr')[i];
  fila?.classList.add('flash');
  pitar();
}

async function procesarCodigo(texto) {
  // "3*101" = 3 piezas del código 101
  const m = /^(\d{1,4})\*(.+)$/.exec(texto);
  const cantidad = m ? Number(m[1]) : 1;
  const codigo = (m ? m[2] : texto).trim();
  if (cantidad < 1) return;

  let producto = porCodigo.get(codigo);
  if (!producto) {
    // Pudo darse de alta hace un momento: se consulta al servidor antes de rendirse.
    try { producto = await api.porCodigo(codigo); }
    catch (e) {
      if (e.codigo !== 'CODIGO_NO_ENCONTRADO') { avisar(e.message, 'error'); pitar(true); return; }
    }
  }
  if (!producto) {
    avisar(`Código no encontrado: ${codigo}. Puedes seguir vendiendo (F2 para buscar).`, 'error', 5000);
    pitar(true);
    return; // no bloquea: el campo queda libre para el siguiente código
  }
  agregarProducto(producto, cantidad);
}

entrada.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const texto = entrada.value.trim();
  entrada.value = '';
  if (texto) procesarCodigo(texto);
});
// Siempre enfocado: si algo le quita el foco (clic, botón), se lo devolvemos salvo que haya un modal.
entrada.addEventListener('blur', () => setTimeout(enfocar, 0));
document.addEventListener('click', () => setTimeout(enfocar, 0));

// ---------- Flujos ----------
function abrirConfirmacionCancelar() {
  if (!venta.lineas.length) { avisar('No hay venta en curso', 'aviso', 1500); return; }
  const cont = el('div', {}, el('h2', { texto: '¿Cancelar la venta en curso?' }),
    el('p', { texto: `${totales().piezas} pieza(s) · ${formatear(totales().total)}` }),
    el('p', { class: 'ayuda', texto: 'Enter = sí, cancelar · Esc = no, volver' }));
  abrirModal({
    contenido: cont,
    alCerrar: enfocar,
    onKey(e) {
      if (e.key === 'Enter') { e.preventDefault(); vaciar(); cerrarModal(); avisar('Venta cancelada', 'aviso', 2000); }
      else if (e.key === 'Escape') { e.preventDefault(); cerrarModal(); }
    },
  });
}

function mostrarExito(v) {
  vaciar();
  const estado = el('p', { class: 'ayuda', texto: 'Imprimiendo ticket…' });
  const cont = el('div', { class: 'exito' },
    el('h2', { texto: `Venta #${String(v.id).padStart(6, '0')} registrada` }),
    el('div', { class: 'cobro-total', texto: formatear(v.total) }),
    v.cambio > 0 ? el('div', { class: 'grande', texto: `Cambio ${formatear(v.cambio)}` }) : el('div', {}),
    estado,
    el('p', { class: 'ayuda', texto: 'Enter = nueva venta · R = reimprimir ticket' }));
  abrirModal({
    contenido: cont,
    alCerrar: enfocar,
    onKey(e) {
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'F4') { e.preventDefault(); cerrarModal(); }
      else if (e.key.toLowerCase() === 'r') { e.preventDefault(); api.reimprimir(v.id).then(() => vigilarImpresion(v.id, estado)); }
    },
  });
  vigilarImpresion(v.id, estado);
}
// La venta ya está guardada; la impresión corre aparte. Se consulta su estado para avisar si falló.
async function vigilarImpresion(id, nodo) {
  for (let intento = 0; intento < 8; intento++) {
    await new Promise((r) => setTimeout(r, 400));
    try {
      const s = await api.estadoImpresion(id);
      if (s.estado === 'listo') { nodo.textContent = s.cajon_abierto ? 'Ticket impreso · cajón abierto' : 'Ticket impreso'; return; }
      if (s.estado === 'error') { nodo.textContent = `⚠ No se pudo imprimir: ${s.error}. La venta SÍ quedó guardada (R para reintentar).`; nodo.style.color = 'var(--error)'; return; }
    } catch { /* reintenta */ }
  }
}

function cobrar() {
  if (!venta.lineas.length) { avisar('Agrega productos antes de cobrar', 'aviso', 2000); return; }
  abrirCobro({ alCobrar: mostrarExito });
}

// ---------- Atajos de teclado ----------
document.addEventListener('keydown', (e) => {
  const m = modalActivo();
  if (m) { m.onKey?.(e); return; }
  switch (e.key) {
    case 'F2': e.preventDefault(); abrirBusqueda({ alElegir: (p) => { agregarProducto(p); enfocar(); } }); return;
    case 'F4': e.preventDefault(); cobrar(); return;
    case 'F8': e.preventDefault(); alternarMayoreo(); avisar(venta.mayoreo ? `Mayoreo activado (${venta.pctMayoreo}%)` : 'Mayoreo desactivado', 'ok', 1500); return;
    case 'Escape': e.preventDefault(); abrirConfirmacionCancelar(); return;
    case 'Delete': e.preventDefault(); quitarSeleccionada(); return;
    case 'ArrowUp': e.preventDefault(); moverSeleccion(-1); return;
    case 'ArrowDown': e.preventDefault(); moverSeleccion(1); return;
    case '+': if (!entrada.value) { e.preventDefault(); cambiarCantidad(1); } return;
    case '-': if (!entrada.value) { e.preventDefault(); cambiarCantidad(-1); } return;
    default:
      // Si no hay foco en el campo (p. ej. tras un clic) y llega una tecla imprimible, la devolvemos al campo.
      if (document.activeElement !== entrada && e.key.length === 1 && !e.ctrlKey && !e.altKey) entrada.focus();
  }
});

// ---------- Arranque ----------
alCambiar(pintarTicket);
async function iniciar() {
  iniciarReloj();
  try {
    const cfg = await api.config();
    document.getElementById('negocio').textContent = cfg.negocio;
    document.title = `Caja · ${cfg.negocio}`;
    venta.pctMayoreo = cfg.mayoreo_porcentaje;
    if (cfg.modo_impresora !== 'real') avisar(`Impresora en modo simulación (${cfg.modo_impresora})`, 'aviso', 3000);
    await cargarCatalogo();
  } catch (e) {
    avisar(e.message, 'error', 0);
  }
  pintarTicket();
  entrada.focus();
  // Refresca el catálogo de vez en cuando (precios nuevos, productos dados de alta en otra pestaña).
  setInterval(() => { if (!modalActivo()) cargarCatalogo().catch(() => {}); }, 120000);
}
iniciar();
