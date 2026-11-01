'use strict';
// Las fechas se GUARDAN en UTC, pero "las ventas de hoy" dependen de la medianoche de la TIENDA.
// Todo el cálculo de días y horas pasa por aquí, con una zona IANA (ej. "America/Mexico_City").

const formateadores = new Map();
function fmt(zona) {
  if (!formateadores.has(zona)) {
    formateadores.set(zona, new Intl.DateTimeFormat('en-US', {
      timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  return formateadores.get(zona);
}

function validarZona(zona) {
  try { fmt(zona); return zona; } catch { throw new Error(`Zona horaria inválida: "${zona}". Usa un nombre IANA, ej. America/Mexico_City`); }
}

function partes(ms, zona) {
  const o = {};
  for (const p of fmt(zona).formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return o;
}

// Cuántos ms hay que SUMAR al instante UTC para obtener la hora de pared de esa zona (negativo al oeste de Greenwich).
function offsetMs(ms, zona) {
  const p = partes(ms, zona);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

const p2 = (n) => String(n).padStart(2, '0');

// "2026-11-02T05:59:00Z" -> "2026-11-01" en Ciudad de México (UTC-6)
function diaLocal(instante, zona) {
  const p = partes(new Date(instante).getTime(), zona);
  return `${p.year}-${p2(p.month)}-${p2(p.day)}`;
}
function horaLocal(instante, zona) { return partes(new Date(instante).getTime(), zona).hour; }

function validarDia(dia) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const d = new Date(`${dia}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dia;
}

// Aritmética de calendario pura (sin zona): "2026-03-01" + (-1) = "2026-02-28"
function sumarDias(dia, n) {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Instante UTC en que EMPIEZA ese día en la zona (la medianoche local). Se afina dos veces por si el offset cambia ese día (horario de verano).
function inicioDelDia(dia, zona) {
  const [y, m, d] = dia.split('-').map(Number);
  const comoUtc = Date.UTC(y, m - 1, d);
  let ms = comoUtc - offsetMs(comoUtc, zona);
  ms = comoUtc - offsetMs(ms, zona);
  return new Date(ms).toISOString();
}
// [inicio, fin) del día local. Un día con cambio de horario dura 23 o 25 horas: por eso el fin es el inicio del día siguiente.
function limitesDelDia(dia, zona) { return { inicio: inicioDelDia(dia, zona), fin: inicioDelDia(sumarDias(dia, 1), zona) }; }

module.exports = { validarZona, diaLocal, horaLocal, validarDia, sumarDias, limitesDelDia };
