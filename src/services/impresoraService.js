'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { ThermalPrinter, PrinterTypes, CharacterSet } = require('node-thermal-printer');
const { construirDocumento, aTexto, aEscPos, huboEfectivo } = require('./ticketService');

// Orquesta la impresión según PRINTER_MODE:
//   console -> escribe el ticket en la terminal      (simulación)
//   file    -> lo guarda en data/tickets/ticket-N.txt (simulación)
//   real    -> manda bytes ESC/POS a la impresora
// REGLA: la venta ya está guardada. Si imprimir falla, NO se revierte; se informa el error y se puede reimprimir.
module.exports = function impresoraService(config, { log = console.log } = {}) {
  const { impresora, negocio } = config;

  async function enviarReal(buffer) {
    const destino = impresora.interfaz;
    if (!destino) throw new Error('PRINTER_INTERFACE vacío: indica tcp://IP o share:\\\\localhost\\NombreCompartido');
    if (destino.startsWith('share:')) {
      // Windows + impresora USB: se comparte la impresora y se copia el archivo binario a ese recurso (copy /b).
      const recurso = destino.slice('share:'.length);
      const tmp = path.join(os.tmpdir(), `zenit-ticket-${Date.now()}.bin`);
      fs.writeFileSync(tmp, buffer);
      await new Promise((resolve, reject) => {
        execFile('cmd.exe', ['/c', 'copy', '/b', tmp, recurso], (err) => {
          fs.rm(tmp, { force: true }, () => {});
          err ? reject(err) : resolve();
        });
      });
      return;
    }
    // tcp://IP para impresoras de red
    const imp = new ThermalPrinter({ type: PrinterTypes.EPSON, interface: destino, characterSet: CharacterSet.PC858_EURO });
    imp.setBuffer(buffer);
    await imp.execute();
  }

  return {
    async imprimirVenta(venta) {
      const abrirCajon = huboEfectivo(venta); // el cajón se abre SOLO si hubo efectivo
      const doc = construirDocumento(venta, negocio, impresora.columnas);
      const resultado = { modo: impresora.modo, impreso: false, cajon_abierto: false, error: null };
      try {
        if (impresora.modo === 'real') {
          await enviarReal(aEscPos(doc, { columnas: impresora.columnas, abrirCajon }));
        } else {
          const texto = aTexto(doc, impresora.columnas);
          const aviso = abrirCajon ? '[SIMULACIÓN] >>> CAJÓN ABIERTO (pulso ESC p) <<<' : '[SIMULACIÓN] cajón NO se abre (sin efectivo)';
          if (impresora.modo === 'console') {
            log(`\n${texto}${aviso}\n`);
          } else {
            fs.mkdirSync(impresora.carpetaTickets, { recursive: true });
            const archivo = path.join(impresora.carpetaTickets, `ticket-${String(venta.id).padStart(6, '0')}.txt`);
            fs.writeFileSync(archivo, `${texto}${aviso}\n`, 'utf8');
            resultado.archivo = archivo;
          }
        }
        resultado.impreso = true;
        resultado.cajon_abierto = abrirCajon;
      } catch (err) {
        resultado.error = err.message;
        log(`[impresora] No se pudo imprimir la venta ${venta.id}: ${err.message}`);
      }
      return resultado;
    },
  };
};
