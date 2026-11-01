# Graph Report - Zenit  (2026-11-01)

## Corpus Check
- 50 files · ~18,573 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: .example 1, (none) 1, .css 1)

## Summary
- 331 nodes · 653 edges · 12 communities
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 38 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1e06e5d0`
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
- api.test.js
- productoRepository.js
- categoriaRepository.js
- ventaService.js
- inventario.js

## God Nodes (most connected - your core abstractions)
1. `ErrorApp` - 22 edges
2. `el()` - 18 edges
3. `formatear()` - 16 edges
4. `abrirCobro()` - 15 edges
5. `Zenit POS — Luna de precios` - 14 edges
6. `cerrarModal()` - 11 edges
7. `totales()` - 10 edges
8. `crearBaseDePrueba()` - 10 edges
9. `abrirConfirmacionCancelar()` - 9 edges
10. `mostrarExito()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Flujo de una venta` --references--> `crear()`  [INFERRED]
  docs/ARQUITECTURA.md → src/services/ventaService.js
- `levantar()` --calls--> `crearApp()`  [EXTRACTED]
  test/api.test.js → src/app.js
- `crearBaseDePrueba()` --calls--> `abrirBase()`  [EXTRACTED]
  test/helpers.js → src/db/connection.js
- `crearBaseDePrueba()` --calls--> `migrar()`  [EXTRACTED]
  test/helpers.js → src/db/migrate.js
- `pintarProductos()` --calls--> `formatear()`  [EXTRACTED]
  public/js/catalogo.js → public/js/dinero.js

## Import Cycles
- None detected.

## Communities (12 total, 0 thin omitted)

### Community 0 - "api.test.js"
Cohesion: 0.06
Nodes (28): fs, categorias, db, productos, config, envPath, fs, MODOS_IMPRESORA (+20 more)

### Community 1 - "main.js"
Cohesion: 0.11
Nodes (47): api, abrirBusqueda(), elegir(), pintar(), abrirCobro(), actualizarResultado(), calcular(), confirmar() (+39 more)

### Community 2 - "package.json"
Cohesion: 0.08
Nodes (29): bugs, url, dependencies, better-sqlite3@^13.0.3, express@^5.3.0, node-thermal-printer@^4.6.1, zod@^4.6.7, description (+21 more)

### Community 3 - "ErrorApp"
Cohesion: 0.06
Nodes (40): crearApp(), express, path, idDe(), crear(), estadoImpresion(), idDe(), imprimirEnSegundoPlano() (+32 more)

### Community 4 - "impresoraService.js"
Cohesion: 0.12
Nodes (23): enviarReal(), { execFile }, fs, imprimirVenta(), os, path, { ThermalPrinter, PrinterTypes, CharacterSet }, aEscPos() (+15 more)

### Community 5 - "Zenit POS — Luna de precios"
Cohesion: 0.10
Nodes (19): Arquitectura — Fase 1, Capas (una dirección: cada una solo conoce a la de abajo), Decisiones, Fase 2 — Inventario (kárdex y ajustes), API (resumen), Atajos de teclado, Cargar datos de ejemplo, Configuración (`.env`) (+11 more)

### Community 6 - "catalogo.js"
Cohesion: 0.29
Nodes (11): abrirCategoria(), abrirProducto(), cargar(), categorias, centavosATexto(), desactivarCategoria(), desactivarProducto(), pintarCategorias() (+3 more)

### Community 7 - "api.test.js"
Cohesion: 0.12
Nodes (23): migrar(), buscar(), construir(), puntajePalabra(), toleranciaPara(), levenshtein(), normalizar(), assert (+15 more)

### Community 8 - "productoRepository.js"
Cohesion: 0.28
Nodes (3): actualizar(), crear(), obtener()

### Community 9 - "categoriaRepository.js"
Cohesion: 0.47
Nodes (3): actualizar(), crear(), obtener()

### Community 10 - "ventaService.js"
Cohesion: 0.18
Nodes (8): Flujo de una venta, calcularDescuentoMayoreo(), calcularImporte(), calcularSubtotal(), calcularTotales(), resolverPagos(), crear(), obtener()

### Community 11 - "inventario.js"
Cohesion: 0.17
Nodes (14): calcularDelta(), consultar(), elegirProducto(), fmtFecha(), MODOS, motivos, nombreMotivo(), pestaña() (+6 more)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Flujo de una venta` connect `ventaService.js` to `Zenit POS — Luna de precios`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `abrirCobro()` (e.g. with `actualizarResultado()` and `confirmar()`) actually correct?**
  _`abrirCobro()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `api.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05757575757575758 - nodes in this community are weakly interconnected._
- **Why does `Arquitectura — Fase 1` connect `Zenit POS — Luna de precios` to `ventaService.js`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11493506493506493 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.07586206896551724 - nodes in this community are weakly interconnected._
- **Should `ErrorApp` be split into smaller, more focused modules?**
  _Cohesion score 0.06328320802005012 - nodes in this community are weakly interconnected._