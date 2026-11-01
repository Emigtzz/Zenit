'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const importacionService = require('../src/services/importacionService');
const compraService = require('../src/services/compraService');
const proveedorService = require('../src/services/proveedorService');
const busquedaService = require('../src/services/busquedaService');
const productoRepository = require('../src/repositories/productoRepository');
const { crearBaseDePrueba, stockDe, contar } = require('./helpers');
const { cfdi, UUID_BASE } = require('./cfdi-fixtures');

const PDF = Buffer.from('%PDF-1.4\nfactura falsa\n%%EOF');
const xmlBuf = (opts) => Buffer.from(cfdi(opts), 'utf8');
const codigo = async (p) => { try { await p; return null; } catch (e) { return e.codigo; } };
const costoDe = (db, id) => db.prepare('SELECT costo FROM productos WHERE id = ?').get(id).costo;

function entorno({ iaFactura } = {}) {
  const db = crearBaseDePrueba({ cajaAbierta: false });
  db.prepare("INSERT INTO usuarios (nombre, rol, contrasena_hash) VALUES ('Ana','dueño','x')").run();
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'zenit-fact-'));
  const busqueda = busquedaService(productoRepository(db));
  const proveedores = proveedorService(db);
  const compras = compraService(db, busqueda);
  const ia = { disponible: () => true, extraer: async () => iaFactura };
  const svc = importacionService(db, { config: { carpetaFacturas: carpeta, costoIncluyeImpuestos: true }, ia, busqueda, compras, proveedores });
  return { db, svc, carpeta, proveedores, busqueda };
}
// Confirmación típica: la caja de 24 refrescos (producto 1) factura 2 cajas a 1160 con IVA -> 48 piezas a 24.17
const confirmacion = (extra = {}) => ({
  proveedor_id: undefined, nuevo_proveedor: { nombre: 'Distribuidora Sol', rfc: 'DSO010203AB4' }, folio_factura: 'A-1234', fecha: '2026-10-28',
  items: [{ linea: 0, producto_id: 1, cantidad: 48, costo_unitario: 2417, factor: 24 }], ...extra,
});

test('subir un XML crea un BORRADOR: no toca stock, costos ni compras', async () => {
  const { db, svc } = entorno();
  const antes = { stock: stockDe(db, 1), costo: costoDe(db, 1) };
  const b = await svc.crear({ buffer: xmlBuf(), nombre: 'factura.xml' }, { usuarioId: 1 });
  assert.equal(b.estado, 'pendiente');
  assert.equal(b.fuente, 'xml');
  assert.equal(b.factura.folio_factura, 'A-1234');
  assert.equal(b.factura.lineas.length, 1);
  assert.equal(stockDe(db, 1), antes.stock);
  assert.equal(costoDe(db, 1), antes.costo);
  assert.equal(contar(db, 'compras'), 0);
  assert.equal(contar(db, 'movimientos_inventario'), 0);
});

test('el borrador sugiere productos parecidos (quita el ruido de empaque) y no hay proveedor aún', async () => {
  const { svc } = entorno();
  const b = await svc.crear({ buffer: xmlBuf(), nombre: 'f.xml' });
  assert.equal(b.proveedor_sugerido, null);
  assert.equal(b.factura.lineas[0].sugerido, null);
  assert.deepEqual(b.factura.lineas[0].candidatos.map((c) => c.nombre), ['Refresco 600ml']);
});

test('el archivo original se guarda en disco con un nombre seguro (sin rutas del usuario)', async () => {
  const { svc, carpeta } = entorno();
  const b = await svc.crear({ buffer: xmlBuf(), nombre: '../../etc/passwd mi factura!.xml' });
  assert.match(b.archivo_nombre, /^[\w\-]+\.xml$/);
  const { ruta } = svc.archivo(b.id);
  assert.ok(ruta.startsWith(carpeta + path.sep));
  assert.ok(fs.existsSync(ruta));
  assert.equal(fs.readFileSync(ruta).toString(), xmlBuf().toString());
});

