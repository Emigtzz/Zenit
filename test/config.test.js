'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Regresión: sin comillas, "#185" se leía como comentario y la dirección del ticket salía cortada.
test('.env.example conserva "#" en la dirección (valor entre comillas)', () => {
  const ejemplo = path.join(__dirname, '..', '.env.example');
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zenit-env-')), '.env');
  fs.copyFileSync(ejemplo, tmp);
  const { parseEnv } = require('node:util');
  const valores = parseEnv(fs.readFileSync(tmp, 'utf8'));
  assert.equal(valores.NEGOCIO_DIRECCION, 'Av. 20 de noviembre #185');
  assert.equal(valores.NEGOCIO_NOMBRE, 'Luna de precios');
  assert.equal(valores.NEGOCIO_LEYENDA, 'Gracias por su compra');
});
