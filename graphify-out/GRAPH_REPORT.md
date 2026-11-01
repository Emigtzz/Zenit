# Graph Report - Zenit  (2026-11-01)

## Corpus Check
- 120 files · ~76,609 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 8 file(s) not represented in the graph (top: .css 4, (none) 2, .example 1)

## Summary
- 859 nodes · 1836 edges · 39 communities (34 shown, 5 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 83 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `94cc6e2d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- compraService.js
- el
- package.json
- catalogoService.js
- impresoraService.js
- Zenit POS — Luna de precios
- inventario.js
- crearBaseDePrueba
- importacionService.js
- authService.js
- validar.js
- importar.js
- src/config.js
- utils/errores.js
- compras.test.js
- sync.test.js
- pwa/app.js
- ref_node_assert
- estadisticasService.js
- supabase.test.js
- ErrorApp
- importacion.test.js
- src/app.js
- corteService.js
- productoRepository.js
- ticket.test.js
- pwa.test.js
- api.test.js
- config.test.js
- importacionController.js
- proveedorService.js
- ventaController.js
- categoriaRepository.js
- estadisticas.test.js
- pwa/package.json
- sw.js

## God Nodes (most connected - your core abstractions)
1. `ErrorApp` - 61 edges
2. `el()` - 58 edges
3. `formatear()` - 36 edges
4. `cerrarModal()` - 21 edges
5. `crearBaseDePrueba()` - 20 edges
6. `Zenit POS — Luna de precios` - 19 edges
7. `crearTablero()` - 18 edges
8. `parsearPesos()` - 16 edges
9. `abrirCobro()` - 15 edges
10. `api` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Fase 2 — Corte de caja` --references--> `calcular()`  [INFERRED]
  docs/ARQUITECTURA.md → src/services/corteService.js
- `Fase 3 — Importación de facturas` --references--> `decimalACentavos()`  [INFERRED]
  docs/ARQUITECTURA.md → src/utils/dinero.js
- `Fase 2 — Compras manuales` --references--> `fecha()`  [INFERRED]
  docs/ARQUITECTURA.md → public/js/cortes.js
- `Fase 2 — Compras manuales` --references--> `registrarMovimiento()`  [INFERRED]
  docs/ARQUITECTURA.md → src/services/corteService.js
- `Fase 2 — Compras manuales` --references--> `sincronizarCosto()`  [INFERRED]
  docs/ARQUITECTURA.md → src/services/compraService.js

## Import Cycles
- None detected.

## Communities (39 total, 5 thin omitted)

### Community 0 - "compraService.js"
Cohesion: 0.24
Nodes (6): Fase 2 — Compras manuales, diaLocal(), fechaDeCompra(), obtener(), p2(), sincronizarCosto()

### Community 1 - "el"
Cohesion: 0.07
Nodes (93): abrirBusqueda(), elegir(), pintar(), abrirApertura(), abrir(), abrirCierre(), cerrar(), continuar() (+85 more)

### Community 2 - "package.json"
Cohesion: 0.05
Nodes (41): bugs, url, dependencies, @anthropic-ai/sdk@^1.3.0, better-sqlite3@^13.0.3, express@^5.3.0, fast-xml-parser@^5.11.2, node-thermal-printer@^4.6.1 (+33 more)

### Community 3 - "catalogoService.js"
Cohesion: 0.36
Nodes (11): actualizarCategoria(), actualizarProducto(), crearCategoria(), crearProducto(), desactivarCategoria(), desactivarProducto(), noEncontrado(), obtenerProducto() (+3 more)

### Community 4 - "impresoraService.js"
Cohesion: 0.18
Nodes (20): node-thermal-printer, emitir(), enviarReal(), { execFile }, fs, imprimirCorte(), imprimirVenta(), os (+12 more)

### Community 5 - "Zenit POS — Luna de precios"
Cohesion: 0.05
Nodes (42): Arquitectura — Fase 1, Capas (una dirección: cada una solo conoce a la de abajo), Decisiones, Fase 2 — Corte de caja, Fase 2 — Inventario (kárdex y ajustes), Fase 2 — Usuarios, sesiones y roles, Fase 3 — Importación de facturas, Activar la lectura de PDF con IA (opcional) (+34 more)

### Community 6 - "inventario.js"
Cohesion: 0.06
Nodes (42): api, requerirDueno(), abrirCategoria(), abrirProducto(), cargar(), categorias, centavosATexto(), desactivarCategoria() (+34 more)

### Community 7 - "crearBaseDePrueba"
Cohesion: 0.18
Nodes (12): assert, entorno(), test, contar(), crearBaseDePrueba(), stockDe(), assert, baseConKardex() (+4 more)

### Community 8 - "importacionService.js"
Cohesion: 0.05
Nodes (43): buscar(), construir(), puntajePalabra(), toleranciaPara(), dinero(), invalido(), lista(), parsearCfdi() (+35 more)

### Community 9 - "authService.js"
Cohesion: 0.06
Nodes (38): categorias, db, productos, readline, ahora(), abrirBase(), Database, fs (+30 more)

### Community 10 - "validar.js"
Cohesion: 0.04
Nodes (37): abrirCajaSchema, ajusteSchema, anularCompraSchema, bool01, buscarSchema, cambioContrasenaSchema, categoriaSchema, centavos (+29 more)

### Community 11 - "importar.js"
Cohesion: 0.12
Nodes (29): abrirRevision(), cargarEquivalencias(), cargarHistorial(), cargarLista(), centavosATexto(), cfg, drop, enteroOK() (+21 more)

### Community 13 - "src/config.js"
Cohesion: 0.14
Nodes (11): dir, fs, path, sw, fs, config, envPath, fs (+3 more)

### Community 14 - "utils/errores.js"
Cohesion: 0.33
Nodes (8): Flujo de una venta, calcularDescuentoMayoreo(), calcularImporte(), calcularSubtotal(), calcularTotales(), resolverPagos(), crear(), obtener()

### Community 15 - "compras.test.js"
Cohesion: 0.29
Nodes (5): assert, dia(), entorno(), p2(), test

### Community 18 - "sync.test.js"
Cohesion: 0.07
Nodes (34): Fase 4 — Estadísticas, nube y celular del dueño, ErrorNube, MENSAJES, clasificar(), clasificarAuth(), crearNubeSupabase(), asegurar(), iniciarSesion() (+26 more)

### Community 19 - "pwa/app.js"
Cohesion: 0.08
Nodes (46): abrirTablero(), cargar(), claveCache(), descubrirNegocio(), esRed(), fetchConTiempo(), guardarCache(), hace() (+38 more)

### Community 26 - "ref_node_assert"
Cohesion: 0.16
Nodes (8): pesosACentavos(), assert, conCatalogo(), test, assert, test, assert, test

### Community 27 - "estadisticasService.js"
Cohesion: 0.22
Nodes (17): estadoDueno(), METODOS, resumenDia(), serie(), top(), diaLocal(), fmt(), formateadores (+9 more)

### Community 28 - "supabase.test.js"
Cohesion: 0.12
Nodes (12): crearNube(), fs, lote(), path, { randomUUID }, venta(), ALTA, assert (+4 more)

### Community 34 - "ErrorApp"
Cohesion: 0.17
Nodes (10): idDe(), sinCosto(), verPara(), idDe(), cargarSesion(), leerCookies(), mismoOrigen(), requerirSesion() (+2 more)

### Community 35 - "importacion.test.js"
Cohesion: 0.18
Nodes (7): assert, entorno(), fs, os, path, PDF, test

### Community 41 - "src/app.js"
Cohesion: 0.36
Nodes (5): crearApp(), express, path, manejarErrores(), noEncontrada()

### Community 45 - "corteService.js"
Cohesion: 0.38
Nodes (7): abrir(), ahoraIso(), calcular(), cerrar(), detalle(), registrarMovimiento(), resumenActual()

### Community 46 - "productoRepository.js"
Cohesion: 0.24
Nodes (3): actualizar(), crear(), obtener()

### Community 47 - "ticket.test.js"
Cohesion: 0.20
Nodes (8): assert, detalleCorte, fs, negocio, os, path, test, venta

### Community 49 - "pwa.test.js"
Cohesion: 0.22
Nodes (6): assert, { execFileSync }, fs, path, PWA, test

### Community 50 - "api.test.js"
Cohesion: 0.17
Nodes (11): assert, config, crearUsuario(), levantar(), path, test, cfdi(), concepto() (+3 more)

### Community 55 - "config.test.js"
Cohesion: 0.25
Nodes (5): assert, fs, os, path, test

### Community 56 - "importacionController.js"
Cohesion: 0.43
Nodes (5): archivo(), borrarEquivalencia(), confirmar(), descartar(), idDe()

### Community 57 - "proveedorService.js"
Cohesion: 0.38
Nodes (3): actualizar(), crear(), nombreLibre()

### Community 59 - "ventaController.js"
Cohesion: 0.60
Nodes (5): crear(), estadoImpresion(), idDe(), imprimirEnSegundoPlano(), reimprimir()

### Community 60 - "categoriaRepository.js"
Cohesion: 0.47
Nodes (3): actualizar(), crear(), obtener()

### Community 62 - "estadisticas.test.js"
Cohesion: 0.47
Nodes (5): assert, escenario(), L(), test, venta()

## Knowledge Gaps
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Fase 2 — Compras manuales` connect `compraService.js` to `el`, `corteService.js`, `Zenit POS — Luna de precios`?**
  _High betweenness centrality (0.359) - this node is a cross-community bridge._
- **Should `el` be split into smaller, more focused modules?**
  _Cohesion score 0.06534727408513816 - nodes in this community are weakly interconnected._
- **Why does `fecha()` connect `el` to `compraService.js`?**
  _High betweenness centrality (0.347) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05426356589147287 - nodes in this community are weakly interconnected._
- **Why does `registrarMovimiento()` connect `corteService.js` to `compraService.js`, `ErrorApp`?**
  _High betweenness centrality (0.249) - this node is a cross-community bridge._
- **Should `Zenit POS — Luna de precios` be split into smaller, more focused modules?**
  _Cohesion score 0.045454545454545456 - nodes in this community are weakly interconnected._
- **Should `inventario.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05889724310776942 - nodes in this community are weakly interconnected._