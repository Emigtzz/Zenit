'use strict';
const { normalizar, levenshtein } = require('../utils/texto');

// Errores tolerados según el largo de lo escrito: palabras cortas casi no admiten errores.
function toleranciaPara(largo) {
  if (largo <= 3) return 0;
  if (largo <= 6) return 1;
  return 2;
}

// Qué tan bien coincide UN término escrito con UNA palabra del producto. 0 = no coincide.
function puntajePalabra(termino, palabra) {
  if (palabra === termino) return 100;
  if (palabra.startsWith(termino)) return 80;          // "coc" -> "cocacola" (escribiendo)
  if (palabra.includes(termino) && termino.length >= 3) return 50;
  const tol = toleranciaPara(termino.length);
  if (tol === 0) return 0;
  // Compara con la palabra completa y con su prefijo del mismo largo (por si aún no termina de escribir).
  const prefijo = palabra.slice(0, termino.length);
  const d = Math.min(levenshtein(termino, palabra), levenshtein(termino, prefijo));
  return d <= tol ? 40 - d * 10 : 0;
}

// Servicio con el catálogo en MEMORIA: con unos miles de productos, buscar es instantáneo
// y evita ir a SQLite en cada tecla. Se recarga cuando el catálogo cambia (invalidar()).
module.exports = function busquedaService(productoRepo) {
  let indice = null;

  function construir() {
    indice = productoRepo.listar({ soloActivos: true }).map((p) => ({
      producto: p,
      palabras: normalizar(p.nombre).split(' ').filter(Boolean),
      categoria: normalizar(p.categoria_nombre),
      codigos: [p.codigo_barras, p.codigo_corto].filter(Boolean).map(String),
    }));
  }

  return {
    invalidar() { indice = null; },

    buscar(consulta, limite = 20) {
      const q = normalizar(consulta);
      if (!q) return [];
      if (!indice) construir();
      const terminos = q.split(' ');
      const resultados = [];

      for (const entrada of indice) {
        let total = 0;
        let coincideTodo = true;
        for (const t of terminos) {
          // Un número escrito también puede ser el inicio de un código.
          let mejor = entrada.codigos.some((c) => c.startsWith(t)) ? 90 : 0;
          for (const palabra of entrada.palabras) mejor = Math.max(mejor, puntajePalabra(t, palabra));
          if (!mejor && entrada.categoria.startsWith(t)) mejor = 20;
          if (!mejor) { coincideTodo = false; break; } // todos los términos deben coincidir (AND)
          total += mejor;
        }
        if (coincideTodo) resultados.push({ producto: entrada.producto, puntaje: total });
      }

      resultados.sort((a, b) => b.puntaje - a.puntaje || a.producto.nombre.localeCompare(b.producto.nombre, 'es'));
      return resultados.slice(0, limite).map((r) => r.producto);
    },
  };
};
