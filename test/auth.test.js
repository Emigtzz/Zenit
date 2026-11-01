'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { abrirBase } = require('../src/db/connection');
const { migrar } = require('../src/db/migrate');
const authService = require('../src/services/authService');
const usuarioService = require('../src/services/usuarioService');
const { hashear, verificar } = require('../src/utils/password');

function entorno() {
  const db = abrirBase(':memory:'); migrar(db);
  const reloj = { t: Date.parse('2026-11-02T09:00:00Z') };
  const auth = authService(db, { ahora: () => reloj.t });
  return { db, reloj, auth, usuarios: usuarioService(db) };
}
const codigo = (p) => p.then(() => null, (e) => e.codigo);

test('password: hashes distintos para la misma contraseña (sal) y verificación correcta', async () => {
  const a = await hashear('secreto123'), b = await hashear('secreto123');
  assert.notEqual(a, b);
  assert.ok(a.startsWith('scrypt$'));
  assert.equal(await verificar('secreto123', a), true);
  assert.equal(await verificar('otra', a), false);
  assert.equal(await verificar('x', 'basura'), false);
});

test('la contraseña nunca se guarda en claro', async () => {
  const { db, auth } = entorno();
  await auth.setupInicial({ nombre: 'Ana', contrasena: 'contraseña-larga' });
  const fila = db.prepare('SELECT contrasena_hash FROM usuarios').get();
  assert.ok(!fila.contrasena_hash.includes('contraseña-larga'));
});

test('setup inicial: crea al dueño y solo funciona una vez', async () => {
  const { auth } = entorno();
  assert.equal(auth.necesitaSetup(), true);
  const { token, usuario } = await auth.setupInicial({ nombre: 'Ana', contrasena: 'contraseña-larga' });
  assert.equal(usuario.rol, 'dueño');
  assert.deepEqual(auth.validar(token), usuario);
  assert.equal(auth.necesitaSetup(), false);
  assert.equal(await codigo(auth.setupInicial({ nombre: 'Intruso', contrasena: 'contraseña-larga' })), 'YA_CONFIGURADO');
});

test('setup exige contraseña de dueño de 8+ caracteres', async () => {
  const { auth } = entorno();
  assert.equal(await codigo(auth.setupInicial({ nombre: 'Ana', contrasena: '1234' })), 'CONTRASENA_DEBIL');
});

test('login correcto e incorrecto; mismo error para contraseña mala y usuario inexistente', async () => {
  const { auth, usuarios } = entorno();
  const { usuario: dueno } = await auth.setupInicial({ nombre: 'Ana', contrasena: 'contraseña-larga' });
  const caj = await usuarios.crear({ nombre: 'Beto', rol: 'cajero', contrasena: '4321' });
  const ok = await auth.login({ usuario_id: caj.id, contrasena: '4321' });
  assert.equal(ok.usuario.rol, 'cajero');
  assert.equal(await codigo(auth.login({ usuario_id: caj.id, contrasena: 'mal' })), 'CREDENCIALES_INVALIDAS');
  assert.equal(await codigo(auth.login({ usuario_id: 999, contrasena: 'x' })), 'CREDENCIALES_INVALIDAS');
  assert.ok(dueno.id);
});

test('bloqueo tras 5 fallos y se levanta pasado el minuto', async () => {
  const { auth, usuarios, reloj } = entorno();
  await auth.setupInicial({ nombre: 'Ana', contrasena: 'contraseña-larga' });
  const c = await usuarios.crear({ nombre: 'Beto', rol: 'cajero', contrasena: '4321' });
  for (let i = 0; i < 5; i++) assert.equal(await codigo(auth.login({ usuario_id: c.id, contrasena: 'mal' })), 'CREDENCIALES_INVALIDAS');
  assert.equal(await codigo(auth.login({ usuario_id: c.id, contrasena: '4321' })), 'BLOQUEADO'); // ni la correcta pasa
  reloj.t += 61_000;
  assert.ok((await auth.login({ usuario_id: c.id, contrasena: '4321' })).token);
});

test('sesión: expira tras 12 h sin actividad y la actividad la renueva', async () => {
  const { auth, reloj } = entorno();
  const { token } = await auth.setupInicial({ nombre: 'Ana', contrasena: 'contraseña-larga' });
  reloj.t += 11 * 3600_000; assert.ok(auth.validar(token));   // 11 h: viva, y se renueva
  reloj.t += 11 * 3600_000; assert.ok(auth.validar(token));   // otras 11 h desde la última actividad: sigue
  reloj.t += 13 * 3600_000; assert.equal(auth.validar(token), null); // 13 h inactiva: expiró
  assert.equal(auth.validar(token), null);
});

test('logout invalida el token; token inventado no valida', async () => {
  const { auth } = entorno();
  const { token } = await auth.setupInicial({ nombre: 'Ana', contrasena: 'contraseña-larga' });
  auth.logout(token);
  assert.equal(auth.validar(token), null);
  assert.equal(auth.validar('inventado'), null);
  assert.equal(auth.validar(undefined), null);
});

