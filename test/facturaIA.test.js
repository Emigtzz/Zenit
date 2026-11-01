'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Anthropic = require('@anthropic-ai/sdk');
const facturaIA = require('../src/services/facturaIA');

const PDF = Buffer.from('%PDF-1.4\nfalso para pruebas\n%%EOF');

const salidaOk = (extra = {}) => ({
  es_factura_de_compra: true, proveedor_nombre: 'DISTRIBUIDORA SOL', proveedor_rfc: 'dso010203ab4', uuid_cfdi: null,
  serie: 'A', folio: '1234', fecha: '2026-10-28', moneda: 'MXN', subtotal: 1000, impuestos_total: 160, total: 1160,
  conceptos: [{ clave: 'REF600', descripcion: 'Refresco cola 600ml caja 24', cantidad: 2, unidad: 'Caja', valor_unitario: 500, importe: 1000, descuento: null, iva: null }],
  notas: null, ...extra,
});
const clienteFalso = (resultado) => ({ messages: { parse: async (params) => { clienteFalso.ultimo = params; if (resultado instanceof Error) throw resultado; return resultado; } } });
const falla = async (p) => { try { await p; return null; } catch (e) { return e.codigo; } };
const errorSdk = (Clase) => Object.assign(Object.create(Clase.prototype), { message: 'x', status: 500 });

test('sin API key: error claro y sugiere el XML (no intenta llamar a nadie)', async () => {
  const ia = facturaIA({ apiKey: '' });
  assert.equal(ia.disponible(), false);
  assert.equal(await falla(ia.extraer(PDF)), 'IA_NO_CONFIGURADA');
});

test('mapea la respuesta a la factura neutra: centavos, folio con serie, RFC normalizado, IVA repartido', async () => {
  const ia = facturaIA({ cliente: clienteFalso({ stop_reason: 'end_turn', parsed_output: salidaOk() }) });
  const f = await ia.extraer(PDF);
  assert.equal(f.fuente, 'pdf');
  assert.equal(f.folio_factura, 'A-1234');
  assert.equal(f.fecha, '2026-10-28');
  assert.equal(f.emisor.rfc, 'DSO010203AB4');
  assert.equal(f.total, 116000);
  const l = f.lineas[0];
  assert.deepEqual([l.importe_sin_impuestos, l.impuestos, l.importe_con_impuestos], [100000, 16000, 116000]);
  assert.equal(l.clave_proveedor, 'REF600');
  assert.ok(f.advertencias[0].includes('IA'));
  assert.ok(f.advertencias.some((a) => /repartió/.test(a)));
  assert.ok(!f.advertencias.some((a) => /no coincide/.test(a)));
});

test('el IVA global se reparte proporcional y el último renglón absorbe el redondeo (la suma cuadra al centavo)', async () => {
  const out = salidaOk({
    subtotal: 100, impuestos_total: 16, total: 116,
    conceptos: [
      { clave: null, descripcion: 'A', cantidad: 1, unidad: null, valor_unitario: 33.33, importe: 33.33, descuento: null, iva: null },
      { clave: null, descripcion: 'B', cantidad: 1, unidad: null, valor_unitario: 33.33, importe: 33.33, descuento: null, iva: null },
      { clave: null, descripcion: 'C', cantidad: 1, unidad: null, valor_unitario: 33.34, importe: 33.34, descuento: null, iva: null },
    ],
  });
  const f = await facturaIA({ cliente: clienteFalso({ stop_reason: 'end_turn', parsed_output: out }) }).extraer(PDF);
  assert.equal(f.lineas.reduce((s, l) => s + l.impuestos, 0), 1600);
  assert.equal(f.lineas.reduce((s, l) => s + l.importe_con_impuestos, 0), 11600);
  assert.equal(f.lineas[0].clave_proveedor, 'desc:a'); // sin clave -> descripción normalizada
});

test('IVA por línea (si el PDF lo desglosa) se respeta y no se reparte; descuento se resta', async () => {
  const out = salidaOk({ impuestos_total: 14.4, total: 1044, subtotal: 900, conceptos: [
    { clave: 'X', descripcion: 'Con descuento', cantidad: 10, unidad: 'Pieza', valor_unitario: 100, importe: 1000, descuento: 100, iva: 144 } ] });
  const f = await facturaIA({ cliente: clienteFalso({ stop_reason: 'end_turn', parsed_output: out }) }).extraer(PDF);
  assert.deepEqual([f.lineas[0].importe_sin_impuestos, f.lineas[0].impuestos], [90000, 14400]);
  assert.ok(!f.advertencias.some((a) => /repartió/.test(a)));
});

test('advertencias: suma distinta al total, sin fecha, moneda extranjera, notas de la IA, RFC/UUID inválidos se descartan', async () => {
  const out = salidaOk({ total: 5000, fecha: '28/10/2026', moneda: 'usd', notas: 'Total borroso', proveedor_rfc: '123', uuid_cfdi: 'xyz' });
  const f = await facturaIA({ cliente: clienteFalso({ stop_reason: 'end_turn', parsed_output: out }) }).extraer(PDF);
  assert.equal(f.fecha, null);
  assert.equal(f.emisor.rfc, null);
  assert.equal(f.uuid, null);
  for (const re of [/no coincide con el total/, /fecha/, /USD/, /Total borroso/]) assert.ok(f.advertencias.some((a) => re.test(a)), String(re));
});

