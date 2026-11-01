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
