import { api, requerirDueno } from './api.js';
import { el } from './modal.js';

const $ = (id) => document.getElementById(id);
const yo = await requerirDueno();
let lista = [], editando = null, reseteando = null;

async function cargar() {
  lista = await api.usuarios();
  const activos = lista.filter((u) => u.activo).length;
  $('resumen').textContent = `${activos} activo(s) de ${lista.length}`;
  $('filas').replaceChildren(...lista.map((u) => el('tr', { class: u.activo ? '' : 'inactivo' },
    el('td', {}, u.nombre, u.id === yo.id ? el('span', { class: 'ayuda', texto: '  (tú)' }) : ''),
    el('td', {}, el('span', { class: 'etq' + (u.rol === 'dueño' ? ' dueno' : ''), texto: u.rol })),
    el('td', { texto: u.activo ? 'Activo' : 'Desactivado' }),
    el('td', { class: 'num' },
      el('button', { class: 'btn sec peq', type: 'button', onclick: () => abrir(u) }, 'Editar'), ' ',
      el('button', { class: 'btn sec peq', type: 'button', onclick: () => abrirPass(u) }, 'Contraseña')))));
}

function pista() { $('u-pista').textContent = $('u-rol').value === 'dueño' ? '(mínimo 8 caracteres)' : '(mínimo 4: puede ser un PIN)'; }
$('u-rol').addEventListener('change', pista);

function abrir(u = null) {
  editando = u;
  $('titulo').textContent = u ? 'Editar usuario' : 'Nuevo usuario';
  $('u-nombre').value = u?.nombre ?? ''; $('u-rol').value = u?.rol ?? 'cajero';
  $('u-activo').checked = u ? !!u.activo : true;
  $('f-pass').hidden = !!u; $('u-pass').required = !u; $('u-pass').value = '';
  $('f-activo').hidden = !u;
  $('err').textContent = ''; pista();
  $('dlg').showModal(); $('u-nombre').focus();
}
$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    editando
      ? await api.actualizarUsuario(editando.id, { nombre: $('u-nombre').value, rol: $('u-rol').value, activo: $('u-activo').checked })
      : await api.crearUsuario({ nombre: $('u-nombre').value, rol: $('u-rol').value, contrasena: $('u-pass').value });
    $('dlg').close(); await cargar();
  } catch (err) { $('err').textContent = err.detalles?.length ? err.detalles.map((d) => `${d.campo}: ${d.mensaje}`).join(' · ') : err.message; }
});

function abrirPass(u) {
  reseteando = u; $('titulo-pass').textContent = `Nueva contraseña para ${u.nombre}`;
  $('n-pass').value = ''; $('err-pass').textContent = ''; $('dlg-pass').showModal(); $('n-pass').focus();
}
$('form-pass').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api.restablecerContrasena(reseteando.id, $('n-pass').value); $('dlg-pass').close(); }
  catch (err) { $('err-pass').textContent = err.message; }
});

$('nuevo').onclick = () => abrir();
$('cancelar').onclick = () => $('dlg').close(); $('cancelar-pass').onclick = () => $('dlg-pass').close();
cargar().catch((e) => alert(e.message));
