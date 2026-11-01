'use strict';
const { ThermalPrinter, PrinterTypes, CharacterSet } = require('node-thermal-printer');
const { formatear } = require('../utils/dinero');

const NOMBRES_METODO = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };

function formatearFecha(iso) {
  const f = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(f.getDate())}/${p(f.getMonth() + 1)}/${f.getFullYear()} ${p(f.getHours())}:${p(f.getMinutes())}`;
}

// Parte el texto en renglones de máximo `ancho` caracteres.
function envolver(texto, ancho) {
  const salida = [];
  let linea = '';
  for (const palabra of String(texto).split(' ')) {
    if ((linea + ' ' + palabra).trim().length > ancho) { if (linea) salida.push(linea); linea = palabra; }
    else linea = (linea + ' ' + palabra).trim();
  }
  if (linea) salida.push(linea);
  return salida.length ? salida : [''];
}

// 1) Construye un DOCUMENTO neutro: lista de renglones con su tipo. No sabe nada de impresoras.
//    tipos: centro | centroNegrita | izqDer | izqDerNegrita | linea | texto | vacio
function construirDocumento(venta, negocio, columnas = 48) {
  const doc = [];
  doc.push({ tipo: 'centroNegrita', texto: negocio.nombre });
  if (negocio.direccion) envolver(negocio.direccion, columnas).forEach((t) => doc.push({ tipo: 'centro', texto: t }));
  doc.push({ tipo: 'linea' });
  doc.push({ tipo: 'izqDer', izq: `Folio: ${String(venta.id).padStart(6, '0')}`, der: formatearFecha(venta.fecha) });
  if (venta.usuario_nombre) doc.push({ tipo: 'texto', texto: `Atendió: ${venta.usuario_nombre}` });
  doc.push({ tipo: 'linea' });

  for (const d of venta.detalle) {
    envolver(d.nombre, columnas).forEach((t) => doc.push({ tipo: 'texto', texto: t }));
    doc.push({ tipo: 'izqDer', izq: `  ${d.cantidad} x ${formatear(d.precio_unitario)}`, der: formatear(d.importe) });
  }

  doc.push({ tipo: 'linea' });
  if (venta.descuento_mayoreo > 0) {
    doc.push({ tipo: 'izqDer', izq: 'Subtotal', der: formatear(venta.subtotal) });
    doc.push({ tipo: 'izqDer', izq: 'Descuento mayoreo', der: `-${formatear(venta.descuento_mayoreo)}` });
  }
  doc.push({ tipo: 'izqDerNegrita', izq: 'TOTAL', der: formatear(venta.total) });
  doc.push({ tipo: 'linea' });

  for (const p of venta.pagos) {
    doc.push({ tipo: 'izqDer', izq: NOMBRES_METODO[p.metodo], der: formatear(p.monto) });
  }
  if (venta.efectivo_recibido > 0) {
    doc.push({ tipo: 'izqDer', izq: 'Efectivo recibido', der: formatear(venta.efectivo_recibido) });
    doc.push({ tipo: 'izqDerNegrita', izq: 'CAMBIO', der: formatear(venta.cambio) });
  }
  doc.push({ tipo: 'linea' });
  if (negocio.leyenda) doc.push({ tipo: 'centro', texto: negocio.leyenda });
  doc.push({ tipo: 'vacio' });
  return doc;
}

// 2a) Renderizador de TEXTO PLANO (modos console y file).
function aTexto(doc, columnas = 48) {
  const centrar = (t) => ' '.repeat(Math.max(0, Math.floor((columnas - t.length) / 2))) + t;
  const izqDer = (i, d) => i + ' '.repeat(Math.max(1, columnas - i.length - d.length)) + d;
  return doc.map((r) => {
    switch (r.tipo) {
      case 'centro': case 'centroNegrita': return centrar(r.texto);
      case 'izqDer': case 'izqDerNegrita': return izqDer(r.izq, r.der);
      case 'linea': return '-'.repeat(columnas);
      case 'texto': return r.texto;
      default: return '';
    }
  }).join('\n') + '\n';
}

// 2b) Renderizador ESC/POS (bytes para la impresora térmica).
//   Cada método de la librería escribe una secuencia de control al buffer:
//   alignCenter -> ESC a 1 | bold -> ESC E n | cut -> GS V (corte) | openCashDrawer -> ESC p (pulso al cajón)
function aEscPos(doc, { columnas = 48, abrirCajon = false } = {}) {
  const imp = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: 'tcp://0.0.0.0', // no se usa: solo armamos el buffer; enviarlo es trabajo de impresoraService
    characterSet: CharacterSet.PC858_EURO, // página de códigos con acentos y ñ
    width: columnas,
    removeSpecialCharacters: false,
    lineCharacter: '-',
  });
  for (const r of doc) {
    switch (r.tipo) {
      case 'centro': imp.alignCenter(); imp.println(r.texto); imp.alignLeft(); break;
      case 'centroNegrita': imp.alignCenter(); imp.bold(true); imp.setTextDoubleHeight(); imp.println(r.texto); imp.setTextNormal(); imp.bold(false); imp.alignLeft(); break;
      case 'izqDer': imp.leftRight(r.izq, r.der); break;
      case 'izqDerNegrita': imp.bold(true); imp.leftRight(r.izq, r.der); imp.bold(false); break;
      case 'linea': imp.drawLine(); break;
      case 'texto': imp.println(r.texto); break;
      default: imp.newLine();
    }
  }
  imp.cut();
  if (abrirCajon) imp.openCashDrawer();
  return imp.getBuffer();
}

// Ticket del corte: lo que se imprime al cerrar la caja y se firma/archiva.
function construirDocumentoCorte(d, negocio, columnas = 48) {
  const c = d.corte;
  const fila = (izq, der, negrita = false) => ({ tipo: negrita ? 'izqDerNegrita' : 'izqDer', izq, der });
  const signo = (n) => (n > 0 ? '+' : '') + formatear(n);
  const doc = [];
  doc.push({ tipo: 'centroNegrita', texto: negocio.nombre });
  doc.push({ tipo: 'centro', texto: `CORTE DE CAJA #${String(c.id).padStart(6, '0')}` });
  doc.push({ tipo: 'linea' });
  doc.push(fila('Apertura', formatearFecha(c.apertura)));
  doc.push({ tipo: 'texto', texto: `  por ${c.usuario_apertura || '-'}` });
  doc.push(fila('Cierre', c.cierre ? formatearFecha(c.cierre) : 'ABIERTO'));
  if (c.cierre) doc.push({ tipo: 'texto', texto: `  por ${c.usuario_cierre || '-'}` });
  doc.push({ tipo: 'linea' });
  doc.push(fila(`Ventas (${d.num_ventas})`, formatear(d.total_ventas), true));
  if (d.descuentos > 0) doc.push(fila('  incluye mayoreo', `-${formatear(d.descuentos)}`));
  doc.push(fila('  Efectivo', formatear(d.ventas_efectivo)));
  doc.push(fila('  Tarjeta', formatear(d.ventas_tarjeta)));
  doc.push(fila('  Transferencia', formatear(d.ventas_transferencia)));
  if (d.por_cajero.length > 1) {
    doc.push({ tipo: 'linea' });
    for (const x of d.por_cajero) doc.push(fila(`${x.nombre} (${x.num_ventas})`, formatear(x.total)));
  }
  doc.push({ tipo: 'linea' });
  doc.push(fila('Fondo inicial', formatear(c.fondo_inicial)));
  doc.push(fila('+ Ventas en efectivo', formatear(d.ventas_efectivo)));
  if (d.ingresos > 0) doc.push(fila('+ Ingresos', formatear(d.ingresos)));
  if (d.retiros > 0) doc.push(fila('- Retiros', formatear(d.retiros)));
  for (const m of d.movimientos) doc.push({ tipo: 'texto', texto: `  ${m.tipo === 'ingreso' ? '+' : '-'}${formatear(m.monto)} ${m.motivo}` });
  doc.push(fila('Efectivo esperado', formatear(d.efectivo_esperado), true));
  if (c.cierre) {
    doc.push(fila('Efectivo contado', formatear(c.efectivo_contado), true));
    doc.push(fila(c.diferencia < 0 ? 'FALTANTE' : c.diferencia > 0 ? 'SOBRANTE' : 'DIFERENCIA', c.diferencia === 0 ? formatear(0) : signo(c.diferencia), true));
    if (c.notas) envolver(`Notas: ${c.notas}`, columnas).forEach((t) => doc.push({ tipo: 'texto', texto: t }));
  }
  doc.push({ tipo: 'vacio' });
  doc.push({ tipo: 'centro', texto: '______________________________' });
  doc.push({ tipo: 'centro', texto: 'Firma' });
  doc.push({ tipo: 'vacio' });
  return doc;
}

function huboEfectivo(venta) {
  return venta.pagos.some((p) => p.metodo === 'efectivo');
}

module.exports = { construirDocumento, construirDocumentoCorte, aTexto, aEscPos, huboEfectivo, formatearFecha };
