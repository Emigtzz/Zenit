'use strict';
// "Ácido  Cítrico" -> "acido citrico"
function normalizar(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Distancia de Levenshtein: mínimo de ediciones (insertar, borrar, cambiar una letra) para pasar de a a b.
// Ej.: "galetas" -> "galletas" = 1. Programación dinámica con dos filas (O(n*m) tiempo, O(m) memoria).
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min(previa[j] + 1, actual[j - 1] + 1, previa[j - 1] + costo);
    }
    previa = actual;
  }
  return previa[b.length];
}

module.exports = { normalizar, levenshtein };