test('tipo de archivo por CONTENIDO: vacío, enorme, ni XML ni PDF; un .xml con contenido PDF se trata como PDF', async () => {
  const { svc } = entorno({ iaFactura: { fuente: 'pdf', uuid: null, folio_factura: 'P-1', emisor: { rfc: null, nombre: 'X' }, total: 100, lineas: [], advertencias: [] } });
  assert.equal(await codigo(svc.crear({ buffer: Buffer.alloc(0), nombre: 'a.xml' })), 'ARCHIVO_VACIO');
  assert.equal(await codigo(svc.crear({ buffer: Buffer.from('hola mundo'), nombre: 'a.xml' })), 'ARCHIVO_NO_SOPORTADO');
  assert.equal(await codigo(svc.crear({ buffer: Buffer.from('MZ\u0090\u0000ejecutable'), nombre: 'factura.pdf' })), 'ARCHIVO_NO_SOPORTADO');
  assert.equal(await codigo(svc.crear({ buffer: Buffer.alloc(8 * 1024 * 1024 + 1, 0x20), nombre: 'a.xml' })), 'ARCHIVO_GRANDE');
  const b = await svc.crear({ buffer: PDF, nombre: 'es-un-pdf.xml' });
  assert.equal(b.fuente, 'pdf');
});

test('PDF: usa el extractor de IA y deja el borrador marcado como "pdf"', async () => {
  const factura = { fuente: 'pdf', uuid: null, folio_factura: 'P-9', fecha: '2026-10-28', emisor: { rfc: null, nombre: 'Bodega Norte' }, total: 11600, subtotal: 10000,
    lineas: [{ indice: 0, no_identificacion: null, clave_proveedor: 'desc:galletas marias', descripcion: 'Galletas Marias', cantidad: 1, unidad: 'Caja',
      importe_sin_impuestos: 10000, impuestos: 1600, importe_con_impuestos: 11600 }], advertencias: ['Datos leídos con IA'] };
  const { svc } = entorno({ iaFactura: factura });
  const b = await svc.crear({ buffer: PDF, nombre: 'f.pdf' });
  assert.equal(b.fuente, 'pdf');
  assert.deepEqual(b.factura.lineas[0].candidatos.map((c) => c.nombre), ['Galletas']);
});

test('el MISMO archivo no se sube dos veces; uno descartado sí puede volver a subirse', async () => {
  const { svc } = entorno();
  const b = await svc.crear({ buffer: xmlBuf(), nombre: 'f.xml' });
  const e = await svc.crear({ buffer: xmlBuf(), nombre: 'otra-copia.xml' }).catch((x) => x);
  assert.equal(e.codigo, 'ARCHIVO_REPETIDO');
  assert.equal(e.detalles.importacion_id, b.id);
  svc.descartar(b.id);
  assert.doesNotThrow(() => svc.crear({ buffer: xmlBuf(), nombre: 'f.xml' }));
});

test('CONFIRMAR: crea la compra con piezas y costo por pieza, sube stock, actualiza costo y guarda UUID y archivo', async () => {
  const { db, svc } = entorno();
  const b = await svc.crear({ buffer: xmlBuf(), nombre: 'f.xml' });
  const r = await svc.confirmar(b.id, confirmacion(), { usuarioId: 1 });
  assert.equal(r.compra.total, 48 * 2417);
  assert.equal(r.compra.uuid_cfdi, `${UUID_BASE}0001`);
  assert.match(r.compra.archivo, /^facturas\/imp-\d+-.+\.xml$/);
  assert.equal(r.compra.folio_factura, 'A-1234');
  assert.equal(r.compra.proveedor_nombre, 'Distribuidora Sol');
  assert.equal(stockDe(db, 1), 10 + 48);
  assert.equal(costoDe(db, 1), 2417);
  assert.equal(r.equivalencias_guardadas, 1);
  assert.deepEqual(r.comparacion, { total_factura: 116000, total_capturado: 116016, diferencia: 16 });
  assert.equal(svc.obtener(b.id).estado, 'confirmada');
  assert.equal(svc.obtener(b.id).compra_id, r.compra.id);
});

test('APRENDE: la siguiente factura del mismo proveedor llega con producto y factor ya sugeridos (reconocido por RFC)', async () => {
  const { svc } = entorno();
  const primera = await svc.crear({ buffer: xmlBuf(), nombre: 'f1.xml' });
  await svc.confirmar(primera.id, confirmacion(), { usuarioId: 1 });
  const segunda = await svc.crear({ buffer: xmlBuf({ folio: '9999', uuid: `${UUID_BASE}0002` }), nombre: 'f2.xml' });
  assert.equal(segunda.proveedor_sugerido.coincidencia, 'rfc');
  assert.equal(segunda.proveedor_sugerido.nombre, 'Distribuidora Sol');
  assert.deepEqual(segunda.factura.lineas[0].sugerido, { producto_id: 1, nombre: 'Refresco 600ml', factor: 24, origen: 'equivalencia' });
  assert.deepEqual(segunda.factura.lineas[0].candidatos, []);
  assert.equal(svc.listarEquivalencias().length, 1);
});

