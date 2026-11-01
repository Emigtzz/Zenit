'use strict';
module.exports = function estadisticasController(estadisticas) {
  return {
    // Ventas (por día local de la tienda) + estado de caja y stock bajo, en una sola respuesta.
    resumen: (req, res) => res.json({ ...estadisticas.estadoDueno(req.query.dia), negocio: estadisticas.estadoNegocio(), hoy: estadisticas.hoy() }),
  };
};
