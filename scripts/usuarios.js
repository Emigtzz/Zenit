'use strict';
// Administración de usuarios desde la terminal. Sirve de RESCATE si el dueño olvidó su contraseña:
// solo funciona con acceso a esta computadora (no hay ninguna puerta trasera por red).
//   npm run usuarios -- listar
//   npm run usuarios -- contrasena "Nombre"
//   npm run usuarios -- crear-dueno "Nombre"
const readline = require('node:readline');
const config = require('../src/config');
const { abrirBase } = require('../src/db/connection');
const { migrar } = require('../src/db/migrate');
const usuarioRepository = require('../src/repositories/usuarioRepository');
const usuarioService = require('../src/services/usuarioService');

// Pide la contraseña sin mostrarla en pantalla (si hay terminal); si viene por una tubería, la lee tal cual.
function pedirContrasena(pregunta) {
  return new Promise((resolver) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
    if (process.stdin.isTTY) {
      rl._writeToOutput = (t) => { if (t.includes(pregunta)) process.stdout.write(t); };
    }
    rl.question(`${pregunta}`, (r) => { rl.close(); if (process.stdin.isTTY) process.stdout.write('\n'); resolver(r); });
  });
}

(async () => {
  const [cmd, nombre] = process.argv.slice(2);
  const db = abrirBase(config.dbPath);
  migrar(db);
  const repo = usuarioRepository(db);
  const svc = usuarioService(db);

  if (cmd === 'listar') {
    for (const u of repo.listar()) console.log(`${String(u.id).padStart(3)}  ${u.nombre.padEnd(20)} ${u.rol.padEnd(7)} ${u.activo ? 'activo' : 'DESACTIVADO'}`);
  } else if (cmd === 'contrasena' && nombre) {
    const u = repo.obtenerPorNombre(nombre);
    if (!u) { console.error(`No existe el usuario "${nombre}". Usa: listar`); process.exit(1); }
    await svc.restablecerContrasena(u.id, await pedirContrasena(`Nueva contraseña para ${u.nombre}: `));
    if (!u.activo) repo.actualizar(u.id, { nombre: u.nombre, rol: u.rol, activo: 1 }); // el rescate también reactiva
    console.log(`Listo. Contraseña de ${u.nombre} actualizada y sus sesiones cerradas.`);
  } else if (cmd === 'crear-dueno' && nombre) {
    await svc.crear({ nombre, rol: 'dueño', contrasena: await pedirContrasena(`Contraseña para ${nombre}: `) });
    console.log(`Listo. Dueño "${nombre}" creado.`);
  } else {
    console.log('Uso:\n  npm run usuarios -- listar\n  npm run usuarios -- contrasena "Nombre"\n  npm run usuarios -- crear-dueno "Nombre"');
  }
  db.close();
})().catch((e) => { console.error('Error:', e.message); process.exit(1); });
