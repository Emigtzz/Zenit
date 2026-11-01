'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const z = require('../src/utils/zonaHoraria');

const MX = 'America/Mexico_City'; // UTC-6 todo el año desde 2022

test('el día local no es el día UTC: 23:59 en México todavía es "ayer" en UTC', () => {
  assert.equal(z.diaLocal('2026-11-02T05:59:00Z', MX), '2026-11-01');
  assert.equal(z.diaLocal('2026-11-02T06:00:00Z', MX), '2026-11-02');
  assert.equal(z.horaLocal('2026-11-02T05:59:00Z', MX), 23);
  assert.equal(z.horaLocal('2026-11-02T06:00:00Z', MX), 0);
});

test('límites del día en México: de 06:00 UTC a 06:00 UTC del siguiente', () => {
  assert.deepEqual(z.limitesDelDia('2026-11-02', MX), { inicio: '2026-11-02T06:00:00.000Z', fin: '2026-11-03T06:00:00.000Z' });
});

test('zona con horario de verano: el día del cambio dura 23 h (primavera) o 25 h (otoño)', () => {
  const LA = 'America/Los_Angeles';
  const horas = (dia) => { const l = z.limitesDelDia(dia, LA); return (Date.parse(l.fin) - Date.parse(l.inicio)) / 3600000; };
  assert.equal(horas('2026-03-08'), 23);
  assert.equal(horas('2026-11-01'), 25);
  assert.equal(horas('2026-06-15'), 24);
  assert.equal(z.limitesDelDia('2026-03-09', LA).inicio, '2026-03-09T07:00:00.000Z'); // ya en horario de verano (UTC-7)
});

test('los límites son consistentes con diaLocal: el último ms del día pertenece a ese día y el siguiente al otro', () => {
  for (const zona of [MX, 'America/Los_Angeles', 'America/Tijuana', 'Asia/Tokyo']) {
    for (const dia of ['2026-01-15', '2026-03-08', '2026-11-01']) {
      const { inicio, fin } = z.limitesDelDia(dia, zona);
      assert.equal(z.diaLocal(inicio, zona), dia, `${zona} ${dia} inicio`);
      assert.equal(z.diaLocal(new Date(Date.parse(fin) - 1).toISOString(), zona), dia, `${zona} ${dia} fin-1`);
      assert.equal(z.diaLocal(fin, zona), z.sumarDias(dia, 1), `${zona} ${dia} fin`);
    }
  }
});

test('sumarDias cruza meses, años y bisiestos; validarDia rechaza fechas imposibles', () => {
  assert.equal(z.sumarDias('2026-03-01', -1), '2026-02-28');
  assert.equal(z.sumarDias('2028-03-01', -1), '2028-02-29');
  assert.equal(z.sumarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(z.sumarDias('2026-11-02', -6), '2026-10-27');
  assert.equal(z.validarDia('2026-02-30'), false);
  assert.equal(z.validarDia('2026-13-01'), false);
  assert.equal(z.validarDia('ayer'), false);
  assert.equal(z.validarDia('2026-11-02'), true);
});

test('zona inválida se rechaza con un mensaje claro', () => {
  assert.throws(() => z.validarZona('Mexico/Ciudad'), /Zona horaria inválida/);
  assert.equal(z.validarZona(MX), MX);
});
