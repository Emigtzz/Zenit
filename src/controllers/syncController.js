'use strict';
module.exports = function syncController(sync) {
  return {
    // Cajero y dueño: lo necesario para el indicador de la caja. El detalle técnico del error es solo del dueño.
    estado(req, res) {
      const e = sync.estado();
      if (req.usuario.rol === 'dueño') return res.json(e);
      res.json({ configurada: e.configurada, situacion: e.situacion, ultimo_exito: e.ultimo_exito, pendientes: e.pendientes, error_tipo: e.error_tipo });
    },
    async ahora(_req, res) {
      const resultado = await sync.ciclo();
      res.json({ resultado, estado: sync.estado() });
    },
  };
};
