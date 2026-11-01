'use strict';
const { ErrorApp } = require('../utils/errores');
const { diaLocal, horaLocal, limitesDelDia, sumarDias, validarDia } = require('../utils/zonaHoraria');
const estadisticasRepository = require('../repositories/estadisticasRepository');

const METODOS = ['efectivo', 'tarjeta', 'transferencia'];
const TOP = 10;
const DIAS_SERIE = 30;
const DIAS_TOP = 7;

// DEFINICIONES (la nube las repite en SQL y una prueba comprueba que den lo mismo):
//  - día = día LOCAL de la tienda; solo ventas completadas
//  - total = suma de ventas.total (ya con el descuento de mayoreo); descuentos = suma de descuento_mayoreo
//  - ticket promedio = total / ventas, redondeado al centavo (0 si no hubo ventas)
//  - por método = suma de pagos.monto (en efectivo, lo APLICADO: sin el cambio devuelto)
//  - top productos: piezas e importe de línea (precio × cantidad, ANTES del descuento global de mayoreo)
//    orden: piezas (o importe) desc, el otro desc, y producto_id asc para que el desempate sea estable
module.exports = function estadisticasService(db, { zona, corte, inventario }) {
  const repo = estadisticasRepository(db);
  const hoy = () => diaLocal(new Date(), zona);

  function resumenDia(dia) {
    const { inicio, fin } = limitesDelDia(dia, zona);
    const t = repo.totalesVentas(inicio, fin);
    const metodos = Object.fromEntries(repo.pagosPorMetodo(inicio, fin).map((p) => [p.metodo, p.monto]));
    const porHora = Array.from({ length: 24 }, (_, hora) => ({ hora, num_ventas: 0, total: 0 }));
    for (const v of repo.fechasYTotales(inicio, fin)) { const h = porHora[horaLocal(v.fecha, zona)]; h.num_ventas++; h.total += v.total; }
    return {
      num_ventas: t.n, total: t.total, subtotal: t.subtotal, descuentos: t.descuentos,
      ticket_promedio: t.n ? Math.round(t.total / t.n) : 0, piezas: repo.piezas(inicio, fin),
      por_metodo: Object.fromEntries(METODOS.map((m) => [m, metodos[m] || 0])), por_hora: porHora,
    };
  }

  function serie(hasta, dias) {
    const desde = sumarDias(hasta, -(dias - 1));
    const filas = new Map();
    for (let i = 0; i < dias; i++) filas.set(sumarDias(desde, i), { dia: sumarDias(desde, i), num_ventas: 0, total: 0 });
    for (const v of repo.fechasYTotales(limitesDelDia(desde, zona).inicio, limitesDelDia(hasta, zona).fin)) {
      const f = filas.get(diaLocal(v.fecha, zona));
      if (f) { f.num_ventas++; f.total += v.total; }
    }
    return [...filas.values()];
  }

  const corto = (dia) => { const r = resumenDia(dia); return { dia, num_ventas: r.num_ventas, total: r.total }; };

  function top(hasta) {
    const desde = sumarDias(hasta, -(DIAS_TOP - 1));
    const filas = repo.topProductos(limitesDelDia(desde, zona).inicio, limitesDelDia(hasta, zona).fin);
    const forma = (f) => ({ producto_id: f.producto_id, nombre: f.nombre, piezas: f.piezas, importe: f.importe });
    return {
      desde, hasta,
      por_piezas: [...filas].sort((a, b) => b.piezas - a.piezas || b.importe - a.importe || a.producto_id - b.producto_id).slice(0, TOP).map(forma),
      por_importe: [...filas].sort((a, b) => b.importe - a.importe || b.piezas - a.piezas || a.producto_id - b.producto_id).slice(0, TOP).map(forma),
    };
  }

  return {
    hoy,
    // Lo mismo que devuelve la función SQL estado_dueno() de la nube.
    estadoDueno(dia = hoy()) {
      if (!validarDia(dia)) throw new ErrorApp('Fecha inválida (usa AAAA-MM-DD)', { status: 400, codigo: 'VALIDACION' });
      return {
        dia, zona_horaria: zona, resumen: resumenDia(dia),
        comparativo: { ayer: corto(sumarDias(dia, -1)), semana_pasada: corto(sumarDias(dia, -7)) },
        serie: serie(dia, DIAS_SERIE), top: top(dia),
      };
    },

    // Lo que NO son ventas: caja y stock bajo. Es también lo que la caja manda a la nube en cada "latido".
    estadoNegocio() {
      const c = corte.abierto();
      let caja = { abierta: false };
      if (c) {
        const d = corte.detalle(c.id);
        caja = { abierta: true, desde: c.apertura, usuario_apertura: c.usuario_apertura, fondo_inicial: c.fondo_inicial,
          num_ventas: d.num_ventas, total_ventas: d.total_ventas, ventas_efectivo: d.ventas_efectivo, efectivo_esperado: d.efectivo_esperado };
      }
      const ultimo = corte.listar({ pagina: 1, por_pagina: 5 }).filas.find((f) => f.cierre);
      const sb = inventario.stockBajo();
      return {
        caja,
        ultimo_corte: ultimo ? { id: ultimo.id, cierre: ultimo.cierre, usuario_cierre: ultimo.usuario_cierre, efectivo_esperado: ultimo.efectivo_esperado,
          efectivo_contado: ultimo.efectivo_contado, diferencia: ultimo.diferencia, total_ventas: ultimo.total_ventas } : null,
        stock_bajo: { total: sb.total, por_nivel: sb.por_nivel,
          productos: sb.productos.slice(0, 20).map((p) => ({ nombre: p.nombre, stock: p.stock, stock_minimo: p.stock_minimo, nivel: p.nivel, faltante: p.faltante })) },
      };
    },
  };
};