test('el token no se guarda en claro en la base', async () => {
  const { auth, db } = entorno();
  const { token } = await auth.setupInicial({ nombre: 'Ana', contrasena: 'contraseña-larga' });
  assert.notEqual(db.prepare('SELECT token_hash h FROM sesiones').get().h, token);
});

test('desactivar a un usuario cierra sus sesiones; un desactivado no entra', async () => {
  const { auth, usuarios } = entorno();
  const { usuario: dueno } = await auth.setupInicial({ nombre: 'Ana', contrasena: 'contraseña-larga' });
  const c = await usuarios.crear({ nombre: 'Beto', rol: 'cajero', contrasena: '4321' });
  const { token } = await auth.login({ usuario_id: c.id, contrasena: '4321' });
  usuarios.actualizar(c.id, { nombre: 'Beto', rol: 'cajero', activo: false }, dueno.id);
  assert.equal(auth.validar(token), null);
  assert.equal(await codigo(auth.login({ usuario_id: c.id, contrasena: '4321' })), 'CREDENCIALES_INVALIDAS');
  assert.equal(auth.usuariosParaLogin().length, 1); // no aparece en la lista de login
});

test('cambiar rol cierra sesiones (para que el nuevo permiso aplique al re-entrar)', async () => {
  const { auth, usuarios } = entorno();
  const { usuario: dueno } = await auth.setupInicial({ nombre: 'Ana', contrasena: 'contraseña-larga' });
  const c = await usuarios.crear({ nombre: 'Beto', rol: 'cajero', contrasena: '4321' });
  const { token } = await auth.login({ usuario_id: c.id, contrasena: '4321' });
  usuarios.actualizar(c.id, { nombre: 'Beto', rol: 'dueño', activo: true }, dueno.id);
  assert.equal(auth.validar(token), null);
});

test('reglas: nombre único (sin distinguir mayúsculas), no desactivarse, siempre un dueño activo', async () => {
  const { auth, usuarios } = entorno();
  const { usuario: dueno } = await auth.setupInicial({ nombre: 'Ana', contrasena: 'contraseña-larga' });
  assert.equal(await codigo(usuarios.crear({ nombre: 'ANA', rol: 'cajero', contrasena: '1234' })), 'NOMBRE_DUPLICADO');
  assert.equal(await codigo(Promise.resolve().then(() => usuarios.actualizar(dueno.id, { nombre: 'Ana', rol: 'dueño', activo: false }, dueno.id))), 'AUTO_DESACTIVACION');
  const c = await usuarios.crear({ nombre: 'Beto', rol: 'cajero', contrasena: '4321' });
  // otro dueño intenta degradar al único dueño
  const d2 = await usuarios.crear({ nombre: 'Carla', rol: 'dueño', contrasena: 'otra-larga-1' });
  usuarios.actualizar(dueno.id, { nombre: 'Ana', rol: 'cajero', activo: true }, d2.id); // hay 2 dueños: se permite
  assert.equal(await codigo(Promise.resolve().then(() => usuarios.actualizar(d2.id, { nombre: 'Carla', rol: 'cajero', activo: true }, c.id))), 'ULTIMO_DUENO');
});

test('PIN de cajero de 4+ y restablecer contraseña cierra sesiones', async () => {
  const { auth, usuarios } = entorno();
  await auth.setupInicial({ nombre: 'Ana', contrasena: 'contraseña-larga' });
  assert.equal(await codigo(usuarios.crear({ nombre: 'Beto', rol: 'cajero', contrasena: '123' })), 'CONTRASENA_DEBIL');
  const c = await usuarios.crear({ nombre: 'Beto', rol: 'cajero', contrasena: '4321' });
  const { token } = await auth.login({ usuario_id: c.id, contrasena: '4321' });
  await usuarios.restablecerContrasena(c.id, '9999');
  assert.equal(auth.validar(token), null);
  assert.ok((await auth.login({ usuario_id: c.id, contrasena: '9999' })).token);
});

test('cambiar contraseña propia: exige la actual y cierra las OTRAS sesiones', async () => {
  const { auth, usuarios } = entorno();
  await auth.setupInicial({ nombre: 'Ana', contrasena: 'contraseña-larga' });
  const c = await usuarios.crear({ nombre: 'Beto', rol: 'cajero', contrasena: '4321' });
  const s1 = await auth.login({ usuario_id: c.id, contrasena: '4321' });
  const s2 = await auth.login({ usuario_id: c.id, contrasena: '4321' });
  assert.equal(await codigo(auth.cambiarContrasenaPropia(c.id, { actual: 'mal', nueva: '5555' }, s1.token)), 'CONTRASENA_ACTUAL_INCORRECTA');
  await auth.cambiarContrasenaPropia(c.id, { actual: '4321', nueva: '5555' }, s1.token);
  assert.ok(auth.validar(s1.token));
  assert.equal(auth.validar(s2.token), null);
});
