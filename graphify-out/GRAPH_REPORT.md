# Graph Report - Zenit  (2026-11-01)

## Corpus Check
- 78 files · ~40,278 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: .example 1, (none) 1, .css 1)

## Summary
- 537 nodes · 1164 edges · 15 communities (13 shown, 2 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 60 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `eaa6c569`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- compraService.js
- main.js
- package.json
- catalogoService.js
- impresoraService.js
- Zenit POS — Luna de precios
- inventario.js
- api.test.js
- compras.js
- ErrorApp
- validar.js
- auth.test.js
- login.js

## God Nodes (most connected - your core abstractions)
1. `el()` - 48 edges
2. `ErrorApp` - 47 edges
3. `formatear()` - 30 edges
4. `cerrarModal()` - 21 edges
5. `Zenit POS — Luna de precios` - 17 edges
6. `abrirCobro()` - 15 edges
7. `parsearPesos()` - 14 edges
8. `abrirModal()` - 14 edges
9. `crearBaseDePrueba()` - 14 edges
10. `abrirMovimiento()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Fase 2 — Compras manuales` --references--> `fecha()`  [INFERRED]
  docs/ARQUITECTURA.md → public/js/cortes.js
- `Fase 2 — Corte de caja` --references--> `calcular()`  [INFERRED]
  docs/ARQUITECTURA.md → src/services/corteService.js
- `Flujo de una venta` --references--> `crear()`  [INFERRED]
  docs/ARQUITECTURA.md → src/services/ventaService.js
- `Fase 2 — Compras manuales` --references--> `sincronizarCosto()`  [INFERRED]
  docs/ARQUITECTURA.md → src/services/compraService.js
- `Fase 2 — Compras manuales` --references--> `registrarMovimiento()`  [INFERRED]
  docs/ARQUITECTURA.md → src/services/corteService.js

## Import Cycles
- None detected.

## Communities (15 total, 2 thin omitted)

### Community 0 - "compraService.js"
Cohesion: 0.07
Nodes (20): Arquitectura — Fase 1, Capas (una dirección: cada una solo conoce a la de abajo), Decisiones, Fase 2 — Compras manuales, Fase 2 — Corte de caja, Fase 2 — Inventario (kárdex y ajustes), Fase 2 — Usuarios, sesiones y roles, Flujo de una venta (+12 more)

### Community 1 - "main.js"
Cohesion: 0.09
Nodes (72): abrirBusqueda(), elegir(), pintar(), abrirApertura(), abrir(), abrirCierre(), cerrar(), continuar() (+64 more)

### Community 2 - "package.json"
Cohesion: 0.07
Nodes (31): bugs, url, dependencies, better-sqlite3@^13.0.3, express@^5.3.0, node-thermal-printer@^4.6.1, zod@^4.6.7, description (+23 more)

### Community 3 - "catalogoService.js"
Cohesion: 0.11
Nodes (18): actualizar(), crear(), obtener(), actualizar(), crear(), obtener(), actualizarCategoria(), actualizarProducto() (+10 more)

### Community 4 - "impresoraService.js"
Cohesion: 0.07
Nodes (35): emitir(), enviarReal(), { execFile }, fs, imprimirCorte(), imprimirVenta(), os, path (+27 more)

### Community 5 - "Zenit POS — Luna de precios"
Cohesion: 0.10
Nodes (20): API (resumen), Atajos de teclado, Cargar datos de ejemplo, Compras y proveedores, Configuración (`.env`), Corte de caja, Ejecutar, Estructura (+12 more)

### Community 6 - "inventario.js"
Cohesion: 0.08
Nodes (35): api, requerirDueno(), abrirCategoria(), abrirProducto(), cargar(), categorias, centavosATexto(), desactivarCategoria() (+27 more)

### Community 7 - "api.test.js"
Cohesion: 0.08
Nodes (31): buscar(), construir(), puntajePalabra(), toleranciaPara(), levenshtein(), normalizar(), assert, config (+23 more)

### Community 8 - "compras.js"
Cohesion: 0.17
Nodes (20): abrirProv(), agregarProducto(), cargarHistorial(), cargarProveedores(), centavosATexto(), fechaCorta(), hoy(), leerLinea() (+12 more)

### Community 9 - "ErrorApp"
Cohesion: 0.06
Nodes (48): crearApp(), express, path, idDe(), sinCosto(), verPara(), idDe(), crear() (+40 more)

### Community 10 - "validar.js"
Cohesion: 0.05
Nodes (33): abrirCajaSchema, ajusteSchema, anularCompraSchema, bool01, buscarSchema, cambioContrasenaSchema, categoriaSchema, centavos (+25 more)

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

- **Why does `Fase 2 — Compras manuales` connect `compraService.js` to `main.js`?**
  _High betweenness centrality (0.421) - this node is a cross-community bridge._
- **Should `compraService.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06970128022759602 - nodes in this community are weakly interconnected._
- **Why does `fecha()` connect `main.js` to `compraService.js`?**
  _High betweenness centrality (0.409) - this node is a cross-community bridge._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09012345679012346 - nodes in this community are weakly interconnected._
- **Why does `registrarMovimiento()` connect `compraService.js` to `ErrorApp`?**
  _High betweenness centrality (0.289) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.06818181818181818 - nodes in this community are weakly interconnected._
- **Should `catalogoService.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11083743842364532 - nodes in this community are weakly interconnected._