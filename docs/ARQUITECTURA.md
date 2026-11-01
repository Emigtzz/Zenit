# Arquitectura — Fase 1

## Capas (una dirección: cada una solo conoce a la de abajo)

```
Navegador (public/)  →  routes  →  controllers  →  services  →  repositories  →  SQLite
```

| Capa | Responsabilidad | NO hace |
|---|---|---|
| `routes/` | Asocia URL + validación (zod) con un controlador | Lógica |
| `controllers/` | Traduce HTTP ↔ servicio | SQL, reglas de negocio |
| `services/` | Reglas de negocio, transacciones, ticket, impresión | Conocer Express |
| `repositories/` | Único lugar con SQL | Reglas de negocio |
| `services/calculos.js` | **Funciones puras** de dinero (totales, descuento, pagos y cambio) | Tocar la base o el reloj |

## Decisiones

- **better-sqlite3** (síncrono) en lugar de un ORM: con una sola caja, una transacción son cuatro líneas y cada consulta tarda microsegundos.
- **Centavos enteros** en todo el sistema; el descuento de mayoreo se redondea una sola vez sobre el total (mitad hacia arriba).
- **El servidor es la autoridad**: ignora precios/totales del cliente, relee precios de la base y los copia a `venta_detalle`.
- **Transacción única** (`db.transaction`): venta + detalle + pagos + kárdex + stock. Cualquier excepción provoca ROLLBACK.
- **Stock negativo permitido**: vender algo con existencia mal registrada no debe bloquear la caja; el kárdex lo deja registrado.
- **Kárdex con signo**: venta = cantidad negativa. El stock solo cambia junto con un movimiento (el stock inicial también entra como "ajuste").
- **`pagos.monto` = lo aplicado a la venta** (suma = total); el cambio se guarda en `ventas.cambio` (columna extra, necesaria para reimprimir).
- **Impresión en segundo plano**: la venta responde en milisegundos y la impresora corre aparte; un fallo de impresión no deshace la venta (se informa y se reimprime).
- **Catálogo en memoria en el navegador**: el escaneo es instantáneo; al cobrar, el servidor revalida todo.
- **Búsqueda**: normalización (acentos/mayúsculas) + prefijo/subcadena + Levenshtein por palabra, con tolerancia según el largo; todas las palabras deben coincidir.
- **Preparado para fases futuras**: todas las tablas del modelo existen; `usuario_id` y `sincronizada` ya están en su lugar.
- **Servidor solo en `127.0.0.1`**: la caja no se expone a la red de la tienda.

## Flujo de una venta

1. El escáner "teclea" el código + Enter → el navegador busca en su catálogo en memoria y agrega/suma la línea.
2. `F4` → modal de cobro → `POST /api/ventas`.
3. `ventaService.crear`: valida productos activos → copia precios → calcula totales → resuelve pagos y cambio → escribe todo en una transacción.
4. Respuesta `201` con la venta; el ticket se imprime en segundo plano y la pantalla consulta su estado.

## Fase 2 — Inventario (kárdex y ajustes)

- **Migración 002**: `motivo` y `nota` en `movimientos_inventario` (+ índices por fecha y tipo).
- **Saldo del kárdex = suma acumulada por producto** (`SUM() OVER (PARTITION BY producto ORDER BY id)`), calculada antes de filtrar para que no dependa del filtro. No se guarda: no puede desincronizarse.
- **Ajuste en una transacción**: leer stock → insertar movimiento → actualizar stock. Un fallo deshace ambos.
- **Conteo físico**: el usuario captura lo contado y el servidor calcula la diferencia con el stock del momento de la transacción.
- **Motivos**: catálogo cerrado (`inventarioService.MOTIVOS`) para poder reportar mermas después; "otro" exige nota.
- **Verificación** (`/inventario/verificar`): detecta productos cuyo `stock` ≠ suma de sus movimientos.
- **Pendiente con usuarios**: `usuario_id` ya se guarda (NULL hoy); los ajustes pasarán a requerir rol *dueño*.
- **Stock bajo**: se calcula al consultar (sin tabla ni caché), así que siempre refleja el stock actual. `stock_minimo = 0` significa "sin mínimo": no alerta, salvo stock negativo. Orden: negativos (el más negativo primero), agotados y bajos por cercanía a cero respecto a su mínimo.

