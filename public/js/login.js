import { api } from './api.js';
import { el } from './modal.js';

const $ = (id) => document.getElementById(id);
let elegido = null;

// Solo se redirige a rutas internas ("/algo"): evita que un enlace malicioso mande al usuario a otro sitio.
function destino() {
  const v = new URLSearchParams(location.search).get('volver');
  return v && v.startsWith('/') && !v.startsWith('//') ? v : '/';
}
const recordar = (id) => { try { localStorage.setItem('zenit_ultimo_usuario', String(id)); } catch { /* sin almacenamiento */ } };
const recordado = () => { try { return Number(localStorage.getItem('zenit_ultimo_usuario')); } catch { return 0; } };

function mostrar(cual) {
  $('v-usuarios').hidden = cual !== 'usuarios';
  $('f-login').hidden = cual !== 'login';
  $('f-setup').hidden = cual !== 'setup';
}
function elegirUsuario(u) {
  elegido = u;
  $('quien').textContent = u.nombre;
  $('sub').textContent = 'Ingresa tu contraseña';
  $('pass').value = ''; $('err-login').textContent = '';
  mostrar('login'); $('pass').focus();
}
function mostrarLista(usuarios) {
  elegido = null;
  $('sub').textContent = '¿Quién va a usar la caja?';
  $('lista').replaceChildren(...usuarios.map((u) => el('button', { type: 'button', onclick: () => elegirUsuario(u) }, u.nombre)));
  mostrar('usuarios');
  $('lista').querySelector('button')?.focus();
}

let usuarios = [];
(async () => {
  const e = await api.estadoAuth();
  $('negocio').textContent = e.negocio;
  document.title = `Entrar · ${e.negocio}`;
  if (e.usuario) { location.href = destino(); return; } // ya hay sesión
  if (e.necesita_setup) { $('sub').textContent = 'Configuración inicial'; mostrar('setup'); $('s-nombre').focus(); return; }
  usuarios = e.usuarios;
  const ultimo = usuarios.find((u) => u.id === recordado());
  ultimo ? elegirUsuario(ultimo) : mostrarLista(usuarios); // caja con un solo cajero fijo: escribe el PIN y Enter
})().catch((err) => { $('sub').textContent = err.message; });

$('otro').addEventListener('click', (ev) => { ev.preventDefault(); mostrarLista(usuarios); });
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('f-login').hidden) mostrarLista(usuarios); });

$('f-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('err-login').textContent = '';
  try {
    await api.login({ usuario_id: elegido.id, contrasena: $('pass').value });
    recordar(elegido.id);
    location.href = destino();
  } catch (err) {
    $('err-login').textContent = err.message;
    $('pass').value = ''; $('pass').focus();
  }
});

$('f-setup').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('err-setup').textContent = '';
  if ($('s-pass').value !== $('s-pass2').value) { $('err-setup').textContent = 'Las contraseñas no coinciden'; return; }
  try {
    const r = await api.setup({ nombre: $('s-nombre').value, contrasena: $('s-pass').value });
    recordar(r.usuario.id);
    location.href = destino();
  } catch (err) {
    $('err-setup').textContent = err.detalles?.length ? err.detalles.map((d) => d.mensaje).join(' · ') : err.message;
  }
});
