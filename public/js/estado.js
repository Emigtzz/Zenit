import { descuentoMayoreo } from './dinero.js';

// Estado de la venta en curso (vive en el navegador hasta que se cobra).
export const venta = { lineas: [], mayoreo: false, seleccion: -1, pctMayoreo: 5 };
const oyentes = new Set();
export const alCambiar = (fn) => oyentes.add(fn);
const avisar = () => oyentes.forEach((fn) => fn());

// Mismo producto escaneado otra vez -> suma cantidad en la misma línea, no crea otra.
export function agregar(producto, cantidad = 1) {
  let i = venta.lineas.findIndex((l) => l.producto_id === producto.id);
  if (i === -1) {
    venta.lineas.push({ producto_id: producto.id, nombre: producto.nombre, precio: producto.precio, cantidad: 0 });
    i = venta.lineas.length - 1;
  }
  venta.lineas[i].cantidad = Math.min(9999, venta.lineas[i].cantidad + cantidad);
  venta.seleccion = i;
  avisar();
  return i;
}
export function moverSeleccion(delta) {
  if (!venta.lineas.length) return;
  const n = venta.lineas.length;
  venta.seleccion = (((venta.seleccion < 0 ? n : venta.seleccion) + delta) % n + n) % n;
  avisar();
}
export function cambiarCantidad(delta) {
  const l = venta.lineas[venta.seleccion];
  if (!l) return;
  l.cantidad += delta;
  if (l.cantidad <= 0) return quitarSeleccionada();
  avisar();
}
export function quitarSeleccionada() {
  if (venta.seleccion < 0) return;
  venta.lineas.splice(venta.seleccion, 1);
  venta.seleccion = Math.min(venta.seleccion, venta.lineas.length - 1);
  avisar();
}
export function alternarMayoreo() { venta.mayoreo = !venta.mayoreo; avisar(); }
export function vaciar() { venta.lineas = []; venta.mayoreo = false; venta.seleccion = -1; avisar(); }

export function totales() {
  const subtotal = venta.lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
  const descuento = venta.mayoreo ? descuentoMayoreo(subtotal, venta.pctMayoreo) : 0;
  const piezas = venta.lineas.reduce((s, l) => s + l.cantidad, 0);
  return { subtotal, descuento, total: subtotal - descuento, piezas };
}
