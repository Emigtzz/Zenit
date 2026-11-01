'use strict';
const { ErrorApp } = require('../utils/errores');

module.exports = function cajaController(caja, impresora) {
  const esDueno = (req) => req.usuario.rol === 'dueño';
  const idDe = (req) => {
    const n = Number(req.params.id);
    if (!Number.isInteger(n) || n <= 0) throw new ErrorApp('Id inválido', { status: 400, codigo: 'ID_INVALIDO' });
    return n;
  };
  // El corte se imprime en segundo plano (igual que el ticket de venta): cerrar la caja no espera a la impresora.
  // Pase lo que pase con la impresora (incluso si lanza), el cierre YA quedó guardado: nunca se convierte en error.
  const imprimir = (detalle) => {
    try { Promise.resolve(impresora.imprimirCorte(detalle)).catch((e) => console.error('[impresora] corte:', e.message)); }
    catch (e) { console.error('[impresora] corte:', e.message); }
  };

  return {
    estado(req, res) {
      const c = caja.abierto();
      if (!c) return res.json({ abierta: false, corte: null });
      res.json({
        abierta: true,
        corte: esDueno(req)
          ? { id: c.id, apertura: c.apertura, fondo_inicial: c.fondo_inicial, usuario_apertura: c.usuario_apertura }
          : { id: c.id, apertura: c.apertura, usuario_apertura: c.usuario_apertura },
      });
    },
    abrir: (req, res) => res.status(201).json(caja.abrir(req.body, req.usuario.id)),
    resumen: (req, res) => res.json(caja.resumenActual(req.usuario.rol)),
    movimiento(req, res) { caja.registrarMovimiento(req.body, req.usuario.id); res.status(201).json({ ok: true }); },
    cerrar(req, res) {
      const detalle = caja.cerrar(req.body, req.usuario.id);
      imprimir(detalle);
      res.json(detalle);
    },
    listar: (req, res) => res.json(caja.listar(req.query)),
    detalle: (req, res) => res.json(caja.detalle(idDe(req))),
    reimprimir(req, res) { imprimir(caja.detalle(idDe(req))); res.status(202).json({ estado: 'imprimiendo' }); },
  };
};
