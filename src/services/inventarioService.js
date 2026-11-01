'use strict';
const { ErrorApp } = require('../utils/errores');
const inventarioRepository = require('../repositories/inventarioRepository');
const productoRepository = require('../repositories/productoRepository');

// Catálogo CERRADO de motivos: permite reportar después ("merma del mes") sin texto libre inconsistente.
const MOTIVOS = [
  { id: 'conteo_fisico', nombre: 'Conteo físico / inventario' },
  { id: 'merma', nombre: 'Merma' },
  { id: 'caducado', nombre: 'Caducado' },
  { id: 'danio', nombre: 'Dañado / roto' },
  { id: 'robo_extravio', nombre: 'Robo o extravío' },
  { id: 'devolucion_proveedor', nombre: 'Devolución a proveedor' },
  { id: 'error_captura', nombre: 'Corrección de error de captura' },
  { id: 'otro', nombre: 'Otro (explicar en la nota)' },
];
const ID_MOTIVOS = MOTIVOS.map((m) => m.id);

module.exports = function inventarioService(db) {
  const inventario = inventarioRepository(db);
  const productos = productoRepository(db);

  // Leer el stock, escribir el movimiento y actualizar el stock van en UNA transacción:
  // si dos ajustes llegaran a la vez, o algo fallara a la mitad, el stock nunca queda sin su movimiento.
  const ejecutar = db.transaction(({ producto_id, modo, cantidad, motivo, nota }) => {
    const prod = productos.obtener(producto_id);
    if (!prod) throw new ErrorApp('El producto no existe', { status: 404, codigo: 'NO_ENCONTRADO' });

    // entrada = suma | salida = resta | conteo = "lo que contaste": el sistema calcula la diferencia.
    const delta = modo === 'entrada' ? cantidad : modo === 'salida' ? -cantidad : cantidad - prod.stock;
    if (delta === 0) {
      throw new ErrorApp('El conteo coincide con el sistema: no hay nada que ajustar', { status: 422, codigo: 'SIN_DIFERENCIA' });
    }
    const nuevo = prod.stock + delta;
    if (modo === 'salida' && nuevo < 0) {
      throw new ErrorApp(`No puedes sacar ${cantidad}: solo hay ${prod.stock}. Si el stock está mal, usa un conteo físico.`, {
        status: 422, codigo: 'STOCK_INSUFICIENTE', detalles: { stock: prod.stock },
      });
    }

    const id = inventario.insertarMovimiento({
      producto_id, tipo: 'ajuste', cantidad: delta, referencia: `ajuste:${modo}`,
      motivo, nota: nota || null, fecha: new Date().toISOString(),
      usuario_id: null, // fase 2 (usuarios): quién hizo el ajuste
    });
    productos.ajustarStock(producto_id, delta);
    return { movimiento_id: id, producto_id, nombre: prod.nombre, stock_anterior: prod.stock, diferencia: delta, stock_nuevo: nuevo };
  });

  return {
    motivos: () => MOTIVOS,
    ajustar(entrada) {
      if (entrada.motivo === 'otro' && !(entrada.nota && entrada.nota.trim().length >= 3)) {
        throw new ErrorApp('Con el motivo "Otro" debes explicar en la nota', { status: 422, codigo: 'NOTA_REQUERIDA' });
      }
      return ejecutar(entrada);
    },
    kardex({ producto_id, tipo, desde, hasta, pagina = 1, por_pagina = 50 }) {
      // Los días vienen como "2026-11-01" en HORA LOCAL de la tienda; las fechas se guardan en UTC.
      const inicio = desde ? new Date(`${desde}T00:00:00`).toISOString() : undefined;
      const finExclusivo = hasta ? new Date(new Date(`${hasta}T00:00:00`).getTime() + 86400000).toISOString() : undefined;
      const { total, filas } = inventario.kardex({
        productoId: producto_id, tipo, desde: inicio, hasta: finExclusivo,
        limite: por_pagina, desplazamiento: (pagina - 1) * por_pagina,
      });
      return { total, pagina, por_pagina, filas };
    },
    verificar: () => inventario.inconsistencias(),
  };
};
module.exports.ID_MOTIVOS = ID_MOTIVOS;