## Fase 2 — Usuarios, sesiones y roles

- **Contraseñas**: `scrypt` (incluido en Node) con sal aleatoria por usuario; el formato `scrypt$N$r$p$sal$hash` guarda sus parámetros, así se pueden endurecer sin romper hashes viejos. Comparación en tiempo constante; si el usuario no existe se calcula igual un hash para no delatarlo por el tiempo de respuesta.
- **Sesiones en SQLite** (tabla `sesiones`), no en memoria: sobreviven a reinicios de la caja. Se guarda el **hash SHA-256 del token**; el token viaja en una cookie `HttpOnly; SameSite=Strict`. Vencen a las 12 h sin actividad (se renuevan ~1 vez/minuto para no escribir en la base en cada petición).
- **Anti fuerza bruta**: 5 fallos → bloqueo de 1 minuto por usuario (en memoria).
- **Anti CSRF**: `SameSite=Strict` + verificación de `Origin` en peticiones que modifican.
- **Autorización por rol en las rutas** (`requerirRol`), no en el frontend: ocultar un botón es cosmética, la regla vive en el servidor. Los costos se eliminan de las respuestas al cajero.
- **Reglas de usuarios**: nombres únicos sin distinguir mayúsculas; siempre queda un dueño activo; nadie se desactiva a sí mismo; desactivar/cambiar rol/restablecer cierra sesiones.
- **Primer arranque**: sin usuarios, `/auth/setup` crea al dueño y deja de funcionar al existir cualquiera (no hay puerta trasera). El rescate es un script local (`scripts/usuarios.js`).
- **Trazabilidad**: `usuario_id` se llena en `ventas` y `movimientos_inventario`; es la base del corte de caja por cajero.
- **Límite conocido**: el servidor escucha solo en `127.0.0.1`, por lo que la protección se centra en separar roles en la misma máquina, no en exponerse a una red.

## Fase 2 — Corte de caja

- **Modelo**: `cortes_caja` (un turno) + `movimientos_caja` (ingresos/retiros de efectivo) + `ventas.corte_id`. Migración 004 agrega, además, quién abrió/cerró, notas y una **foto de totales** al cerrar.
- **Un solo corte abierto**: índice único parcial `ON cortes_caja ((cierre IS NULL)) WHERE cierre IS NULL`. La regla vive en la base, no solo en el código.
- **Vender exige caja abierta**: `ventaService` lee el corte abierto dentro de la misma transacción de la venta y le guarda `corte_id`; si no hay, `CAJA_CERRADA` (409) y no se escribe nada.
- **Fuente de verdad**: el esperado se **calcula** desde ventas, pagos y movimientos (`corteService.calcular`); al cerrar se congela una copia en el propio corte. `pagos.monto` en efectivo ya excluye el cambio, por eso la suma cuadra con lo que queda en el cajón.
- **Corte ciego**: `resumenActual(rol)` entrega al cajero solo el número de ventas; el dueño recibe el desglose. Quien cuenta no puede ajustar su conteo al "debería".
- **Retiros acotados**: no se puede retirar más que el efectivo esperado en ese momento (verificado dentro de la transacción).
- **Impresión desacoplada del cierre**: el cierre responde 200 aunque la impresora lance una excepción (hay prueba).
- **Ventas por cajero** en el corte salen de `ventas.usuario_id` (fase de usuarios).

## Fase 2 — Compras manuales