test('proveedor reconocido por nombre cuando no hay RFC coincidente', async () => {
  const { svc, proveedores } = entorno();
  proveedores.crear({ nombre: 'DISTRIBUIDORA SOL SA DE CV', rfc: null });
  const b = await svc.crear({ buffer: xmlBuf(), nombre: 'f.xml' });
  assert.equal(b.proveedor_sugerido.coincidencia, 'nombre');
});

test('una equivalencia hacia un producto desactivado NO se sugiere', async () => {
  const { svc, db } = entorno();
  const a = await svc.crear({ buffer: xmlBuf(), nombre: 'f1.xml' });
  await svc.confirmar(a.id, confirmacion());
  db.prepare('UPDATE productos SET activo = 0 WHERE id = 1').run();
  const b = await svc.crear({ buffer: xmlBuf({ folio: '2', uuid: `${UUID_BASE}0002` }), nombre: 'f2.xml' });
  assert.equal(b.factura.lineas[0].sugerido, null);
});

test('una factura ya registrada (UUID) no se puede volver a subir aunque el archivo sea distinto (XML vs XML modificado)', async () => {
  const { svc } = entorno();
  const a = await svc.crear({ buffer: xmlBuf(), nombre: 'f.xml' });
  await svc.confirmar(a.id, confirmacion());
  const otroArchivoMismaFactura = Buffer.from(cfdi() + '\n<!-- reenviado por correo -->', 'utf8');
  const e = await svc.crear({ buffer: otroArchivoMismaFactura, nombre: 'reenviada.xml' }).catch((x) => x);
  assert.equal(e.codigo, 'FACTURA_YA_REGISTRADA');
});

test('dos borradores de la MISMA factura: se avisa y solo se puede confirmar uno', async () => {
  const { svc } = entorno();
  const a = await svc.crear({ buffer: xmlBuf(), nombre: 'f.xml' });
  const b = await svc.crear({ buffer: Buffer.from(cfdi() + '\n<!-- copia -->', 'utf8'), nombre: 'copia.xml' });
  assert.ok(b.factura.advertencias.some((x) => /otra importación pendiente/.test(x)));
  await svc.confirmar(a.id, confirmacion());
  assert.equal(await codigo(svc.confirmar(b.id, confirmacion({ nuevo_proveedor: undefined, proveedor_id: 1, folio_factura: 'OTRO' }))), 'FACTURA_YA_REGISTRADA');
  assert.equal(svc.obtener(b.id).estado, 'pendiente');
});

test('folio ya registrado del mismo proveedor: el borrador lo advierte', async () => {
  const { svc } = entorno();
  const a = await svc.crear({ buffer: xmlBuf(), nombre: 'f.xml' });
  await svc.confirmar(a.id, confirmacion());
  const b = await svc.crear({ buffer: xmlBuf({ uuid: `${UUID_BASE}0009` }), nombre: 'otro.xml' }); // mismo folio A-1234, otro UUID
  assert.ok(b.factura.advertencias.some((x) => /ya está registrada/.test(x)));
});

test('renglones que terminan en el MISMO producto se unen: piezas sumadas y costo ponderado', async () => {
  const { svc, db } = entorno();
  const b = await svc.crear({ buffer: xmlBuf({
    subtotal: '300.00', total: '348.00',
    conceptos: [
      { clave: 'A', descripcion: 'REFRESCO COLA', cantidad: '1', valorUnitario: '100.00', importe: '100.00', iva: '16.00' },
      { clave: 'B', descripcion: 'REFRESCO COLA PROMO', cantidad: '1', valorUnitario: '200.00', importe: '200.00', iva: '32.00' },
    ] }), nombre: 'f.xml' });
  const r = await svc.confirmar(b.id, confirmacion({ items: [
    { linea: 0, producto_id: 1, cantidad: 10, costo_unitario: 1000, factor: 10 },   // 10 pzas a 10.00
    { linea: 1, producto_id: 1, cantidad: 20, costo_unitario: 1300, factor: 20 },   // 20 pzas a 13.00
  ] }));
  assert.equal(r.compra.detalle.length, 1);
  assert.equal(r.compra.detalle[0].cantidad, 30);
  assert.equal(r.compra.detalle[0].costo_unitario, Math.round((10 * 1000 + 20 * 1300) / 30)); // 1200
  assert.equal(r.equivalencias_guardadas, 2);
  assert.equal(stockDe(db, 1), 40);
});

