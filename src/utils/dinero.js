'use strict';
// Todo el dinero del sistema son ENTEROS en centavos: $12.50 -> 1250.
// Los decimales binarios (0.1 + 0.2 = 0.30000000000000004) rompen cuentas; los enteros no.

function pesosACentavos(pesos) {
  // Math.round corrige representaciones como 19.99 * 100 = 1998.9999999999998
  return Math.round(Number(pesos) * 100);
}

function centavosAPesos(centavos) {
  return centavos / 100;
}

function formatear(centavos) {
  const signo = centavos < 0 ? '-' : '';
  const abs = Math.abs(centavos);
  const pesos = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${signo}$${pesos}.${String(abs % 100).padStart(2, '0')}`;
}

// "1234.565" -> 123457. Convierte un decimal en TEXTO (como viene en un XML o en un JSON) a centavos enteros,
// redondeando a la mitad hacia arriba, sin pasar por flotantes. Devuelve null si no es un número válido.
function decimalACentavos(texto) {
  const t = String(texto ?? '').trim();
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(t);
  if (!m) return null;
  const [, neg, entero, frac = ''] = m;
  const fraccion = frac.padEnd(3, '0');
  let centavos = Number(entero) * 100 + Number(fraccion.slice(0, 2));
  if (Number(fraccion[2]) >= 5) centavos += 1;
  return neg ? -centavos : centavos;
}

module.exports = { pesosACentavos, centavosAPesos, formatear, decimalACentavos };
