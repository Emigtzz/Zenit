// Dinero en CENTAVOS enteros (igual que el servidor).
export function formatear(centavos) {
  const signo = centavos < 0 ? '-' : '';
  const abs = Math.abs(centavos);
  return `${signo}$${Math.floor(abs / 100).toLocaleString('en-US')}.${String(abs % 100).padStart(2, '0')}`;
}
// "125.5" -> 12550. Devuelve null si no es un monto válido. Se trabaja con el TEXTO, nunca con parseFloat*100.
export function parsearPesos(texto) {
  const t = String(texto).trim().replace(/^\$/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [p, c = ''] = t.split('.');
  return Number(p) * 100 + Number(c.padEnd(2, '0'));
}
export const descuentoMayoreo = (subtotal, pct) => Math.floor((subtotal * pct + 50) / 100);
