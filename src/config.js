'use strict';
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const envPath = path.join(raiz, '.env');
// process.loadEnvFile viene incluido en Node 22: no necesitamos la librería dotenv.
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);

function entero(nombre, defecto, { min = 0, max = Infinity } = {}) {
  const crudo = process.env[nombre];
  if (crudo === undefined || crudo === '') return defecto;
  const n = Number(crudo);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`Configuración inválida: ${nombre}="${crudo}" debe ser un entero entre ${min} y ${max}`);
  }
  return n;
}

const MODOS_IMPRESORA = ['console', 'file', 'real'];
const modo = process.env.PRINTER_MODE || 'console';
if (!MODOS_IMPRESORA.includes(modo)) {
  throw new Error(`PRINTER_MODE="${modo}" inválido. Usa: ${MODOS_IMPRESORA.join(' | ')}`);
}

const config = {
  puerto: entero('PORT', 3000, { min: 1, max: 65535 }),
  dbPath: path.resolve(raiz, process.env.DB_PATH || './data/zenit.db'),
  negocio: {
    nombre: process.env.NEGOCIO_NOMBRE || 'Mi negocio',
    direccion: process.env.NEGOCIO_DIRECCION || '',
    leyenda: process.env.NEGOCIO_LEYENDA || '',
  },
  impresora: {
    modo,
    interfaz: process.env.PRINTER_INTERFACE || '',
    columnas: entero('PRINTER_COLUMNS', 48, { min: 20, max: 80 }),
    carpetaTickets: path.join(raiz, 'data', 'tickets'),
  },
  mayoreoPorcentaje: entero('MAYOREO_PORCENTAJE', 5, { min: 0, max: 100 }),
  raiz,
};

module.exports = config;
