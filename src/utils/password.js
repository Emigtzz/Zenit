'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);

// scrypt: función de hash de contraseñas DISEÑADA para ser lenta y costosa en memoria (frena la fuerza bruta).
// Cada contraseña lleva su propia "sal" aleatoria: dos usuarios con la misma contraseña tienen hashes distintos.
// Formato guardado: scrypt$N$r$p$sal$hash  (los parámetros viajan con el hash para poder endurecerlos después).
const N = 16384, R = 8, P = 1, LARGO = 32;

async function hashear(contrasena) {
  const sal = crypto.randomBytes(16);
  const hash = await scrypt(contrasena, sal, LARGO, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${sal.toString('base64')}$${hash.toString('base64')}`;
}

async function verificar(contrasena, guardado) {
  const partes = String(guardado).split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, n, r, p, sal, hash] = partes;
  const esperado = Buffer.from(hash, 'base64');
  const calculado = await scrypt(contrasena, Buffer.from(sal, 'base64'), esperado.length, { N: Number(n), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(calculado, esperado); // comparación en tiempo constante
}

module.exports = { hashear, verificar };