test('REVERSIÓN: si la compra falla, no queda proveedor nuevo, ni compra, ni equivalencias, y el borrador sigue pendiente', async () => {
  const { svc, db } = entorno();
  const b = await svc.crear({ buffer: xmlBuf(), nombre: 'f.xml' });
  db.exec("CREATE TRIGGER falla BEFORE INSERT ON movimientos_inventario BEGIN SELECT RAISE(ABORT, 'fallo simulado'); END;");
  await assert.rejects(svc.confirmar(b.id, confirmacion()), /fallo simulado/);
  assert.equal(contar(db, 'proveedores'), 0);
  assert.equal(contar(db, 'compras'), 0);
  assert.equal(contar(db, 'equivalencias_proveedor'), 0);
  assert.equal(stockDe(db, 1), 10);
  assert.equal(svc.obtener(b.id).estado, 'pendiente');
});

test('REVERSIÓN: un renglón inexistente en la factura deshace todo (incluida la compra ya guardada)', async () => {
  const { svc, db } = entorno();
  const b = await svc.crear({ buffer: xmlBuf(), nombre: 'f.xml' });
  assert.equal(await codigo(svc.confirmar(b.id, confirmacion({ items: [{ linea: 7, producto_id: 1, cantidad: 1, costo_unitario: 100, factor: 1 }] }))), 'LINEA_INVALIDA');
  assert.equal(contar(db, 'compras'), 0);
  assert.equal(stockDe(db, 1), 10);
  assert.equal(costoDe(db, 1), 1000);
});

test('confirmar dos veces, o sin proveedor, o con producto inválido, se rechaza', async () => {
  const { svc } = entorno();
  const b = await svc.crear({ buffer: xmlBuf(), nombre: 'f.xml' });
  assert.equal(await codigo(svc.confirmar(b.id, confirmacion({ nuevo_proveedor: undefined }))), 'PROVEEDOR_REQUERIDO');
  assert.equal(await codigo(svc.confirmar(b.id, confirmacion({ items: [{ linea: 0, producto_id: 99, cantidad: 1, costo_unitario: 100, factor: 1 }] }))), 'PRODUCTO_INVALIDO');
  await svc.confirmar(b.id, confirmacion());
  assert.equal(await codigo(svc.confirmar(b.id, confirmacion())), 'YA_RESUELTA');
});

test('descartar: borra el archivo y no permite descartar una ya confirmada', async () => {
  const { svc } = entorno();
  const a = await svc.crear({ buffer: xmlBuf(), nombre: 'f.xml' });
  const { ruta } = svc.archivo(a.id);
  svc.descartar(a.id);
  assert.equal(fs.existsSync(ruta), false);
  assert.equal(svc.obtener(a.id).estado, 'descartada');
  const b = await svc.crear({ buffer: xmlBuf({ uuid: `${UUID_BASE}0003`, folio: '3' }), nombre: 'g.xml' });
  await svc.confirmar(b.id, confirmacion({ folio_factura: '3' }));
  assert.throws(() => svc.descartar(b.id), (e) => e.codigo === 'YA_RESUELTA');
});

test('listar por estado y borrar una equivalencia equivocada', async () => {
  const { svc } = entorno();
  const a = await svc.crear({ buffer: xmlBuf(), nombre: 'f.xml' });
  assert.equal(svc.listar('pendiente').length, 1);
  assert.equal(svc.listar('confirmada').length, 0);
  await svc.confirmar(a.id, confirmacion());
  assert.equal(svc.listar('confirmada')[0].proveedor, 'DISTRIBUIDORA SOL SA DE CV');
  const eq = svc.listarEquivalencias()[0];
  svc.borrarEquivalencia(eq.proveedor_id, eq.clave_proveedor);
  assert.equal(svc.listarEquivalencias().length, 0);
  assert.throws(() => svc.borrarEquivalencia(1, 'no-existe'), (e) => e.codigo === 'NO_ENCONTRADO');
});

test('archivo(): una ruta guardada fuera de la carpeta nunca se entrega (path traversal)', async () => {
  const { svc, db } = entorno();
  const a = await svc.crear({ buffer: xmlBuf(), nombre: 'f.xml' });
  db.prepare('UPDATE importaciones SET archivo_ruta = ? WHERE id = ?').run('../../../etc/passwd', a.id);
  assert.throws(() => svc.archivo(a.id), (e) => e.codigo === 'NO_ENCONTRADO');
});
