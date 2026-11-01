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
