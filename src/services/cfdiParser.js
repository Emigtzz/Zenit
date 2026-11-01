'use strict';
const { XMLParser, XMLValidator } = require('fast-xml-parser');
const { ErrorApp } = require('../utils/errores');
const { decimalACentavos } = require('../utils/dinero');
const { normalizar } = require('../utils/texto');

// Lee un XML de CFDI (versiones 3.3 y 4.0) y lo convierte a una "factura" neutra, en centavos.
// IMPORTANTE: solo EXTRAE datos. No valida el sello ni consulta al SAT: la autenticidad de la factura no se verifica aquí.
const TIPOS_NO_SOPORTADOS = {
  E: 'Es una nota de crédito (egreso). Regístrala como ajuste de inventario o devuelve la compra original.',
  P: 'Es un complemento de pago, no una factura de compra.',
  T: 'Es un comprobante de traslado, no una factura de compra.',
  N: 'Es un recibo de nómina, no una factura de compra.',
};
const UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,                 // cfdi:Concepto -> Concepto
  parseAttributeValue: false,           // los importes se quedan como TEXTO (nada de flotantes)
  parseTagValue: false,
  isArray: (nombre) => ['Concepto', 'Traslado', 'Retencion'].includes(nombre), // un solo concepto también es lista
});

const lista = (x) => (x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]);
const dinero = (x) => decimalACentavos(x) ?? 0;

function invalido(mensaje, codigo = 'XML_INVALIDO') { return new ErrorApp(mensaje, { status: 422, codigo }); }

function parsearCfdi(xml) {
  const texto = String(xml).replace(/^﻿/, '');
  // Seguridad: un CFDI real no lleva DTD ni entidades. Rechazarlos corta de raíz el ataque de "XML bomb" / XXE.
  if (/<!DOCTYPE|<!ENTITY/i.test(texto)) throw invalido('El XML contiene declaraciones no permitidas (DOCTYPE/ENTITY)');

  // El parser es permisivo (no falla con XML roto), así que primero se valida que esté bien formado.
  if (XMLValidator.validate(texto) !== true) throw invalido('El archivo no es un XML válido');
  const doc = parser.parse(texto);
  const c = doc?.Comprobante;
  if (!c) throw invalido('El XML no es un CFDI (no tiene el nodo Comprobante)', 'XML_NO_CFDI');

  const tipo = c['@_TipoDeComprobante'] ?? c['@_tipoDeComprobante'];
  if (TIPOS_NO_SOPORTADOS[tipo]) throw invalido(TIPOS_NO_SOPORTADOS[tipo], 'COMPROBANTE_NO_SOPORTADO');
  if (tipo !== 'I' && tipo !== 'Ingreso') throw invalido(`Tipo de comprobante no reconocido: "${tipo}"`, 'COMPROBANTE_NO_SOPORTADO');

  const version = c['@_Version'] ?? c['@_version'] ?? null;
  const advertencias = [];

  const timbre = c.Complemento?.TimbreFiscalDigital;
  const uuid = timbre?.['@_UUID'] ? String(timbre['@_UUID']).toUpperCase() : null;
  if (!uuid) advertencias.push('El XML no trae timbre fiscal (UUID): puede no ser un CFDI válido.');
  else if (!UUID.test(uuid)) throw invalido('El UUID del timbre fiscal no tiene un formato válido');

  const serie = c['@_Serie'] || null;
  const folio = c['@_Folio'] || null;
  const folioFactura = folio ? (serie ? `${serie}-${folio}` : String(folio)) : null;

  const fechaHora = c['@_Fecha'] || null;
  const fecha = fechaHora && /^\d{4}-\d{2}-\d{2}/.test(fechaHora) ? fechaHora.slice(0, 10) : null;
  if (!fecha) advertencias.push('No se pudo leer la fecha de la factura: captúrala en la revisión.');

  // Moneda extranjera: se convierte con el tipo de cambio de la factura (si lo trae) y se avisa.
  const moneda = c['@_Moneda'] || 'MXN';
  const tipoCambio = c['@_TipoCambio'] ? Number(c['@_TipoCambio']) : null;
  const extranjera = !['MXN', 'XXX'].includes(moneda);
  const factor = extranjera ? tipoCambio : 1;
  if (extranjera) {
    advertencias.push(factor
      ? `La factura está en ${moneda}: se convirtió a pesos con tipo de cambio ${tipoCambio}. Verifica los costos.`
      : `La factura está en ${moneda} y no trae tipo de cambio: los importes NO están en pesos. Corrígelos en la revisión.`);
  }
  const aPesos = (centavos) => (factor && factor !== 1 ? Math.round(centavos * factor) : centavos);

  const conceptos = lista(c.Conceptos?.Concepto);
  if (!conceptos.length) throw invalido('La factura no tiene conceptos', 'XML_SIN_CONCEPTOS');

  const lineas = conceptos.map((k, i) => {
    const cantidad = Number(k['@_Cantidad']);
    const importe = dinero(k['@_Importe']);
    const descuento = dinero(k['@_Descuento']);
    const traslados = lista(k.Impuestos?.Traslados?.Traslado).reduce((s, t) => s + dinero(t['@_Importe']), 0); // "Exento" no trae Importe
    const retenciones = lista(k.Impuestos?.Retenciones?.Retencion).reduce((s, t) => s + dinero(t['@_Importe']), 0);
    const base = aPesos(importe - descuento);
    const impuestos = aPesos(traslados - retenciones);
    const noIdent = k['@_NoIdentificacion'] ? String(k['@_NoIdentificacion']).trim() : null;
    const descripcion = String(k['@_Descripcion'] ?? '').trim();
    if (!(cantidad > 0)) advertencias.push(`Línea ${i + 1}: cantidad inválida (${k['@_Cantidad']}).`);
    return {
      indice: i,
      no_identificacion: noIdent,
      // Llave de la equivalencia proveedor→producto: la clave del proveedor; si no manda, la descripción normalizada.
      clave_proveedor: noIdent || `desc:${normalizar(descripcion)}`,
      clave_sat: k['@_ClaveProdServ'] || null,
      descripcion,
      cantidad,
      unidad: k['@_Unidad'] || k['@_ClaveUnidad'] || null,
      importe_sin_impuestos: base,
      impuestos,
      importe_con_impuestos: base + impuestos,
    };
  });

  // Verificación aritmética: lo que sumamos debe coincidir con el Total declarado.
  const total = aPesos(dinero(c['@_Total']));
  const calculado = lineas.reduce((s, l) => s + l.importe_con_impuestos, 0);
  if (Math.abs(calculado - total) > 100) {
    advertencias.push(`La suma de las líneas (${(calculado / 100).toFixed(2)}) no coincide con el total de la factura (${(total / 100).toFixed(2)}). Revisa descuentos o impuestos globales.`);
  }

  return {
    fuente: 'xml', version, tipo_comprobante: 'I', uuid, serie, folio, folio_factura: folioFactura,
    fecha, fecha_hora: fechaHora, moneda, tipo_cambio: tipoCambio,
    emisor: { rfc: (c.Emisor?.['@_Rfc'] || '').toUpperCase() || null, nombre: c.Emisor?.['@_Nombre'] || null },
    receptor: { rfc: (c.Receptor?.['@_Rfc'] || '').toUpperCase() || null, nombre: c.Receptor?.['@_Nombre'] || null },
    subtotal: aPesos(dinero(c['@_SubTotal'])), total, lineas, advertencias,
  };
}

module.exports = { parsearCfdi };
