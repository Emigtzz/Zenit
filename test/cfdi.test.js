'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parsearCfdi } = require('../src/services/cfdiParser');
const { decimalACentavos } = require('../src/utils/dinero');
const { cfdi, UUID_BASE } = require('./cfdi-fixtures');

const falla = (fn) => { try { fn(); return null; } catch (e) { return e.codigo; } };

test('decimalACentavos: sin flotantes, redondea a la mitad hacia arriba', () => {
  assert.equal(decimalACentavos('1234.56'), 123456);
  assert.equal(decimalACentavos('0.1'), 10);
  assert.equal(decimalACentavos('19.99'), 1999);
  assert.equal(decimalACentavos('1.005'), 101);   // con flotantes daría 100
  assert.equal(decimalACentavos('1.004999'), 100);
  assert.equal(decimalACentavos('12'), 1200);
  assert.equal(decimalACentavos('-5.50'), -550);
  assert.equal(decimalACentavos('abc'), null);
  assert.equal(decimalACentavos(''), null);
  assert.equal(decimalACentavos(undefined), null);
});

test('CFDI 4.0: encabezado, emisor, UUID, folio con serie y fecha', () => {
  const f = parsearCfdi(cfdi());
  assert.equal(f.fuente, 'xml');
  assert.equal(f.version, '4.0');
  assert.equal(f.uuid, `${UUID_BASE}0001`);
  assert.equal(f.folio_factura, 'A-1234');
  assert.equal(f.fecha, '2026-10-28');
  assert.deepEqual(f.emisor, { rfc: 'DSO010203AB4', nombre: 'DISTRIBUIDORA SOL SA DE CV' });
  assert.equal(f.total, 116000);
  assert.deepEqual(f.advertencias, []);
});

test('concepto único (un solo nodo) se trata como lista; importe, IVA y costo con impuestos', () => {
  const f = parsearCfdi(cfdi());
  assert.equal(f.lineas.length, 1);
  const l = f.lineas[0];
  assert.equal(l.no_identificacion, 'REF600');
  assert.equal(l.clave_proveedor, 'REF600');
  assert.equal(l.descripcion, 'REFRESCO COLA 600ML CAJA 24');
  assert.equal(l.cantidad, 2);
  assert.equal(l.unidad, 'Caja');
  assert.equal(l.importe_sin_impuestos, 100000);
  assert.equal(l.impuestos, 16000);
  assert.equal(l.importe_con_impuestos, 116000);
});

test('varios conceptos, descuento por línea, retenciones y exento', () => {
  const f = parsearCfdi(cfdi({
    subtotal: '1300.00', total: '1352.00',
    conceptos: [
      { clave: 'A1', descripcion: 'CON DESCUENTO', cantidad: '10', valorUnitario: '100.00', importe: '1000.00', descuento: '100.00', iva: '144.00' }, // base 900 + iva 144
      { clave: 'B2', descripcion: 'EXENTO', cantidad: '3', valorUnitario: '100.00', importe: '300.00', exento: true },                              // 300 sin impuestos
      { clave: 'C3', descripcion: 'CON RETENCION', cantidad: '1', valorUnitario: '10.00', importe: '10.00', iva: '1.60', retencion: '1.00' },        // 10 + 1.60 - 1.00
    ],
  }));
  assert.equal(f.lineas.length, 3);
  assert.deepEqual([f.lineas[0].importe_sin_impuestos, f.lineas[0].impuestos, f.lineas[0].importe_con_impuestos], [90000, 14400, 104400]);
  assert.deepEqual([f.lineas[1].importe_sin_impuestos, f.lineas[1].impuestos], [30000, 0]);
  assert.deepEqual([f.lineas[2].importe_sin_impuestos, f.lineas[2].impuestos, f.lineas[2].importe_con_impuestos], [1000, 60, 1060]);
});

test('sin NoIdentificacion la llave de equivalencia es la descripción normalizada', () => {
  const f = parsearCfdi(cfdi({ conceptos: [{ clave: null, descripcion: 'JABÓN  Líquido 1L', cantidad: '1', valorUnitario: '10.00', importe: '10.00', iva: '1.60' }], subtotal: '10.00', total: '11.60' }));
  assert.equal(f.lineas[0].no_identificacion, null);
  assert.equal(f.lineas[0].clave_proveedor, 'desc:jabon liquido 1l');
});

