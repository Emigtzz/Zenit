# Graph Report - Zenit  (2026-11-01)

## Corpus Check
- 69 files · ~33,292 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: .example 1, (none) 1, .css 1)

## Summary
- 475 nodes · 1022 edges · 16 communities (14 shown, 2 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 54 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `181d226b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- categoriaRepository.js
- main.js
- package.json
- productoRepository.js
- impresoraService.js
- Zenit POS — Luna de precios
- el
- api.test.js
- ErrorApp
- ErrorApp
- validar.js
- inventario.js
- auth.test.js
- login.js

## God Nodes (most connected - your core abstractions)
1. `ErrorApp` - 39 edges
2. `el()` - 38 edges
3. `formatear()` - 25 edges
4. `cerrarModal()` - 21 edges
5. `Zenit POS — Luna de precios` - 16 edges
6. `abrirCobro()` - 15 edges
7. `abrirModal()` - 14 edges
8. `abrirMovimiento()` - 13 edges
9. `abrirApertura()` - 12 edges
10. `abrirCierre()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Fase 2 — Corte de caja` --references--> `calcular()`  [INFERRED]
  docs/ARQUITECTURA.md → src/services/corteService.js
- `Flujo de una venta` --references--> `crear()`  [INFERRED]
  docs/ARQUITECTURA.md → src/services/ventaService.js
- `levantar()` --calls--> `crearApp()`  [EXTRACTED]
  test/api.test.js → src/app.js
- `crearBaseDePrueba()` --calls--> `abrirBase()`  [EXTRACTED]
  test/helpers.js → src/db/connection.js
- `crearBaseDePrueba()` --calls--> `migrar()`  [EXTRACTED]
  test/helpers.js → src/db/migrate.js

## Import Cycles
- None detected.

## Communities (16 total, 2 thin omitted)

### Community 0 - "categoriaRepository.js"
Cohesion: 0.47
Nodes (3): actualizar(), crear(), obtener()

### Community 1 - "main.js"
Cohesion: 0.13
Nodes (37): descuentoMayoreo(), agregar(), alCambiar(), alternarMayoreo(), avisar(), cambiarCantidad(), moverSeleccion(), oyentes (+29 more)

### Community 2 - "package.json"
Cohesion: 0.07
Nodes (30): bugs, url, dependencies, better-sqlite3@^13.0.3, express@^5.3.0, node-thermal-printer@^4.6.1, zod@^4.6.7, description (+22 more)

### Community 3 - "productoRepository.js"
Cohesion: 0.28
Nodes (3): actualizar(), crear(), obtener()

### Community 4 - "impresoraService.js"
Cohesion: 0.08
Nodes (33): node-thermal-printer, emitir(), enviarReal(), { execFile }, fs, imprimirCorte(), imprimirVenta(), os (+25 more)

### Community 5 - "Zenit POS — Luna de precios"
Cohesion: 0.08
Nodes (24): Arquitectura — Fase 1, Capas (una dirección: cada una solo conoce a la de abajo), Decisiones, Fase 2 — Corte de caja, Fase 2 — Inventario (kárdex y ajustes), Fase 2 — Usuarios, sesiones y roles, API (resumen), Atajos de teclado (+16 more)

### Community 6 - "el"
Cohesion: 0.10
Nodes (52): api, requerirDueno(), abrirBusqueda(), elegir(), pintar(), abrirApertura(), abrir(), abrirCierre() (+44 more)

### Community 7 - "api.test.js"
Cohesion: 0.08
Nodes (29): buscar(), construir(), puntajePalabra(), toleranciaPara(), pesosACentavos(), levenshtein(), normalizar(), assert (+21 more)

### Community 8 - "ErrorApp"
Cohesion: 0.15
Nodes (19): abrirSesion(), cambiarContrasenaPropia(), crypto, hashToken(), login(), logout(), setupInicial(), validar() (+11 more)

### Community 9 - "ErrorApp"
Cohesion: 0.06
Nodes (45): Flujo de una venta, crearApp(), express, path, idDe(), sinCosto(), verPara(), crear() (+37 more)

### Community 10 - "validar.js"
Cohesion: 0.05
Nodes (28): abrirCajaSchema, ajusteSchema, bool01, buscarSchema, cambioContrasenaSchema, categoriaSchema, centavos, cerrarCajaSchema (+20 more)

### Community 11 - "inventario.js"
Cohesion: 0.15
Nodes (17): calcularDelta(), cargarBajo(), consultar(), elegirProducto(), fmtFecha(), MODOS, motivos, NIVELES (+9 more)

### Community 13 - "auth.test.js"
Cohesion: 0.07
Nodes (25): fs, categorias, db, productos, readline, config, envPath, fs (+17 more)

### Community 16 - "login.js"
Cohesion: 0.36
Nodes (4): elegirUsuario(), mostrar(), mostrarLista(), usuarios

## Knowledge Gaps
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ErrorApp` connect `ErrorApp` to `ErrorApp`, `validar.js`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Why does `Arquitectura — Fase 1` connect `Zenit POS — Luna de precios` to `ErrorApp`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.06854838709677419 - nodes in this community are weakly interconnected._
- **Should `impresoraService.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08461538461538462 - nodes in this community are weakly interconnected._
- **Should `Zenit POS — Luna de precios` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._
- **Should `el` be split into smaller, more focused modules?**
  _Cohesion score 0.10189452124935997 - nodes in this community are weakly interconnected._