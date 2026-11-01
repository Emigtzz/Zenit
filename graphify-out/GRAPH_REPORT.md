# Graph Report - Zenit  (2026-11-01)

## Corpus Check
- 62 files · ~26,884 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: .example 1, (none) 1, .css 1)

## Summary
- 420 nodes · 844 edges · 20 communities
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 47 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9c89aa12`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- config.js
- main.js
- package.json
- productoRepository.js
- impresoraService.js
- Zenit POS — Luna de precios
- catalogo.js
- busqueda.test.js
- ErrorApp
- catalogoService.js
- validar.js
- inventario.js
- app.js
- auth.test.js
- migrate.js
- busquedaService.js
- login.js
- config.test.js
- api.test.js
- seed.js

## God Nodes (most connected - your core abstractions)
1. `ErrorApp` - 34 edges
2. `el()` - 24 edges
3. `formatear()` - 16 edges
4. `abrirCobro()` - 15 edges
5. `Zenit POS — Luna de precios` - 15 edges
6. `cerrarModal()` - 13 edges
7. `hashear()` - 11 edges
8. `totales()` - 10 edges
9. `abrirModal()` - 10 edges
10. `crearBaseDePrueba()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Flujo de una venta` --references--> `crear()`  [INFERRED]
  docs/ARQUITECTURA.md → src/services/ventaService.js
- `levantar()` --calls--> `crearApp()`  [EXTRACTED]
  test/api.test.js → src/app.js
- `crearBaseDePrueba()` --calls--> `abrirBase()`  [EXTRACTED]
  test/helpers.js → src/db/connection.js
- `crearBaseDePrueba()` --calls--> `migrar()`  [EXTRACTED]
  test/helpers.js → src/db/migrate.js
- `crearUsuario()` --calls--> `hashear()`  [EXTRACTED]
  test/api.test.js → src/utils/password.js

## Import Cycles
- None detected.

## Communities (20 total, 0 thin omitted)

### Community 0 - "config.js"
Cohesion: 0.20
Nodes (7): fs, config, envPath, fs, MODOS_IMPRESORA, path, raiz

### Community 1 - "main.js"
Cohesion: 0.11
Nodes (51): api, abrirBusqueda(), elegir(), pintar(), abrirCobro(), actualizarResultado(), calcular(), confirmar() (+43 more)

### Community 2 - "package.json"
Cohesion: 0.07
Nodes (29): bugs, url, dependencies, better-sqlite3@^13.0.3, express@^5.3.0, node-thermal-printer@^4.6.1, zod@^4.6.7, description (+21 more)

### Community 3 - "productoRepository.js"
Cohesion: 0.11
Nodes (11): Flujo de una venta, actualizar(), crear(), obtener(), calcularDescuentoMayoreo(), calcularImporte(), calcularSubtotal(), calcularTotales() (+3 more)

### Community 4 - "impresoraService.js"
Cohesion: 0.09
Nodes (26): enviarReal(), { execFile }, fs, imprimirVenta(), os, path, { ThermalPrinter, PrinterTypes, CharacterSet }, aEscPos() (+18 more)

### Community 5 - "Zenit POS — Luna de precios"
Cohesion: 0.08
Nodes (22): Arquitectura — Fase 1, Capas (una dirección: cada una solo conoce a la de abajo), Decisiones, Fase 2 — Inventario (kárdex y ajustes), Fase 2 — Usuarios, sesiones y roles, API (resumen), Atajos de teclado, Cargar datos de ejemplo (+14 more)

### Community 6 - "catalogo.js"
Cohesion: 0.17
Nodes (17): requerirDueno(), abrirCategoria(), abrirProducto(), cargar(), categorias, centavosATexto(), desactivarCategoria(), desactivarProducto() (+9 more)

### Community 7 - "busqueda.test.js"
Cohesion: 0.21
Nodes (11): assert, conCatalogo(), test, contar(), crearBaseDePrueba(), stockDe(), assert, baseConKardex() (+3 more)

### Community 8 - "ErrorApp"
Cohesion: 0.09
Nodes (32): idDe(), sinCosto(), verPara(), crear(), estadoImpresion(), idDe(), imprimirEnSegundoPlano(), reimprimir() (+24 more)

### Community 9 - "catalogoService.js"
Cohesion: 0.19
Nodes (15): actualizar(), crear(), obtener(), actualizarCategoria(), actualizarProducto(), buscarPorCodigo(), crearCategoria(), crearProducto() (+7 more)

### Community 10 - "validar.js"
Cohesion: 0.06
Nodes (23): ajusteSchema, bool01, buscarSchema, cambioContrasenaSchema, categoriaSchema, centavos, contrasenaCampo, fechaDia (+15 more)

### Community 11 - "inventario.js"
Cohesion: 0.15
Nodes (17): calcularDelta(), cargarBajo(), consultar(), elegirProducto(), fmtFecha(), MODOS, motivos, NIVELES (+9 more)

### Community 12 - "app.js"
Cohesion: 0.15
Nodes (7): express, crearApp(), express, path, manejarErrores(), noEncontrada(), { Router }

### Community 13 - "auth.test.js"
Cohesion: 0.19
Nodes (9): readline, abrirBase(), Database, fs, path, migrar(), assert, entorno() (+1 more)

### Community 14 - "migrate.js"
Cohesion: 0.20
Nodes (6): CARPETA, fs, path, app, db, servidor

### Community 15 - "busquedaService.js"
Cohesion: 0.44
Nodes (6): buscar(), construir(), puntajePalabra(), toleranciaPara(), levenshtein(), normalizar()

### Community 16 - "login.js"
Cohesion: 0.36
Nodes (4): elegirUsuario(), mostrar(), mostrarLista(), usuarios

### Community 17 - "config.test.js"
Cohesion: 0.29
Nodes (5): assert, fs, os, path, test

### Community 18 - "api.test.js"
Cohesion: 0.33
Nodes (6): assert, config, crearUsuario(), levantar(), path, test

### Community 19 - "seed.js"
Cohesion: 0.40
Nodes (3): categorias, db, productos

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ErrorApp` connect `ErrorApp` to `catalogoService.js`, `validar.js`, `productoRepository.js`, `app.js`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `abrirCobro()` (e.g. with `actualizarResultado()` and `confirmar()`) actually correct?**
  _`abrirCobro()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.10790960451977401 - nodes in this community are weakly interconnected._
- **Why does `Flujo de una venta` connect `productoRepository.js` to `Zenit POS — Luna de precios`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.0735632183908046 - nodes in this community are weakly interconnected._
- **Should `productoRepository.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `impresoraService.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09269162210338681 - nodes in this community are weakly interconnected._