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
