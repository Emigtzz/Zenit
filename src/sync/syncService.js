'use strict';
const { construirLote, contarPendientes, marcarSubido } = require('./payload');
const { ErrorNube, MENSAJES } = require('./errores');

const MAX_LOTES_POR_CICLO = 50;        // 50 × 200 = 10,000 ventas por ciclo; si hay más, sigue en el siguiente
const ESPERA_MAXIMA_MS = 10 * 60 * 1000;

// Espera entre intentos: la normal si todo va bien; si falla, se duplica (1×, 2×, 4×…) hasta un máximo de 10 min,
// para no martillar un servidor caído ni gastar la batería/datos cuando no hay internet.
function esperaMs(intervaloMs, fallos) {
  return fallos <= 0 ? intervaloMs : Math.min(ESPERA_MAXIMA_MS, intervaloMs * 2 ** Math.min(fallos, 10));
}

// `nube` = adaptador con { subir({ instalacion_id, lote, cortes, estado }) }. Es null si la sincronización no está configurada.
// REGLA DE ORO: nada de aquí puede frenar ni hacer fallar un cobro. Todo corre aparte y los errores se guardan, no se lanzan.
module.exports = function syncService(db, { nube, estadisticas, version = 'dev', intervaloSeg = 60, ahora = () => new Date(), programar = setTimeout, cancelar = clearTimeout, log = console.log }) {
  let enCurso = false;
  let temporizador = null;
  let detenido = true;

  const fila = () => db.prepare('SELECT * FROM sync_estado WHERE id = 1').get();
  const guardar = (campos) => {
    const cols = Object.keys(campos).map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE sync_estado SET ${cols} WHERE id = 1`).run(campos);
  };

  async function ciclo() {
    if (!nube) return { estado: 'no_configurado' };
    if (enCurso) return { estado: 'en_curso' };        // nunca dos ciclos a la vez
    enCurso = true;
    guardar({ ultimo_intento: ahora().toISOString() });
    let subidas = 0;
    try {
      const instalacion_id = fila().instalacion_id;
      const estado = { ...estadisticas.estadoNegocio(), version };
      for (let i = 0; i < MAX_LOTES_POR_CICLO; i++) {
        const lote = construirLote(db);
        const hayAlgo = lote.ventas.length || lote.cortes.length;
        if (!hayAlgo && i > 0) break;                  // ya se subió todo; el latido ya salió en el lote anterior
        // Cada lote lleva el "latido": así, aunque no haya ventas, la nube sabe que la caja sigue conectada.
        await nube.subir({ instalacion_id, lote: { ventas: lote.ventas, detalle: lote.detalle, pagos: lote.pagos }, cortes: lote.cortes, estado });
        marcarSubido(db, lote._marcas);                // solo después de que la nube confirmó
        subidas += lote.ventas.length;
        if (!hayAlgo || lote.ventas.length < 200) break;
      }
      guardar({ ultimo_exito: ahora().toISOString(), ultimo_error: null, error_tipo: null, intentos_fallidos: 0, ventas_subidas: fila().ventas_subidas + subidas });
      return { estado: 'ok', ventas_subidas: subidas };
    } catch (e) {
      const tipo = e instanceof ErrorNube ? e.tipo : 'servidor';
      const mensaje = e instanceof ErrorNube ? e.message : MENSAJES.servidor;
      guardar({ ultimo_error: mensaje, error_tipo: tipo, intentos_fallidos: fila().intentos_fallidos + 1 });
      if (!(e instanceof ErrorNube)) log('[sync] error inesperado:', e.message);
      return { estado: 'error', tipo, mensaje };
    } finally { enCurso = false; }
  }

  function agendar() {
    if (detenido) return;
    const espera = esperaMs(intervaloSeg * 1000, fila().intentos_fallidos);
    temporizador = programar(async () => { await ciclo(); agendar(); }, espera);
    if (temporizador && typeof temporizador.unref === 'function') temporizador.unref(); // no impide que el proceso termine
  }

  return {
    ciclo,
    esperaMs,
    configurada: () => Boolean(nube),
    iniciar({ primerRetrasoMs = 5000 } = {}) {
      if (!nube || !detenido) return;
      detenido = false;
      temporizador = programar(async () => { await ciclo(); agendar(); }, primerRetrasoMs);
      if (temporizador && typeof temporizador.unref === 'function') temporizador.unref();
    },
    detener() { detenido = true; if (temporizador) cancelar(temporizador); temporizador = null; },

    estado() {
      const f = fila();
      const pendientes = contarPendientes(db);
      return {
        configurada: Boolean(nube), sincronizando: enCurso, instalacion_id: f.instalacion_id,
        ultimo_intento: f.ultimo_intento, ultimo_exito: f.ultimo_exito, ultimo_error: f.ultimo_error, error_tipo: f.error_tipo,
        intentos_fallidos: f.intentos_fallidos, ventas_subidas: f.ventas_subidas, pendientes,
        // resumen para el indicador de la caja: ok | pendiente | error | no_configurada
        situacion: !nube ? 'no_configurada' : f.error_tipo ? 'error' : (pendientes.ventas + pendientes.cortes > 0 ? 'pendiente' : 'ok'),
      };
    },
  };
};
