'use strict';
const fs = require('node:fs');
const path = require('node:path');

const { validarZona } = require('./utils/zonaHoraria');
const { esClaveDeAdministrador } = require('./sync/claves');

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
  // "Hoy" es el día de la TIENDA, no el de UTC ni el del servidor.
  zonaHoraria: validarZona(process.env.NEGOCIO_ZONA_HORARIA || 'America/Mexico_City'),
  // Sincronización con Supabase (opcional: sin estas variables la caja funciona igual, solo que no sube nada)
  sync: (() => {
    const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
    const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
    const email = (process.env.SYNC_EMAIL || '').trim();
    const password = process.env.SYNC_PASSWORD || '';
    // Si por error pusieron la clave de ADMINISTRADOR, la sincronización se APAGA (la caja sigue cobrando) y se avisa en voz alta.
    const claveAdmin = Boolean(anonKey) && esClaveDeAdministrador(anonKey);
    return { url, anonKey, email, password, intervaloSeg: entero('SYNC_INTERVALO_SEG', 60, { min: 15, max: 3600 }),
      habilitada: Boolean(url && anonKey && email && password) && !claveAdmin,
      advertencia: claveAdmin ? 'SUPABASE_ANON_KEY es una clave de ADMINISTRADOR (service_role / sb_secret_). La sincronización se desactivó por seguridad: usa la clave "anon" o "publishable".' : null };
  })(),
  // Importación de facturas (fase 3)
  costoIncluyeImpuestos: (process.env.COSTO_INCLUYE_IMPUESTOS ?? 'true').toLowerCase() !== 'false',
  carpetaFacturas: path.join(raiz, 'data', 'facturas'),
  ia: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    modelo: process.env.IA_MODELO || 'claude-opus-5-5',
  },
  mayoreoPorcentaje: entero('MAYOREO_PORCENTAJE', 5, { min: 0, max: 100 }),
  raiz,
};

module.exports = config;