test('CFDI 3.3 también se lee; sin serie el folio queda solo', () => {
  const f = parsearCfdi(cfdi({ version: '3.3', serie: '', folio: '777' }));
  assert.equal(f.version, '3.3');
  assert.equal(f.folio_factura, '777');
  assert.equal(f.lineas.length, 1);
});

test('advertencias: sin timbre, y suma de líneas distinta al total', () => {
  const f = parsearCfdi(cfdi({ sinTimbre: true, total: '5000.00' }));
  assert.equal(f.uuid, null);
  assert.ok(f.advertencias.some((a) => /timbre/i.test(a)));
  assert.ok(f.advertencias.some((a) => /no coincide con el total/.test(a)));
});

test('diferencia de centavos por redondeo NO genera advertencia', () => {
  const f = parsearCfdi(cfdi({ total: '1160.01' }));
  assert.deepEqual(f.advertencias, []);
});

test('moneda extranjera: con tipo de cambio se convierte y avisa; sin él, avisa', () => {
  const conTc = parsearCfdi(cfdi({ moneda: 'USD', tipoCambio: '18.50', subtotal: '100.00', total: '116.00',
    conceptos: [{ clave: 'X', descripcion: 'DOLARES', cantidad: '1', valorUnitario: '100.00', importe: '100.00', iva: '16.00' }] }));
  assert.equal(conTc.lineas[0].importe_sin_impuestos, 185000);
  assert.equal(conTc.lineas[0].importe_con_impuestos, 214600);
  assert.ok(conTc.advertencias.some((a) => /USD/.test(a) && /18.5/.test(a)));
  const sinTc = parsearCfdi(cfdi({ moneda: 'USD' }));
  assert.ok(sinTc.advertencias.some((a) => /no trae tipo de cambio/.test(a)));
});

test('comprobantes que no son compras se rechazan con una explicación', () => {
  assert.equal(falla(() => parsearCfdi(cfdi({ tipo: 'E' }))), 'COMPROBANTE_NO_SOPORTADO');
  assert.equal(falla(() => parsearCfdi(cfdi({ tipo: 'P' }))), 'COMPROBANTE_NO_SOPORTADO');
  assert.equal(falla(() => parsearCfdi(cfdi({ tipo: 'T' }))), 'COMPROBANTE_NO_SOPORTADO');
  assert.equal(falla(() => parsearCfdi(cfdi({ tipo: 'Z' }))), 'COMPROBANTE_NO_SOPORTADO');
});

test('seguridad: DOCTYPE / ENTITY (XML bomb, XXE) se rechazan', () => {
  const bomba = '<!DOCTYPE lolz [<!ENTITY a "AAAAAAAAAA"><!ENTITY b "&a;&a;&a;&a;">]>';
  assert.equal(falla(() => parsearCfdi(cfdi({ prefijoDoctype: bomba }))), 'XML_INVALIDO');
  const xxe = '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]>';
  assert.equal(falla(() => parsearCfdi(cfdi({ prefijoDoctype: xxe }))), 'XML_INVALIDO');
});

test('basura: XML mal formado, XML que no es CFDI, sin conceptos, UUID inválido', () => {
  assert.equal(falla(() => parsearCfdi('esto no es xml')), 'XML_INVALIDO');
  assert.equal(falla(() => parsearCfdi('<html><body>hola</body></html>')), 'XML_NO_CFDI');
  assert.equal(falla(() => parsearCfdi('<a><b></a>')), 'XML_INVALIDO');
  assert.equal(falla(() => parsearCfdi('')), 'XML_INVALIDO');
  assert.equal(falla(() => parsearCfdi(cfdi({ conceptos: [] }))), 'XML_SIN_CONCEPTOS');
  assert.equal(falla(() => parsearCfdi(cfdi({ uuid: 'no-es-uuid' }))), 'XML_INVALIDO');
});

test('BOM al inicio y entidades normales (&amp;) no rompen la lectura', () => {
  const f = parsearCfdi('﻿' + cfdi({ conceptos: [{ clave: 'Q', descripcion: 'PAPAS &amp; DULCES', cantidad: '1', valorUnitario: '10.00', importe: '10.00', iva: '1.60' }], subtotal: '10.00', total: '11.60' }));
  assert.equal(f.lineas[0].descripcion, 'PAPAS & DULCES');
});
