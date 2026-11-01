'use strict';
// Generador de CFDI SINTÉTICOS para pruebas (datos inventados, no son facturas reales).
const UUID_BASE = 'A1B2C3D4-E5F6-4711-8899-AABBCCDD';

function concepto(c) {
  const traslados = c.iva !== undefined
    ? `<cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="${c.importe}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${c.iva}"/></cfdi:Traslados>${
      c.retencion ? `<cfdi:Retenciones><cfdi:Retencion Base="${c.importe}" Impuesto="001" TipoFactor="Tasa" TasaOCuota="0.100000" Importe="${c.retencion}"/></cfdi:Retenciones>` : ''}</cfdi:Impuestos>`
    : c.exento ? `<cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="${c.importe}" Impuesto="002" TipoFactor="Exento"/></cfdi:Traslados></cfdi:Impuestos>` : '';
  return `<cfdi:Concepto ClaveProdServ="${c.sat || '50202306'}"${c.clave === null ? '' : ` NoIdentificacion="${c.clave ?? 'SKU-1'}"`} Cantidad="${c.cantidad}" ClaveUnidad="${c.claveUnidad || 'H87'}" Unidad="${c.unidad || 'Pieza'}" Descripcion="${c.descripcion}" ValorUnitario="${c.valorUnitario}" Importe="${c.importe}"${c.descuento ? ` Descuento="${c.descuento}"` : ''} ObjetoImp="02">${traslados}</cfdi:Concepto>`;
}

// opts: version, tipo, uuid, serie, folio, fecha, moneda, tipoCambio, total, subtotal, emisor{rfc,nombre}, conceptos[], sinTimbre, prefijoDoctype
function cfdi(opts = {}) {
  const o = {
    version: '4.0', tipo: 'I', serie: 'A', folio: '1234', fecha: '2026-10-28T10:15:00', moneda: 'MXN', uuid: `${UUID_BASE}0001`,
    emisor: { rfc: 'DSO010203AB4', nombre: 'DISTRIBUIDORA SOL SA DE CV' }, subtotal: '1000.00', total: '1160.00',
    conceptos: [{ clave: 'REF600', descripcion: 'REFRESCO COLA 600ML CAJA 24', cantidad: '2', valorUnitario: '500.00', importe: '1000.00', iva: '160.00', unidad: 'Caja' }],
    ...opts,
  };
  const cab = o.version === '3.3'
    ? `Version="3.3" Serie="${o.serie}" Folio="${o.folio}" Fecha="${o.fecha}" TipoDeComprobante="${o.tipo}" SubTotal="${o.subtotal}" Moneda="${o.moneda}"${o.tipoCambio ? ` TipoCambio="${o.tipoCambio}"` : ''} Total="${o.total}"`
    : `Version="4.0"${o.serie ? ` Serie="${o.serie}"` : ''}${o.folio ? ` Folio="${o.folio}"` : ''} Fecha="${o.fecha}" TipoDeComprobante="${o.tipo}" SubTotal="${o.subtotal}" Moneda="${o.moneda}"${o.tipoCambio ? ` TipoCambio="${o.tipoCambio}"` : ''} Total="${o.total}"`;
  const ns = o.version === '3.3' ? 'http://www.sat.gob.mx/cfd/3' : 'http://www.sat.gob.mx/cfd/4';
  return `${o.prefijoDoctype || ''}<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="${ns}" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" ${cab}>
  <cfdi:Emisor Rfc="${o.emisor.rfc}" Nombre="${o.emisor.nombre}" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XAXX010101000" Nombre="LUNA DE PRECIOS" UsoCFDI="G01"/>
  <cfdi:Conceptos>${o.conceptos.map(concepto).join('')}</cfdi:Conceptos>
  ${o.sinTimbre ? '' : `<cfdi:Complemento><tfd:TimbreFiscalDigital Version="1.1" UUID="${o.uuid}" FechaTimbrado="${o.fecha}"/></cfdi:Complemento>`}
</cfdi:Comprobante>`;
}

module.exports = { cfdi, UUID_BASE };
