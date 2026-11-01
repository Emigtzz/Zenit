'use strict';
const { ErrorApp } = require('../utils/errores');
const corteRepository = require('../repositories/corteRepository');

const ahoraIso = () => new Date().toISOString();

module.exports = function corteService(db) {
  const cortes = corteRepository(db);

  // Todo lo que se sabe de un turno, calculado desde las ventas y movimientos (la fuente de verdad).
  //   efectivo_esperado = fondo inicial + efectivo cobrado en ventas + ingresos - retiros
  // Tarjeta y transferencia NO entran: ese dinero no está en el cajón.
  function calcular(corte) {
    const t = cortes.totalesVentas(corte.id);
    const m = Object.fromEntries(cortes.pagosPorMetodo(corte.id).map((p) => [p.metodo, p.monto]));
    const mov = Object.fromEntries(cortes.sumaMovimientos(corte.id).map((x) => [x.tipo, x.monto]));
    const ef = m.efectivo || 0, ingresos = mov.ingreso || 0, retiros = mov.retiro || 0;
    const efectivoPorCajero = new Map(cortes.efectivoPorCajero(corte.id).map((x) => [x.usuario_id, x.efectivo]));
    return {
      num_ventas: t.n, total_ventas: t.total, subtotal: t.subtotal, descuentos: t.descuentos,
      ventas_efectivo: ef, ventas_tarjeta: m.tarjeta || 0, ventas_transferencia: m.transferencia || 0,
      ingresos, retiros,
      efectivo_esperado: corte.fondo_inicial + ef + ingresos - retiros,
      por_cajero: cortes.ventasPorCajero(corte.id).map((c) => ({ ...c, efectivo: efectivoPorCajero.get(c.usuario_id) || 0 })),
      movimientos: cortes.movimientos(corte.id),
    };
  }

  const cerradoPrevio = () => new ErrorApp('La caja está cerrada. Ábrela para continuar', { status: 409, codigo: 'CAJA_CERRADA' });

  return {
    abierto: () => cortes.abierto() || null,

    abrir({ fondo_inicial }, usuarioId) {
      const crear = db.transaction(() => {
        if (cortes.abierto()) throw new ErrorApp('La caja ya está abierta', { status: 409, codigo: 'CAJA_YA_ABIERTA' });
        return cortes.abrir({ fecha: ahoraIso(), fondo: fondo_inicial, usuarioId });
      });
      return cortes.obtener(crear());
    },

    // Resumen del turno ABIERTO. El cajero NO recibe los montos de efectivo: así el conteo es "ciego" y no se
    // puede "cuadrar" a ojo. Solo el dueño ve el desglose completo antes de cerrar.
    resumenActual(rol) {
      const corte = cortes.abierto();
      if (!corte) throw cerradoPrevio();
      const r = calcular(corte);
      if (rol === 'dueño') return { corte, ...r };
      return { corte: { id: corte.id, apertura: corte.apertura }, num_ventas: r.num_ventas };
    },

    registrarMovimiento({ tipo, monto, motivo }, usuarioId) {
      const hacer = db.transaction(() => {
        const corte = cortes.abierto();
        if (!corte) throw cerradoPrevio();
        // No se puede sacar más efectivo del que debe haber en el cajón.
        if (tipo === 'retiro') {
          const disponible = calcular(corte).efectivo_esperado;
          if (monto > disponible) {
            throw new ErrorApp('No hay tanto efectivo en la caja para ese retiro', { status: 422, codigo: 'RETIRO_EXCEDE_EFECTIVO' });
          }
        }
        return cortes.insertarMovimiento({ corte_id: corte.id, tipo, monto, motivo, fecha: ahoraIso(), usuario_id: usuarioId });
      });
      hacer();
      return { ok: true };
    },

    cerrar({ efectivo_contado, notas }, usuarioId) {
      const hacer = db.transaction(() => {
        const corte = cortes.abierto();
        if (!corte) throw cerradoPrevio();
        const r = calcular(corte);
        cortes.cerrar(corte.id, {
          cierre: ahoraIso(), usuario_cierre_id: usuarioId, notas: notas || null,
          efectivo_esperado: r.efectivo_esperado, efectivo_contado,
          diferencia: efectivo_contado - r.efectivo_esperado, // + sobra, - falta
          num_ventas: r.num_ventas, total_ventas: r.total_ventas, descuentos: r.descuentos,
          ventas_efectivo: r.ventas_efectivo, ventas_tarjeta: r.ventas_tarjeta, ventas_transferencia: r.ventas_transferencia,
          ingresos: r.ingresos, retiros: r.retiros,
        });
        return corte.id;
      });
      return this.detalle(hacer());
    },

    detalle(id) {
      const corte = cortes.obtener(id);
      if (!corte) throw new ErrorApp('Corte no encontrado', { status: 404, codigo: 'NO_ENCONTRADO' });
      const r = calcular(corte);
      return { corte, ...r, efectivo_esperado: corte.cierre ? corte.efectivo_esperado : r.efectivo_esperado };
    },

    listar({ pagina = 1, por_pagina = 30 }) {
      const { total, filas } = cortes.listar({ limite: por_pagina, desplazamiento: (pagina - 1) * por_pagina });
      return { total, pagina, por_pagina, filas };
    },
  };
};
