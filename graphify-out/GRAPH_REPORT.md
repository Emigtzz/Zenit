# Graph Report - Zenit  (2026-11-01)

## Corpus Check
- 90 files · ~53,733 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: .example 1, (none) 1, .css 1)

## Summary
- 650 nodes · 1423 edges · 16 communities (15 shown, 1 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 65 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `11e39f75`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- compraService.js
- main.js
- package.json
- catalogoService.js
- impresoraService.js
- Zenit POS — Luna de precios
- compras.js
- api.test.js
- importacionService.js
- ErrorApp
- validar.js
- importar.js
- auth.test.js
- productoRepository.js
- catalogo.js

## God Nodes (most connected - your core abstractions)
1. `ErrorApp` - 59 edges
2. `el()` - 58 edges
3. `formatear()` - 36 edges
4. `cerrarModal()` - 21 edges
5. `Zenit POS — Luna de precios` - 18 edges
6. `parsearPesos()` - 16 edges
7. `crearBaseDePrueba()` - 16 edges
8. `abrirCobro()` - 15 edges
9. `abrirRevision()` - 14 edges
10. `abrirModal()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Fase 2 — Compras manuales` --references--> `fecha()`  [INFERRED]
  docs/ARQUITECTURA.md → public/js/cortes.js
- `Fase 2 — Corte de caja` --references--> `calcular()`  [INFERRED]
  docs/ARQUITECTURA.md → src/services/corteService.js
- `Fase 3 — Importación de facturas` --references--> `decimalACentavos()`  [INFERRED]
  docs/ARQUITECTURA.md → src/utils/dinero.js
- `Fase 2 — Compras manuales` --references--> `sincronizarCosto()`  [INFERRED]
  docs/ARQUITECTURA.md → src/services/compraService.js
- `Fase 2 — Compras manuales` --references--> `registrarMovimiento()`  [INFERRED]
  docs/ARQUITECTURA.md → src/services/corteService.js

## Import Cycles
- None detected.

## Communities (16 total, 1 thin omitted)

### Community 0 - "compraService.js"
Cohesion: 0.07
Nodes (19): Arquitectura — Fase 1, Capas (una dirección: cada una solo conoce a la de abajo), Decisiones, Fase 2 — Compras manuales, Fase 2 — Corte de caja, Fase 2 — Inventario (kárdex y ajustes), Fase 2 — Usuarios, sesiones y roles, diaLocal() (+11 more)

### Community 1 - "main.js"
Cohesion: 0.09
Nodes (72): abrirBusqueda(), elegir(), pintar(), abrirApertura(), abrir(), abrirCierre(), cerrar(), continuar() (+64 more)

### Community 2 - "package.json"
Cohesion: 0.05
Nodes (38): bugs, url, dependencies, @anthropic-ai/sdk@^1.3.0, better-sqlite3@^13.0.3, express@^5.3.0, fast-xml-parser@^5.11.2, node-thermal-printer@^4.6.1 (+30 more)

### Community 3 - "catalogoService.js"
Cohesion: 0.19
Nodes (15): actualizar(), crear(), obtener(), actualizarCategoria(), actualizarProducto(), buscarPorCodigo(), crearCategoria(), crearProducto() (+7 more)

### Community 4 - "impresoraService.js"
Cohesion: 0.11
Nodes (27): emitir(), enviarReal(), { execFile }, fs, imprimirCorte(), imprimirVenta(), os, path (+19 more)

### Community 5 - "Zenit POS — Luna de precios"
Cohesion: 0.09
Nodes (22): Activar la lectura de PDF con IA (opcional), API (resumen), Atajos de teclado, Cargar datos de ejemplo, Compras y proveedores, Configuración (`.env`), Corte de caja, Ejecutar (+14 more)

### Community 6 - "compras.js"
Cohesion: 0.06
Nodes (43): api, requerirDueno(), abrirProv(), agregarProducto(), cargarHistorial(), cargarProveedores(), centavosATexto(), fechaCorta() (+35 more)

### Community 7 - "api.test.js"
Cohesion: 0.05
Nodes (42): assert, config, crearUsuario(), levantar(), path, test, conCatalogo(), assert (+34 more)

### Community 8 - "importacionService.js"
Cohesion: 0.06
Nodes (43): Fase 3 — Importación de facturas, buscar(), construir(), puntajePalabra(), toleranciaPara(), dinero(), invalido(), lista() (+35 more)

### Community 9 - "ErrorApp"
Cohesion: 0.06
Nodes (48): crearApp(), express, path, idDe(), sinCosto(), verPara(), idDe(), archivo() (+40 more)

### Community 10 - "validar.js"
Cohesion: 0.05
Nodes (37): abrirCajaSchema, ajusteSchema, anularCompraSchema, bool01, buscarSchema, cambioContrasenaSchema, categoriaSchema, centavos (+29 more)

### Community 11 - "importar.js"
Cohesion: 0.12
Nodes (29): abrirRevision(), cargarEquivalencias(), cargarHistorial(), cargarLista(), centavosATexto(), cfg, drop, enteroOK() (+21 more)

### Community 13 - "auth.test.js"
Cohesion: 0.08
Nodes (23): fs, categorias, db, productos, readline, config, envPath, fs (+15 more)

### Community 14 - "productoRepository.js"
Cohesion: 0.10
Nodes (11): Flujo de una venta, actualizar(), crear(), obtener(), calcularDescuentoMayoreo(), calcularImporte(), calcularSubtotal(), calcularTotales() (+3 more)

### Community 15 - "catalogo.js"
Cohesion: 0.29
Nodes (11): abrirCategoria(), abrirProducto(), cargar(), categorias, centavosATexto(), desactivarCategoria(), desactivarProducto(), pintarCategorias() (+3 more)

## Knowledge Gaps
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Fase 2 — Compras manuales` connect `compraService.js` to `main.js`?**
  _High betweenness centrality (0.412) - this node is a cross-community bridge._
- **Should `compraService.js` be split into smaller, more focused modules?**
  _Cohesion score 0.0746031746031746 - nodes in this community are weakly interconnected._
- **Why does `fecha()` connect `main.js` to `compraService.js`?**
  _High betweenness centrality (0.403) - this node is a cross-community bridge._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09012345679012346 - nodes in this community are weakly interconnected._
- **Why does `ErrorApp` connect `ErrorApp` to `compraService.js`, `catalogoService.js`, `importacionService.js`, `validar.js`, `productoRepository.js`?**
  _High betweenness centrality (0.333) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05179704016913319 - nodes in this community are weakly interconnected._
- **Should `impresoraService.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11290322580645161 - nodes in this community are weakly interconnected._