- **Migración 005**: `proveedores.activo` y nombre único; `compras` gana usuario, estado (`registrada`/`anulada`), notas, `pagada_de_caja` y datos de anulación; `compra_detalle.costo_previo`.
- **Una transacción** (`compraService.ejecutar`): compra + detalle + kárdex + stock + costo + (opcional) retiro de caja. El retiro reutiliza `corteService.registrarMovimiento`, que abre su propia `db.transaction`: better-sqlite3 la anida como *savepoint*, de modo que si el pago falla se deshace **toda** la compra.
- **Costo vigente = compra registrada más reciente por `fecha`** (desempata `id`), y se recalcula (`sincronizarCosto`) en cada alta o anulación. Es idempotente y soporta facturas capturadas fuera de orden.
- **Anulación**: no borra; marca `anulada` y genera movimientos `cancelacion` negativos. Se bloquea si el stock actual no alcanza para revertir (no fabrica stock negativo). El costo regresa a la compra vigente anterior, o a `costo_previo` si no hay otra y nadie lo editó mientras tanto.
- **Folio único** por proveedor entre compras `registrada` (índice parcial): una anulada libera el folio. Nulo permitido varias veces.
- **Índice de búsqueda**: guarda el costo del producto, así que se invalida tras registrar/anular; la pantalla además lee el producto fresco al elegirlo.
- Base para la **fase 3**: `compras.archivo`, `proveedores.rfc` y la tabla `equivalencias_proveedor` ya están listas; la importación de XML solo tendrá que producir la misma entrada que esta captura manual (con la pantalla de revisión obligatoria).

## Fase 3 — Importación de facturas

```
archivo ──► tipo por CONTENIDO (%PDF- / "<") ──► XML: cfdiParser (local)        ┐
                                                  PDF: facturaIA (Claude)        ├─► "factura neutra" (centavos)
                                                                                 ┘          │
   duplicados: hash del archivo · UUID fiscal ──────────────────────────────────────────────┤
                                                                                            ▼
                                                  BORRADOR (tabla importaciones + archivo en data/facturas/)
                                                                                            ▼
                         sugerencias (equivalencias aprendidas / candidatos por similitud) ─► REVISIÓN HUMANA
                                                                                            ▼
                         confirmar = compraService.registrar (misma transacción de la captura manual) + equivalencias
```

- **Una sola "factura neutra"** (`fuente, uuid, folio, fecha, emisor, lineas[{clave_proveedor, importe_sin_impuestos, impuestos, …}]`): el parser XML y el extractor de PDF producen lo mismo, así que la revisión, las equivalencias y la compra no saben de dónde vino.
- **Revisión obligatoria por diseño**: no existe ninguna ruta que registre una compra desde un archivo sin pasar por `confirmar`, y `confirmar` recibe lo que la persona dejó en pantalla (piezas y costo por pieza). Del archivo solo se toman datos que el usuario no puede alterar: UUID y archivo original.
- **Dinero sin flotantes**: los importes del XML llegan como texto y se convierten con `decimalACentavos` (redondeo half-up por cadena). Costo por pieza = importe del renglón ÷ piezas; el total puede diferir unos centavos del de la factura por redondeo y se informa.
- **Equivalencias con factor** (`equivalencias_proveedor.factor`): la unidad facturada ≠ la pieza de venta. Clave = `NoIdentificacion` del proveedor o, si no la manda, la descripción normalizada. El servidor toma la clave del renglón del borrador, no del cliente.
- **Candidatos**: se busca con los primeros términos de la descripción (sin ruido de empaque) y se ordena por términos compartidos con el nombre del producto, números incluidos, para que "600ML" gane a "2 L".
- **Seguridad**: XML con `DOCTYPE`/`ENTITY` se rechaza (XML bomb / XXE); `fast-xml-parser` no resuelve entidades externas. El tipo de archivo se decide por contenido, no por extensión. El nombre se sanea y la ruta se verifica dentro de `data/facturas/` (anti path traversal). El original se sirve como `text/plain` + `nosniff`. Subida cruda (`express.raw`, 8 MB) detrás de la sesión de dueño y del chequeo de `Origin`.
- **IA como respaldo, no como dependencia**: la caja nunca la necesita para vender ni para registrar compras; sin clave o sin internet solo falla la lectura del PDF, con mensaje accionable. Se usa el SDK oficial con **salida estructurada** (`output_config.format` + zod): con `claude-opus-5-5` un `tool_choice` forzado es un 400, así que no se usa. El PDF es contenido no confiable: el prompt lo declara datos; aun si lo engañara, la salida solo alimenta un borrador revisable.
- **No se valida la autenticidad fiscal** (sello/cadena original/estatus SAT). Ver pendientes.