test('documento que no es factura, o sin renglones, se rechaza', async () => {
  const noFactura = facturaIA({ cliente: clienteFalso({ stop_reason: 'end_turn', parsed_output: salidaOk({ es_factura_de_compra: false }) }) });
  assert.equal(await falla(noFactura.extraer(PDF)), 'PDF_NO_ES_FACTURA');
  const vacia = facturaIA({ cliente: clienteFalso({ stop_reason: 'end_turn', parsed_output: salidaOk({ conceptos: [] }) }) });
  assert.equal(await falla(vacia.extraer(PDF)), 'PDF_SIN_CONCEPTOS');
});

test('stop_reason refusal / max_tokens / sin parsed_output se traducen a errores claros', async () => {
  assert.equal(await falla(facturaIA({ cliente: clienteFalso({ stop_reason: 'refusal', parsed_output: null }) }).extraer(PDF)), 'IA_RECHAZO');
  assert.equal(await falla(facturaIA({ cliente: clienteFalso({ stop_reason: 'max_tokens', parsed_output: null }) }).extraer(PDF)), 'PDF_DEMASIADO_LARGO');
  assert.equal(await falla(facturaIA({ cliente: clienteFalso({ stop_reason: 'end_turn', parsed_output: null }) }).extraer(PDF)), 'IA_SIN_RESULTADO');
});

test('errores tipados del SDK: clave inválida, saturado, sin internet, PDF ilegible, genérico', async () => {
  const caso = async (Clase) => falla(facturaIA({ cliente: clienteFalso(errorSdk(Clase)) }).extraer(PDF));
  assert.equal(await caso(Anthropic.AuthenticationError), 'IA_CLAVE_INVALIDA');
  assert.equal(await caso(Anthropic.RateLimitError), 'IA_OCUPADA');
  assert.equal(await caso(Anthropic.APIConnectionError), 'IA_SIN_CONEXION');
  assert.equal(await caso(Anthropic.BadRequestError), 'PDF_ILEGIBLE');
  assert.equal(await caso(Anthropic.InternalServerError), 'IA_ERROR');
});

test('parámetros de la petición: modelo por defecto, PDF en base64, salida estructurada, y SIN tool_choice forzado ni temperature', async () => {
  const c = clienteFalso({ stop_reason: 'end_turn', parsed_output: salidaOk() });
  await facturaIA({ cliente: c }).extraer(PDF);
  const p = clienteFalso.ultimo;
  assert.equal(p.model, 'claude-opus-5-5');
  assert.ok(p.output_config.format);
  assert.equal(p.tool_choice, undefined);   // con este modelo, un tool_choice forzado devuelve 400
  assert.equal(p.temperature, undefined);   // muestreo personalizado también es 400
  assert.equal(p.thinking, undefined);
  const doc = p.messages[0].content[0];
  assert.equal(doc.type, 'document');
  assert.equal(doc.source.media_type, 'application/pdf');
  assert.equal(Buffer.from(doc.source.data, 'base64').toString(), PDF.toString());
  assert.match(p.system, /no confiables/);   // anti prompt-injection
  assert.equal((await facturaIA({ cliente: c, modelo: 'claude-sonnet-5-5' }).extraer(PDF), clienteFalso.ultimo.model), 'claude-sonnet-5-5');
});

test('SDK REAL con fetch simulado: la petición HTTP sale bien armada y la respuesta se interpreta', async () => {
  let peticion = null;
  const respuesta = { id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null,
    content: [{ type: 'text', text: JSON.stringify(salidaOk()) }], usage: { input_tokens: 1500, output_tokens: 300 } };
  const fetchSimulado = async (url, init) => {
    peticion = { url: String(url), headers: Object.fromEntries(new Headers(init.headers)), body: JSON.parse(init.body) };
    return new Response(JSON.stringify(respuesta), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const ia = facturaIA({ apiKey: 'sk-ant-clave-de-prueba', opcionesCliente: { fetch: fetchSimulado, maxRetries: 0 } });
  const f = await ia.extraer(PDF);
  assert.equal(f.folio_factura, 'A-1234');
  assert.match(peticion.url, /\/v1\/messages$/);
  assert.equal(peticion.headers.authorization, 'Bearer sk-ant-clave-de-prueba'); // así envía la clave el SDK oficial
  assert.ok(peticion.headers['anthropic-version']);
  assert.equal(peticion.body.model, 'claude-opus-5-5');
  assert.equal(peticion.body.messages[0].content[0].type, 'document');
  assert.equal(peticion.body.output_config.format.type, 'json_schema');
  assert.equal(peticion.body.tool_choice, undefined);
  assert.ok(peticion.body.output_config.format.schema.properties.conceptos);
});

test('SDK REAL: un 401 del servidor se convierte en IA_CLAVE_INVALIDA (sin filtrar la clave)', async () => {
  const fetchSimulado = async () => new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), { status: 401, headers: { 'content-type': 'application/json' } });
  const ia = facturaIA({ apiKey: 'sk-ant-mala', opcionesCliente: { fetch: fetchSimulado, maxRetries: 0 } });
  try { await ia.extraer(PDF); assert.fail('debió fallar'); } catch (e) { assert.equal(e.codigo, 'IA_CLAVE_INVALIDA'); assert.ok(!e.message.includes('sk-ant')); }
});
