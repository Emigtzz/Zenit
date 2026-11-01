'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const compraService = require('../src/services/compraService');
const proveedorService = require('../src/services/proveedorService');
const corteService = require('../src/services/corteService');
const ventaService = require('../src/services/ventaService');
const { crearBaseDePrueba, stockDe, contar } = require('./helpers');

const p2 = (n) => String(n).padStart(2, '0');
const dia = (offsetDias = 0) => { const d = new Date(Date.now() + offsetDias * 86400000); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const costoDe = (db, id) => db.prepare('SELECT costo FROM productos WHERE id = ?').get(id).costo;

function entorno({ cajaAbierta = true, fondo = 0 } = {}) {
  const db = crearBaseDePrueba({ cajaAbierta: false });
  db.prepare("INSERT INTO usuarios (nombre, rol, contrasena_hash) VALUES ('Ana','dueño','x')").run();
  if (cajaAbierta) corteService(db).abrir({ fondo_inicial: fondo }, 1);
  const provs = proveedorService(db);
  const a = provs.crear({ nombre: 'Distribuidora Sol', rfc: null });
  const b = provs.crear({ nombre: 'Bodega Norte', rfc: null });
  return { db, compras: compraService(db), a: a.id, b: b.id };
}
const compra = (e, extra = {}) => ({ proveedor_id: e.a, folio_factura: 'F-1', items: [{ producto_id: 1, cantidad: 12, costo_unitario: 1100 }], ...extra });
const codigo = (fn) => { try { fn(); return null; } catch (x) { return x.codigo; } };

test('compra: suma stock, genera kárdex tipo "compra" y actualiza el costo', () => {
  const e = entorno();
  assert.equal(costoDe(e.db, 1), 1000);
  const r = e.compras.registrar(compra(e, { items: [{ producto_id: 1, cantidad: 12, costo_unitario: 1100 }, { producto_id: 2, cantidad: 6, costo_unitario: 480 }] }), { usuarioId: 1 });
  assert.equal(r.compra.total, 12 * 1100 + 6 * 480);
  assert.equal(r.compra.usuario_nombre, 'Ana');
  assert.equal(r.compra.estado, 'registrada');
  assert.equal(stockDe(e.db, 1), 22);
  assert.equal(stockDe(e.db, 2), 11);
  assert.equal(costoDe(e.db, 1), 1100);
  assert.equal(costoDe(e.db, 2), 480);
  const mov = e.db.prepare("SELECT tipo, cantidad, referencia, nota, usuario_id FROM movimientos_inventario WHERE tipo = 'compra' ORDER BY id").all();
  assert.deepEqual(mov, [
    { tipo: 'compra', cantidad: 12, referencia: `compra:${r.compra.id}`, nota: 'Factura F-1', usuario_id: 1 },
    { tipo: 'compra', cantidad: 6, referencia: `compra:${r.compra.id}`, nota: 'Factura F-1', usuario_id: 1 },
  ]);
  assert.deepEqual(r.cambios_costo.map((c) => [c.producto_id, c.costo_anterior, c.costo_nuevo]), [[1, 1000, 1100], [2, 500, 480]]);
});

test('el stock negativo se compensa: comprar sobre un faltante deja el neto correcto', () => {
  const e = entorno();
  e.db.prepare('UPDATE productos SET stock = -2 WHERE id = 3').run();
  e.compras.registrar(compra(e, { items: [{ producto_id: 3, cantidad: 10, costo_unitario: 400 }] }));
  assert.equal(stockDe(e.db, 3), 8);
});

test('advertencia cuando el nuevo costo iguala o supera el precio de venta', () => {
  const e = entorno();
  const r = e.compras.registrar(compra(e, { items: [{ producto_id: 2, cantidad: 3, costo_unitario: 1300 }] })); // precio 1200
  assert.equal(r.advertencias.length, 1);
  assert.equal(r.advertencias[0].nombre, 'Galletas');
  assert.equal(r.cambios_costo[0].margen_negativo, true);
});

test('el costo es el de la compra más reciente POR FECHA: una factura atrasada no lo pisa', () => {
  const e = entorno();
  e.compras.registrar(compra(e, { folio_factura: 'HOY', fecha: dia(0), items: [{ producto_id: 1, cantidad: 5, costo_unitario: 1500 }] }));
  assert.equal(costoDe(e.db, 1), 1500);
  // se captura DESPUÉS una factura de hace 10 días con otro costo
  const r = e.compras.registrar(compra(e, { folio_factura: 'VIEJA', fecha: dia(-10), items: [{ producto_id: 1, cantidad: 5, costo_unitario: 900 }] }));
  assert.equal(costoDe(e.db, 1), 1500);          // sigue el de hoy
  assert.equal(stockDe(e.db, 1), 20);            // pero el stock sí entró
  assert.deepEqual(r.cambios_costo, []);
});

test('una factura de ayer posterior a otra más vieja sí actualiza el costo', () => {
  const e = entorno();
  e.compras.registrar(compra(e, { folio_factura: 'A', fecha: dia(-10), items: [{ producto_id: 1, cantidad: 1, costo_unitario: 900 }] }));
  e.compras.registrar(compra(e, { folio_factura: 'B', fecha: dia(-2), items: [{ producto_id: 1, cantidad: 1, costo_unitario: 1200 }] }));
  assert.equal(costoDe(e.db, 1), 1200);
});

test('fecha futura se rechaza', () => {
  const e = entorno();
  assert.equal(codigo(() => e.compras.registrar(compra(e, { fecha: dia(1) }))), 'FECHA_FUTURA');
  assert.equal(contar(e.db, 'compras'), 0);
});

test('folio duplicado del mismo proveedor se rechaza; otro proveedor o sin folio sí', () => {
  const e = entorno();
  e.compras.registrar(compra(e));
  assert.equal(codigo(() => e.compras.registrar(compra(e))), 'FOLIO_DUPLICADO');
  assert.doesNotThrow(() => e.compras.registrar(compra(e, { proveedor_id: e.b })));           // mismo folio, otro proveedor
  assert.doesNotThrow(() => e.compras.registrar(compra(e, { folio_factura: null })));
  assert.doesNotThrow(() => e.compras.registrar(compra(e, { folio_factura: null })));         // varias sin folio
  assert.equal(stockDe(e.db, 1), 10 + 12 * 3 + 12);
});

test('validaciones: proveedor/producto inexistente o desactivado, producto repetido', () => {
  const e = entorno();
  assert.equal(codigo(() => e.compras.registrar(compra(e, { proveedor_id: 99 }))), 'PROVEEDOR_INVALIDO');
  e.db.prepare('UPDATE proveedores SET activo = 0 WHERE id = ?').run(e.b);
  assert.equal(codigo(() => e.compras.registrar(compra(e, { proveedor_id: e.b }))), 'PROVEEDOR_INVALIDO');
  assert.equal(codigo(() => e.compras.registrar(compra(e, { items: [{ producto_id: 99, cantidad: 1, costo_unitario: 100 }] }))), 'PRODUCTO_INVALIDO');
  e.db.prepare('UPDATE productos SET activo = 0 WHERE id = 2').run();
  assert.equal(codigo(() => e.compras.registrar(compra(e, { items: [{ producto_id: 2, cantidad: 1, costo_unitario: 100 }] }))), 'PRODUCTO_INVALIDO');
  assert.equal(codigo(() => e.compras.registrar(compra(e, { items: [{ producto_id: 1, cantidad: 1, costo_unitario: 100 }, { producto_id: 1, cantidad: 2, costo_unitario: 100 }] }))), 'PRODUCTO_REPETIDO');
  assert.equal(contar(e.db, 'compras'), 0);
});

test('REVERSIÓN: si falla a la mitad no queda compra, kárdex, stock ni cambio de costo', () => {
  const e = entorno();
  // sabotaje: el movimiento de la 2ª línea falla, DESPUÉS de haber guardado y descontado la 1ª
  e.db.exec(`CREATE TRIGGER falla BEFORE INSERT ON movimientos_inventario WHEN NEW.producto_id = 2 BEGIN SELECT RAISE(ABORT, 'fallo simulado'); END;`);
  assert.throws(() => e.compras.registrar(compra(e, { items: [{ producto_id: 1, cantidad: 5, costo_unitario: 2000 }, { producto_id: 2, cantidad: 5, costo_unitario: 600 }] })), /fallo simulado/);
  for (const t of ['compras', 'compra_detalle']) assert.equal(contar(e.db, t), 0, t);
  assert.equal(e.db.prepare("SELECT COUNT(*) n FROM movimientos_inventario WHERE tipo = 'compra'").get().n, 0);
  assert.equal(stockDe(e.db, 1), 10);
  assert.equal(costoDe(e.db, 1), 1000);
});

test('pagar de caja: registra el retiro en el corte y baja el efectivo esperado', () => {
  const e = entorno({ fondo: 100000 });
  const caja = corteService(e.db);
  const r = e.compras.registrar(compra(e, { pagar_de_caja: true }), { usuarioId: 1 }); // 13200
  assert.equal(r.compra.pagada_de_caja, 1);
  const d = caja.detalle(caja.abierto().id);
  assert.equal(d.retiros, 13200);
  assert.equal(d.efectivo_esperado, 100000 - 13200);
  assert.match(d.movimientos[0].motivo, /Compra #\d+ Distribuidora Sol/);
});

test('pagar de caja con la caja cerrada o sin efectivo suficiente deshace TODA la compra', () => {
  const cerrada = entorno({ cajaAbierta: false });
  assert.equal(codigo(() => cerrada.compras.registrar(compra(cerrada, { pagar_de_caja: true }))), 'CAJA_CERRADA');
  assert.equal(contar(cerrada.db, 'compras'), 0);
  assert.equal(stockDe(cerrada.db, 1), 10);
  assert.equal(costoDe(cerrada.db, 1), 1000);

  const pobre = entorno({ fondo: 5000 });
  assert.equal(codigo(() => pobre.compras.registrar(compra(pobre, { pagar_de_caja: true }))), 'RETIRO_EXCEDE_EFECTIVO');
  assert.equal(contar(pobre.db, 'compras'), 0);
  assert.equal(stockDe(pobre.db, 1), 10);
  assert.equal(costoDe(pobre.db, 1), 1000);
});

test('sin pagar de caja no se necesita caja abierta', () => {
  const e = entorno({ cajaAbierta: false });
  assert.doesNotThrow(() => e.compras.registrar(compra(e)));
});

test('anular: revierte stock con kárdex "cancelacion", marca la compra y devuelve el costo anterior', () => {
  const e = entorno();
  e.compras.registrar(compra(e, { folio_factura: 'A', fecha: dia(-5), items: [{ producto_id: 1, cantidad: 10, costo_unitario: 900 }] }));
  const b = e.compras.registrar(compra(e, { folio_factura: 'B', items: [{ producto_id: 1, cantidad: 4, costo_unitario: 1400 }] }));
  assert.equal(costoDe(e.db, 1), 1400);
  assert.equal(stockDe(e.db, 1), 24);
  const r = e.compras.anular(b.compra.id, { motivo: 'Factura capturada con precio equivocado' }, { usuarioId: 1 });
  assert.equal(r.compra.estado, 'anulada');
  assert.equal(r.compra.anulada_por_nombre, 'Ana');
  assert.equal(stockDe(e.db, 1), 20);
  assert.equal(costoDe(e.db, 1), 900);            // vuelve al de la compra anterior
  const m = e.db.prepare("SELECT cantidad, nota FROM movimientos_inventario WHERE tipo = 'cancelacion'").get();
  assert.equal(m.cantidad, -4);
  assert.match(m.nota, /precio equivocado/);
  assert.equal(codigo(() => e.compras.anular(b.compra.id, { motivo: 'otra vez' })), 'YA_ANULADA');
});

test('anular libera el folio para volver a capturar la factura correcta', () => {
  const e = entorno();
  const r = e.compras.registrar(compra(e));
  e.compras.anular(r.compra.id, { motivo: 'error de captura' });
  assert.doesNotThrow(() => e.compras.registrar(compra(e, { items: [{ producto_id: 1, cantidad: 12, costo_unitario: 1050 }] })));
  assert.equal(costoDe(e.db, 1), 1050);
});

test('anular una compra única deja el costo como estaba (no hay otra compra de referencia)', () => {
  const e = entorno();
  const r = e.compras.registrar(compra(e)); // costo 1000 -> 1100
  e.compras.anular(r.compra.id, { motivo: 'error' });
  assert.equal(costoDe(e.db, 1), 1100); // sin compra vigente se respeta el costo actual; el dueño puede corregirlo en el catálogo
});

test('anular se bloquea si lo comprado ya se vendió (stock insuficiente) y no cambia nada', () => {
  const e = entorno();
  const r = e.compras.registrar(compra(e, { items: [{ producto_id: 3, cantidad: 2, costo_unitario: 300 }] })); // stock 3 -> 5
  ventaService(e.db).crear({ items: [{ producto_id: 3, cantidad: 4 }], pagos: [{ metodo: 'efectivo', monto: 10000 }], mayoreo: false }, { usuarioId: 1 }); // queda 1
  assert.equal(codigo(() => e.compras.anular(r.compra.id, { motivo: 'error' })), 'STOCK_INSUFICIENTE');
  assert.equal(stockDe(e.db, 3), 1);
  assert.equal(e.compras.obtener(r.compra.id).estado, 'registrada');
});

test('listar: filtra por proveedor/estado/fechas, más reciente primero; historial de costos por producto', () => {
  const e = entorno();
  e.compras.registrar(compra(e, { folio_factura: '1', fecha: dia(-3) }));
  e.compras.registrar(compra(e, { folio_factura: '2', proveedor_id: e.b }));
  const x = e.compras.registrar(compra(e, { folio_factura: '3', fecha: dia(-1) }));
  e.compras.anular(x.compra.id, { motivo: 'error' });
  assert.equal(e.compras.listar({}).total, 3);
  assert.deepEqual(e.compras.listar({ proveedor_id: e.b }).filas.map((c) => c.folio_factura), ['2']);
  assert.deepEqual(e.compras.listar({ estado: 'anulada' }).filas.map((c) => c.folio_factura), ['3']);
  assert.deepEqual(e.compras.listar({ desde: dia(-2), hasta: dia(0) }).filas.map((c) => c.folio_factura), ['2', '3']);
  assert.equal(e.compras.historialProducto(1).length, 2); // la anulada no cuenta
});

test('proveedores: nombre único sin distinguir mayúsculas; actualizar y desactivar', () => {
  const { db } = entorno();
  const svc = proveedorService(db);
  assert.equal(codigo(() => svc.crear({ nombre: 'distribuidora sol', rfc: null })), 'NOMBRE_DUPLICADO');
  const p = svc.crear({ nombre: 'Nuevo', rfc: 'ABC010101AB1' });
  assert.equal(svc.actualizar(p.id, { nombre: 'Nuevo SA', rfc: 'ABC010101AB1', activo: false }).activo, 0);
  assert.equal(svc.listar().some((x) => x.id === p.id), false);
  assert.equal(svc.listar({ soloActivos: false }).some((x) => x.id === p.id), true);
  assert.equal(codigo(() => svc.actualizar(999, { nombre: 'x', rfc: null, activo: true })), 'NO_ENCONTRADO');
});

test('la compra desaparece de stock bajo: reponer saca al producto de la lista', () => {
  const e = entorno();
  e.db.prepare('UPDATE productos SET stock = 1, stock_minimo = 5 WHERE id = 1').run();
  const inv = require('../src/services/inventarioService')(e.db);
  assert.equal(inv.stockBajo().total, 1);
  e.compras.registrar(compra(e));
  assert.equal(inv.stockBajo().total, 0);
});
