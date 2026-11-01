'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { construirDocumento, aTexto, aEscPos, huboEfectivo } = require('../src/services/ticketService');
const impresoraService = require('../src/services/impresoraService');

const negocio = { nombre: 'Luna de precios', direccion: 'Av. 20 de noviembre #185', leyenda: 'Gracias por su compra' };
const venta = {
  id: 7, fecha: '2026-11-01T18:30:00.000Z', subtotal: 5000, descuento_mayoreo: 250, total: 4750, cambio: 5250,
  efectivo_recibido: 10000,
  detalle: [{ nombre: 'Bolsa de hielo', cantidad: 2, precio_unitario: 2500, importe: 5000 }],
  pagos: [{ metodo: 'efectivo', monto: 4750 }],
};

test('el ticket incluye negocio, productos, descuento, total, método y cambio', () => {
  const t = aTexto(construirDocumento(venta, negocio, 48), 48);
  for (const frag of ['Luna de precios', 'Av. 20 de noviembre #185', 'Bolsa de hielo', '2 x $25.00', 'Descuento mayoreo', '-$2.50', 'TOTAL', '$47.50', 'Efectivo', 'CAMBIO', '$52.50', 'Gracias por su compra']) {
    assert.ok(t.includes(frag), `falta "${frag}"`);
  }
  for (const linea of t.split('\n')) assert.ok(linea.length <= 48, `renglón excede 48: ${linea}`);
});

test('sin mayoreo no aparece el renglón de descuento', () => {
  const v = { ...venta, descuento_mayoreo: 0, total: 5000 };
  assert.ok(!aTexto(construirDocumento(v, negocio), 48).includes('Descuento'));
});

test('pago con tarjeta no muestra "cambio"', () => {
  const v = { ...venta, pagos: [{ metodo: 'tarjeta', monto: 4750 }], cambio: 0, efectivo_recibido: 0 };
  assert.ok(!aTexto(construirDocumento(v, negocio), 48).includes('CAMBIO'));
});

// ESC p = bytes 0x1B 0x70 (pulso al cajón). GS V = 0x1D 0x56 (corte de papel).
const contiene = (buf, ...bytes) => buf.indexOf(Buffer.from(bytes)) !== -1;

test('ESC/POS: con efectivo incluye el pulso de cajón (ESC p) y el corte (GS V)', () => {
  const buf = aEscPos(construirDocumento(venta, negocio), { abrirCajon: huboEfectivo(venta) });
  assert.ok(contiene(buf, 0x1b, 0x70), 'falta ESC p');
  assert.ok(contiene(buf, 0x1d, 0x56), 'falta GS V');
});

test('ESC/POS: sin efectivo NO hay pulso de cajón', () => {
  const v = { ...venta, pagos: [{ metodo: 'tarjeta', monto: 4750 }] };
  const buf = aEscPos(construirDocumento(v, negocio), { abrirCajon: huboEfectivo(v) });
  assert.ok(!contiene(buf, 0x1b, 0x70));
});

test('modo file escribe el ticket y avisa del cajón', async () => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'zenit-'));
  const svc = impresoraService({ negocio, impresora: { modo: 'file', columnas: 48, carpetaTickets: carpeta } }, { log: () => {} });
  const r = await svc.imprimirVenta(venta);
  assert.equal(r.impreso, true);
  assert.equal(r.cajon_abierto, true);
  assert.ok(fs.readFileSync(r.archivo, 'utf8').includes('CAJÓN ABIERTO'));
});

test('si la impresora real falla, no lanza: devuelve el error', async () => {
  const svc = impresoraService({ negocio, impresora: { modo: 'real', interfaz: '', columnas: 48 } }, { log: () => {} });
  const r = await svc.imprimirVenta(venta);
  assert.equal(r.impreso, false);
  assert.match(r.error, /PRINTER_INTERFACE/);
});

const { construirDocumentoCorte } = require('../src/services/ticketService');
const detalleCorte = {
  corte: { id: 3, apertura: '2026-11-02T15:00:00.000Z', cierre: '2026-11-02T23:00:00.000Z', usuario_apertura: 'Ana', usuario_cierre: 'Beto',
    fondo_inicial: 50000, efectivo_contado: 43000, diferencia: -700, notas: 'faltó un billete' },
  num_ventas: 12, total_ventas: 123450, descuentos: 250, ventas_efectivo: 3700, ventas_tarjeta: 1200, ventas_transferencia: 2500,
  ingresos: 0, retiros: 10000, efectivo_esperado: 43700,
  por_cajero: [{ nombre: 'Beto', num_ventas: 8, total: 90000 }, { nombre: 'Ana', num_ventas: 4, total: 33450 }],
  movimientos: [{ tipo: 'retiro', monto: 10000, motivo: 'Pago de hielo' }],
};

test('ticket de corte: totales, desglose, movimientos, esperado/contado y FALTANTE con firma', () => {
  const t = aTexto(construirDocumentoCorte(detalleCorte, negocio, 48), 48);
  for (const frag of ['CORTE DE CAJA #000003', 'por Ana', 'por Beto', 'Ventas (12)', '$1,234.50', 'incluye mayoreo', 'Tarjeta', 'Transferencia',
    'Beto (8)', 'Ana (4)', 'Fondo inicial', '$500.00', '- Retiros', 'Pago de hielo', 'Efectivo esperado', '$437.00', 'Efectivo contado', '$430.00', 'FALTANTE', '-$7.00', 'faltó un billete', 'Firma']) {
    assert.ok(t.includes(frag), `falta "${frag}"`);
  }
  for (const linea of t.split('\n')) assert.ok(linea.length <= 48, `renglón excede 48: ${linea}`);
});

test('ticket de corte: sobrante y diferencia cero se rotulan bien', () => {
  const sob = aTexto(construirDocumentoCorte({ ...detalleCorte, corte: { ...detalleCorte.corte, diferencia: 300 } }, negocio), 48);
  assert.ok(sob.includes('SOBRANTE') && sob.includes('+$3.00'));
  const cero = aTexto(construirDocumentoCorte({ ...detalleCorte, corte: { ...detalleCorte.corte, diferencia: 0 } }, negocio), 48);
  assert.ok(cero.includes('DIFERENCIA') && !cero.includes('FALTANTE'));
});

test('el corte nunca abre el cajón y se guarda como corte-N.txt en modo file', async () => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'zenit-corte-'));
  const svc = impresoraService({ negocio, impresora: { modo: 'file', columnas: 48, carpetaTickets: carpeta } }, { log: () => {} });
  const r = await svc.imprimirCorte(detalleCorte);
  assert.equal(r.impreso, true);
  assert.equal(r.cajon_abierto, false);
  assert.ok(path.basename(r.archivo) === 'corte-000003.txt');
  assert.ok(!fs.readFileSync(r.archivo, 'utf8').includes('CAJÓN ABIERTO'));
});
