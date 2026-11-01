# Graph Report - Zenit  (2026-11-01)

## Corpus Check
- 44 files · ~14,601 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: .example 1, (none) 1, .css 1)

## Summary
- 294 nodes · 587 edges · 11 communities (10 shown, 1 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 36 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `878a0cc1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- api.test.js
- main.js
- package.json
- ErrorApp
- impresoraService.js
- Zenit POS — Luna de precios
- catalogo.js
- busqueda.test.js
- productoRepository.js
- categoriaRepository.js

## God Nodes (most connected - your core abstractions)
1. `ErrorApp` - 20 edges
2. `formatear()` - 16 edges
3. `abrirCobro()` - 15 edges
4. `el()` - 13 edges
5. `Zenit POS — Luna de precios` - 12 edges
6. `cerrarModal()` - 11 edges
7. `totales()` - 10 edges
8. `abrirConfirmacionCancelar()` - 9 edges
9. `mostrarExito()` - 9 edges
10. `abrirModal()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Flujo de una venta` --references--> `crear()`  [INFERRED]
  docs/ARQUITECTURA.md → src/services/ventaService.js
- `levantar()` --calls--> `crearApp()`  [EXTRACTED]
  test/api.test.js → src/app.js
- `crearBaseDePrueba()` --calls--> `abrirBase()`  [EXTRACTED]
  test/helpers.js → src/db/connection.js
- `crearBaseDePrueba()` --calls--> `migrar()`  [EXTRACTED]
  test/helpers.js → src/db/migrate.js
- `validar()` --calls--> `ErrorApp`  [EXTRACTED]
  src/middlewares/validar.js → src/utils/errores.js

## Import Cycles
- None detected.

## Communities (11 total, 1 thin omitted)

### Community 0 - "api.test.js"
Cohesion: 0.05
Nodes (39): fs, categorias, db, productos, config, envPath, fs, MODOS_IMPRESORA (+31 more)

### Community 1 - "main.js"
Cohesion: 0.11
Nodes (47): api, abrirBusqueda(), elegir(), pintar(), abrirCobro(), actualizarResultado(), calcular(), confirmar() (+39 more)

### Community 2 - "package.json"
Cohesion: 0.05
Nodes (39): bugs, url, dependencies, better-sqlite3@^13.0.3, express@^5.3.0, node-thermal-printer@^4.6.1, zod@^4.6.7, description (+31 more)

### Community 3 - "ErrorApp"
Cohesion: 0.11
Nodes (32): Flujo de una venta, crearApp(), express, path, idDe(), crear(), estadoImpresion(), idDe() (+24 more)

### Community 4 - "impresoraService.js"
Cohesion: 0.11
Nodes (23): enviarReal(), { execFile }, fs, imprimirVenta(), os, path, { ThermalPrinter, PrinterTypes, CharacterSet }, aEscPos() (+15 more)

### Community 5 - "Zenit POS — Luna de precios"
Cohesion: 0.11
Nodes (16): Arquitectura — Fase 1, Capas (una dirección: cada una solo conoce a la de abajo), Decisiones, API (resumen), Atajos de teclado, Cargar datos de ejemplo, Configuración (`.env`), Ejecutar (+8 more)

### Community 6 - "catalogo.js"
Cohesion: 0.29
Nodes (11): abrirCategoria(), abrirProducto(), cargar(), categorias, centavosATexto(), desactivarCategoria(), desactivarProducto(), pintarCategorias() (+3 more)

### Community 7 - "busqueda.test.js"
Cohesion: 0.29
Nodes (9): buscar(), construir(), puntajePalabra(), toleranciaPara(), levenshtein(), normalizar(), assert, conCatalogo() (+1 more)

### Community 8 - "productoRepository.js"
Cohesion: 0.28
Nodes (3): actualizar(), crear(), obtener()

### Community 9 - "categoriaRepository.js"
Cohesion: 0.47
Nodes (3): actualizar(), crear(), obtener()

## Knowledge Gaps
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Flujo de una venta` connect `ErrorApp` to `Zenit POS — Luna de precios`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `abrirCobro()` (e.g. with `actualizarResultado()` and `confirmar()`) actually correct?**
  _`abrirCobro()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `api.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05201636469900643 - nodes in this community are weakly interconnected._
- **Why does `Arquitectura — Fase 1` connect `Zenit POS — Luna de precios` to `ErrorApp`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11493506493506493 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05204872646733112 - nodes in this community are weakly interconnected._
- **Should `ErrorApp` be split into smaller, more focused modules?**
  _Cohesion score 0.10975609756097561 - nodes in this community are weakly interconnected._