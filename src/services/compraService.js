'use strict';
const { ErrorApp } = require('../utils/errores');
const compraRepository = require('../repositories/compraRepository');
const proveedorRepository = require('../repositories/proveedorRepository');
const productoRepository = require('../repositories/productoRepository');
const inventarioRepository = require('../repositories/inventarioRepository');
const corteService = require('./corteService');

const p2 = (n) => String(n).padStart(2, '0');
const diaLocal = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

// "AAAA-MM-DD" (día de la factura) -> ISO. Hoy = ahora mismo; un día pasado = mediodía local (evita saltos de zona horaria).
function fechaDeCompra(dia) {
  const hoy = new Date();
  if (!dia || dia === diaLocal(hoy)) return hoy.toISOString();
  if (dia > diaLocal(hoy)) throw new ErrorApp('La fecha de la compra no puede ser futura', { status: 422, codigo: 'FECHA_FUTURA' });
  return new Date(`${dia}T12:00:00`).toISOString();
}

module.exports = function compraService(db, busqueda) {
  const compras = compraRepository(db);
  const proveedores = proveedorRepository(db);
  const productos = productoRepository(db);
  const inventario = inventarioRepository(db);
  const caja = corteService(db);

  // Recalcula el costo del producto desde su compra vigente. Si no queda ninguna compra, se respeta el costo actual.
  function sincronizarCosto(productoId) {
    const prod = productos.obtener(productoId);
    const vigente = compras.ultimoCosto(productoId);
    if (vigente !== null && vigente !== prod.costo) productos.fijarCosto(productoId, vigente);
    return { producto_id: productoId, nombre: prod.nombre, costo_anterior: prod.costo, costo_nuevo: vigente ?? prod.costo, precio: prod.precio };
  }
  const resumenCambio = (c) => ({ ...c, margen_negativo: c.precio <= c.costo_nuevo });

  // Toda la compra en UNA transacción: compra + detalle + kárdex + stock + costo (+ retiro de caja si se pagó de ahí).
  const ejecutar = db.transaction((e, usuarioId) => {
    const prov = proveedores.obtener(e.proveedor_id);
    if (!prov || !prov.activo) throw new ErrorApp('El proveedor no existe o está desactivado', { status: 422, codigo: 'PROVEEDOR_INVALIDO' });
    if (e.folio_factura && compras.folioRegistrado(e.proveedor_id, e.folio_factura)) {
      throw new ErrorApp(`La factura ${e.folio_factura} de ${prov.nombre} ya está registrada`, { status: 409, codigo: 'FOLIO_DUPLICADO' });
    }
    const vistos = new Set();
    for (const it of e.items) {
      if (vistos.has(it.producto_id)) throw new ErrorApp('Un producto aparece dos veces; junta las piezas en una sola línea', { status: 422, codigo: 'PRODUCTO_REPETIDO' });
      vistos.add(it.producto_id);
      const prod = productos.obtener(it.producto_id);
      if (!prod || !prod.activo) throw new ErrorApp(`El producto ${it.producto_id} no existe o está desactivado`, { status: 422, codigo: 'PRODUCTO_INVALIDO', detalles: { producto_id: it.producto_id } });
    }

    const fecha = fechaDeCompra(e.fecha);
    const total = e.items.reduce((s, it) => s + it.cantidad * it.costo_unitario, 0);
    const id = compras.insertar({ proveedor_id: e.proveedor_id, folio_factura: e.folio_factura, fecha, total, usuario_id: usuarioId, notas: e.notas, pagada_de_caja: e.pagar_de_caja ? 1 : 0 });
    for (const it of e.items) {
      compras.insertarDetalle(id, it);
      inventario.insertarMovimiento({ producto_id: it.producto_id, tipo: 'compra', cantidad: it.cantidad, referencia: `compra:${id}`,
        motivo: null, nota: e.folio_factura ? `Factura ${e.folio_factura}` : null, fecha, usuario_id: usuarioId });
      productos.ajustarStock(it.producto_id, it.cantidad);
    }
    const cambios = e.items.map((it) => sincronizarCosto(it.producto_id));
    // Pagada con efectivo del cajón: se registra el retiro en el corte abierto (si no hay caja o no alcanza, TODO se deshace).
    if (e.pagar_de_caja) {
      caja.registrarMovimiento({ tipo: 'retiro', monto: total, motivo: `Compra #${id} ${prov.nombre}`.slice(0, 120) }, usuarioId);
    }
    return { id, cambios };
  });

  const anularTx = db.transaction((id, { motivo }, usuarioId) => {
    const c = compras.obtener(id);
    if (!c) throw new ErrorApp('Compra no encontrada', { status: 404, codigo: 'NO_ENCONTRADO' });
    if (c.estado === 'anulada') throw new ErrorApp('La compra ya estaba anulada', { status: 409, codigo: 'YA_ANULADA' });
    // No se puede "des-comprar" lo que ya se vendió: el stock quedaría negativo. Primero se corrige con un conteo.
    for (const d of c.detalle) {
      const prod = productos.obtener(d.producto_id);
      if (prod.stock < d.cantidad) {
        throw new ErrorApp(`No se puede anular: de "${prod.nombre}" quedan ${prod.stock} y la compra trajo ${d.cantidad}. Corrige antes con un conteo físico.`,
          { status: 422, codigo: 'STOCK_INSUFICIENTE', detalles: { producto_id: prod.id, stock: prod.stock } });
      }
    }
    const iso = new Date().toISOString();
    for (const d of c.detalle) {
      inventario.insertarMovimiento({ producto_id: d.producto_id, tipo: 'cancelacion', cantidad: -d.cantidad, referencia: `compra:${id}`,
        motivo: null, nota: `Anulación: ${motivo}`, fecha: iso, usuario_id: usuarioId });
      productos.ajustarStock(d.producto_id, -d.cantidad);
    }
    compras.marcarAnulada(id, { iso, usuarioId, motivo });
    return c.detalle.map((d) => sincronizarCosto(d.producto_id)); // el costo regresa al de la compra anterior
  });

  return {
    registrar(entrada, { usuarioId = null } = {}) {
      const { id, cambios } = ejecutar(entrada, usuarioId);
      busqueda?.invalidar(); // el índice de búsqueda guarda el costo
      return { compra: compras.obtener(id), cambios_costo: cambios.filter((c) => c.costo_anterior !== c.costo_nuevo).map(resumenCambio),
        advertencias: cambios.filter((c) => c.precio <= c.costo_nuevo).map((c) => ({ producto_id: c.producto_id, nombre: c.nombre, costo: c.costo_nuevo, precio: c.precio })) };
    },
    anular(id, datos, { usuarioId = null } = {}) {
      const cambios = anularTx(id, datos, usuarioId);
      busqueda?.invalidar();
      return { compra: compras.obtener(id), cambios_costo: cambios.filter((c) => c.costo_anterior !== c.costo_nuevo) };
    },
    obtener(id) {
      const c = compras.obtener(id);
      if (!c) throw new ErrorApp('Compra no encontrada', { status: 404, codigo: 'NO_ENCONTRADO' });
      return c;
    },
    listar({ proveedor_id, estado, desde, hasta, pagina = 1, por_pagina = 30 }) {
      const inicio = desde ? new Date(`${desde}T00:00:00`).toISOString() : undefined;
      const fin = hasta ? new Date(new Date(`${hasta}T00:00:00`).getTime() + 86400000).toISOString() : undefined;
      const r = compras.listar({ proveedorId: proveedor_id, estado, desde: inicio, hasta: fin, limite: por_pagina, desplazamiento: (pagina - 1) * por_pagina });
      return { ...r, pagina, por_pagina };
    },
    historialProducto: (id) => compras.historialProducto(id),
  };
};