## Fase 4 — Estadísticas, nube y celular del dueño

```
 CAJA (SQLite, local primero)                        NUBE (Supabase / Postgres)                    CELULAR (PWA, solo lectura)
 ventas · pagos · cortes · stock  ──► syncService ──► sincronizar() [RPC atómica, RLS "caja"] ──►  tablas  ──► estado_dueno() [RLS "dueño"] ──► tablero
        sincronizada = 0  ◄──────────── marca solo lo confirmado          + latido (hora del servidor) ──► estado_negocio ────────────────────► aviso "caja conectada"
```

- **Una definición, dos implementaciones, una prueba que las ata**: las estadísticas existen en JS (`estadisticasService`, para la pantalla de la caja sin internet) y en SQL (`estado_dueno`, para el celular). `test/sync.test.js` sube ~600 ventas con el servicio real a un Postgres real (PGlite) y exige que ambos devuelvan **exactamente el mismo JSON** en 14 días y 3 zonas horarias (incluido el día de 25 horas de Tijuana y Tokio, donde el día local casi no coincide con el UTC).
- **"Hoy" es del negocio**: todo el cálculo pasa por `zonaHoraria.js` (JS) o `at time zone` (SQL). Los límites del día se derivan de la medianoche local, no de sumar 24 h.
- **La caja nunca espera a la nube**: el cobro no sabe que existe; el ciclo corre aparte, con `try/catch` total, un cerrojo contra ciclos simultáneos y `unref()` para no impedir el apagado. Los errores se *guardan* (tipo + mensaje en español) en `sync_estado`; no se lanzan.
- **Idempotencia y recuperación**: cada envío es un *upsert* por llave (negocio, instalación, id local); reintentar no duplica. Un lote es una sola transacción en Postgres: si algo falla, la nube no queda a medias y la caja no marca nada. `marcarSubido` solo marca lo que no cambió durante el envío; disparadores en SQLite devuelven a pendiente lo ya subido que se modifique.
- **`instalacion_id`**: UUID por base de datos. Si se reinstala la caja con la base vacía (ids desde 1), sus ventas **se suman** al historial; no lo pisan.
- **Privilegios mínimos**: la caja usa un usuario normal de Supabase (`SYNC_EMAIL`), no `service_role`. RLS (`rol_en()` sobre `miembros`): la caja lee/inserta/actualiza solo lo suyo y no puede borrar; el dueño solo lee; `anon` no tiene ni `SELECT`. Las funciones son `SECURITY INVOKER`, así que la RLS aplica también dentro de ellas. `estado_dueno` exige además ser dueño de *ese* negocio. 25 pruebas contra Postgres real lo verifican, incluido el aislamiento entre negocios.
- **Latido con hora del servidor** (`now()` en SQL): no se confía en el reloj de la caja para saber si está viva.
- **PWA sin build**: HTML/ES modules, el SDK oficial incluido en `vendor/` (sin CDN), service worker que guarda solo la "cáscara" y **nunca** las respuestas de Supabase. Los datos de la última consulta se guardan en `localStorage` por día; al abrir se pinta primero eso (con aviso) y luego lo nuevo; las peticiones tienen tope de 10 s. `Salir` borra esa memoria.
- **Gráficas** (`pwa/lib/graficas.js`): SVG/HTML propio, una serie = un color (azul validado en claro y oscuro), barras de ≤ 24 px con el extremo de datos redondeado, énfasis en lo resaltado (el resto en gris), etiquetas solo en el máximo y lo resaltado, tabla alternativa y tooltips con teclado. El tablero (`tablero.js`) es el **mismo módulo** en la caja y en el celular.
- **Límites conocidos**: el nombre del producto en el top viene del momento de la última venta sincronizada; el plan gratuito de Supabase tiene límites y puede pausar proyectos sin actividad; el reloj del celular desfasado afecta los textos "hace X min".
