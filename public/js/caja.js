import { api } from './api.js';
import { formatear, parsearPesos } from './dinero.js';
import { abrirModal, cerrarModal, el } from './modal.js';

const campo = (rotulo, input) => el('div', { class: 'campo' }, el('label', { texto: rotulo }), input);
const montoInput = (ph = '0.00') => el('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: ph });
const botones = (...b) => el('div', { class: 'fila-btn' }, ...b);
const btn = (texto, onclick, sec = false) => el('button', { type: 'button', tabindex: '-1', class: 'btn' + (sec ? ' sec' : ''), onclick }, texto);

// ---------- Abrir caja (obligatorio para vender) ----------
export function abrirApertura({ alAbrir, alSalir }) {
  const fondo = montoInput();
  const msg = el('p', { class: 'cambio falta', style: 'font-size:16px' });
  async function abrir() {
    const monto = fondo.value.trim() === '' ? 0 : parsearPesos(fondo.value);
    if (monto === null) { msg.textContent = 'Escribe un monto válido, ej. 500 o 500.50'; return; }
    try { await api.abrirCaja(monto); cerrarModal(); alAbrir(); }
    catch (e) { if (e.codigo === 'CAJA_YA_ABIERTA') { cerrarModal(); alAbrir(); } else msg.textContent = e.message; }
  }
  abrirModal({
    contenido: el('div', {}, el('h2', { texto: 'Abrir caja' }),
      el('p', { class: 'ayuda', texto: 'Cuenta el efectivo con el que inicia el cajón (el "fondo") y captúralo. Sin caja abierta no se puede vender.' }),
      campo('Fondo inicial ($) — vacío = $0.00', fondo), msg,
      botones(btn('F9 · Cambiar usuario', alSalir, true), btn('Enter · Abrir caja', abrir)),
      el('p', { class: 'ayuda', texto: 'Esta ventana no se puede cerrar: la caja debe estar abierta para cobrar.' })),
    onKey(e) {
      if (e.key === 'Enter') { e.preventDefault(); abrir(); }
      else if (e.key === 'F9') { e.preventDefault(); alSalir(); }
      else if (e.key === 'Escape') e.preventDefault();
    },
  });
  fondo.focus();
}

// ---------- Entrada / salida de efectivo (F6) ----------
export function abrirMovimiento({ alTerminar }) {
  const tipo = el('select', {}, el('option', { value: 'retiro', texto: 'Retiro (sale dinero del cajón)' }), el('option', { value: 'ingreso', texto: 'Ingreso (entra dinero al cajón)' }));
  const monto = montoInput();
  const motivo = el('input', { type: 'text', maxlength: '120', placeholder: 'Ej. Pago al proveedor de hielo', autocomplete: 'off' });
  const msg = el('p', { class: 'cambio falta', style: 'font-size:16px' });
  async function guardar() {
    const m = parsearPesos(monto.value);
    if (m === null || m <= 0) { msg.textContent = 'Escribe un monto mayor a 0'; return; }
    if (motivo.value.trim().length < 3) { msg.textContent = 'Explica el motivo'; return; }
    try { await api.movimientoCaja({ tipo: tipo.value, monto: m, motivo: motivo.value }); cerrarModal(); alTerminar(`${tipo.value === 'retiro' ? 'Retiro' : 'Ingreso'} de ${formatear(m)} registrado`); }
    catch (e) { msg.textContent = e.message; }
  }
  abrirModal({
    contenido: el('div', {}, el('h2', { texto: 'Entrada / salida de efectivo' }),
      campo('Tipo', tipo), campo('Monto ($)', monto), campo('Motivo', motivo), msg,
      botones(btn('Esc · Cancelar', () => cerrarModal(), true), btn('Enter · Registrar', guardar)),
      el('p', { class: 'ayuda', texto: 'Tab para pasar de campo · flechas cambian el tipo' })),
    alCerrar: () => alTerminar(null),
    onKey(e) { if (e.key === 'Escape') { e.preventDefault(); cerrarModal(); } else if (e.key === 'Enter') { e.preventDefault(); guardar(); } },
  });
  tipo.focus();
}

// ---------- Corte / cierre de caja (F10) ----------
// El cajero cuenta SIN ver cuánto "debería haber" (corte ciego). El dueño sí ve el desglose.
export async function abrirCierre({ rol, alTerminar }) {
  let resumen;
  try { resumen = await api.resumenCaja(); } catch (e) { alTerminar(null, e.message); return; }

  const contado = montoInput();
  const notas = el('input', { type: 'text', maxlength: '300', placeholder: 'Opcional: explica una diferencia', autocomplete: 'off' });
  const msg = el('p', { class: 'cambio falta', style: 'font-size:16px' });
  const cuerpo = el('div');
  let fase = 'contar', montoContado = 0, resultado = null;

  const linea = (a, b, fuerte) => el('div', { style: `display:flex;justify-content:space-between;padding:3px 0;${fuerte ? 'font-weight:800;font-size:18px' : ''}` }, el('span', { texto: a }), el('span', { texto: b }));

  function pintar() {
    if (fase === 'contar') {
      const partes = [el('h2', { texto: 'Corte de caja' }), el('p', { class: 'ayuda', texto: `${resumen.num_ventas} venta(s) en este turno.` })];
      if (rol === 'dueño') {
        partes.push(el('div', { class: 'ayuda' },
          linea('Fondo inicial', formatear(resumen.corte.fondo_inicial)), linea('+ Ventas en efectivo', formatear(resumen.ventas_efectivo)),
          linea('+ Ingresos', formatear(resumen.ingresos)), linea('− Retiros', formatear(resumen.retiros)),
          linea('Efectivo esperado', formatear(resumen.efectivo_esperado), true),
          linea('Tarjeta / Transferencia', `${formatear(resumen.ventas_tarjeta)} / ${formatear(resumen.ventas_transferencia)}`)));
      }
      partes.push(el('p', { texto: 'Cuenta TODO el efectivo del cajón y captúralo.' }), campo('Efectivo contado ($)', contado), campo('Notas', notas), msg,
        botones(btn('Esc · Volver', () => cerrarModal(), true), btn('Enter · Continuar', continuar)));
      cuerpo.replaceChildren(...partes);
      contado.focus();
    } else if (fase === 'confirmar') {
      cuerpo.replaceChildren(el('h2', { texto: '¿Cerrar la caja?' }),
        el('p', { texto: `Efectivo contado: ${formatear(montoContado)}` }),
        el('p', { class: 'ayuda', texto: 'Al cerrar ya no se podrá vender hasta abrir la caja de nuevo.' }), msg,
        botones(btn('Esc · Corregir', () => { fase = 'contar'; pintar(); }, true), btn('Enter · Sí, cerrar', cerrar)));
    } else {
      const c = resultado.corte;
      const d = c.diferencia;
      const color = d === 0 ? 'var(--ok)' : 'var(--error)';
      cuerpo.replaceChildren(el('div', { class: 'exito' }, el('h2', { texto: `Corte #${String(c.id).padStart(6, '0')} cerrado` }),
        el('div', { class: 'grande', style: `color:${color}`, texto: d === 0 ? 'Caja cuadrada ✔' : d < 0 ? `Faltan ${formatear(-d)}` : `Sobran ${formatear(d)}` }),
        el('div', { class: 'ayuda' }, linea('Esperado', formatear(c.efectivo_esperado)), linea('Contado', formatear(c.efectivo_contado)),
          linea('Ventas', `${resultado.num_ventas} · ${formatear(resultado.total_ventas)}`)),
        el('p', { class: 'ayuda', texto: 'Se está imprimiendo el corte. Enter para continuar.' })));
    }
  }
  function continuar() {
    const m = parsearPesos(contado.value);
    if (m === null) { msg.textContent = 'Escribe el efectivo contado, ej. 1250.50 (0 si no hay)'; return; }
    montoContado = m; msg.textContent = ''; fase = 'confirmar'; pintar();
  }
  async function cerrar() {
    try { resultado = await api.cerrarCaja({ efectivo_contado: montoContado, notas: notas.value }); fase = 'listo'; pintar(); }
    catch (e) { msg.textContent = e.message; }
  }

  abrirModal({
    contenido: cuerpo,
    alCerrar: () => alTerminar(fase === 'listo' ? resultado : null),
    onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); if (fase === 'confirmar') { fase = 'contar'; pintar(); } else if (fase === 'listo') cerrarModal(); else cerrarModal(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (fase === 'contar') continuar(); else if (fase === 'confirmar') cerrar(); else cerrarModal(); }
    },
  });
  pintar();
}
