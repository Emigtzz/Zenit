# Zenit POS — Luna de precios

Punto de venta e inventario **local primero**: la caja cobra sin internet. Servidor Node.js + Express, base SQLite local y pantalla de venta en el navegador (`localhost`).

> **Estado: Fase 1 (venta básica).** Usuarios, corte de caja, compras, estadísticas y sincronización con la nube llegan en fases posteriores (ver [Roadmap](#roadmap)).

## Requisitos

- **Node.js 22 o superior** (<https://nodejs.org>, versión LTS).
- Windows 10/11 (la caja), aunque también corre en Linux/macOS para desarrollo.
- Chrome o Edge.

## Instalar

```bash
git clone <url-del-repositorio> Zenit
cd Zenit
npm install
copy .env.example .env      # en Linux/macOS: cp .env.example .env
```

`better-sqlite3` trae binarios precompilados para Node LTS; normalmente `npm install` no compila nada. Si falla en Windows, instala las *Build Tools* de Visual Studio o usa Node LTS.

## Cargar datos de ejemplo

```bash
npm run seed              # 6 categorías y 30 productos (9 sin código de barras)
npm run seed -- --force   # borra el catálogo y vuelve a cargar
npm run db:reset          # borra por completo la base (solo desarrollo)
```

Al terminar, el seed imprime algunos códigos de barras de ejemplo para probar.

## Ejecutar

```bash
npm start
```

Abre <http://localhost:3000>. Para el modo kiosco en la caja:

```bat
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk http://localhost:3000
```

Pantalla de catálogo (alta, edición y desactivación): <http://localhost:3000/catalogo.html>.

## Probar sin hardware

| Hardware | Cómo se simula |
|---|---|
| **Escáner** | Escribe el código en el campo grande y pulsa Enter: un escáner HID hace exactamente eso. Prueba `101` (código corto), un código de barras del seed, `3*101` (3 piezas) o `999999` (no existe → aviso sin bloquear). |
| **Impresora** | `PRINTER_MODE=console` imprime el ticket en la terminal del servidor; `PRINTER_MODE=file` lo guarda en `data/tickets/ticket-000001.txt`. Ambos indican si el **cajón se habría abierto**. |
| **Cajón** | Se abre solo si hubo pago en efectivo. En simulación verás `>>> CAJÓN ABIERTO <<<` en el ticket. |

## Atajos de teclado

| Tecla | Acción |
|---|---|
| (siempre) | El campo de código está enfocado; el escáner escribe y manda Enter |
| `F2` | Buscar producto (tolera errores: "galetas" → Galletas) · `↑↓` mover · `Enter` agregar |
| `F4` | Cobrar · `E`/`T`/`R`/`M` método (efectivo, tarjeta, transferencia, mixto) · `Enter` confirmar |
| `F8` | Mayoreo (descuento sobre el total, 5 % por defecto) |
| `↑` `↓` | Seleccionar línea del ticket |
| `+` `-` | Subir/bajar cantidad de la línea seleccionada (con el campo vacío) |
| `Supr` | Quitar la línea seleccionada |
| `Esc` | Cancelar la venta en curso (pide confirmación con Enter) |
| `N*código` | Escribir `3*101` agrega 3 piezas del código 101 |

## Configuración (`.env`)

| Variable | Descripción | Por defecto |
|---|---|---|
| `PORT` | Puerto del servidor | `3000` |
| `DB_PATH` | Archivo SQLite | `./data/zenit.db` |
| `NEGOCIO_NOMBRE`, `NEGOCIO_DIRECCION`, `NEGOCIO_LEYENDA` | Encabezado y pie del ticket | Luna de precios |
| `PRINTER_MODE` | `console`, `file` o `real` | `console` |
| `PRINTER_INTERFACE` | Solo `real`: `tcp://IP` o `share:\\localhost\NombreCompartido` | — |
| `PRINTER_COLUMNS` | Ancho del ticket en caracteres (80 mm ≈ 48) | `48` |
| `MAYOREO_PORCENTAJE` | Descuento de mayoreo | `5` |

> ⚠ **Usa comillas si un valor lleva `#`** (`NEGOCIO_DIRECCION="Av. 20 de noviembre #185"`). En un `.env`, lo que sigue a `#` es un comentario.

### Impresora real (cuando la compres)

1. Instala el controlador de Windows de la impresora y **compártela** (Propiedades → Compartir), p. ej. con el nombre `TICKETS`.
2. En `.env`: `PRINTER_MODE=real` y `PRINTER_INTERFACE=share:\\localhost\TICKETS`.
   (Para una impresora de red: `PRINTER_INTERFACE=tcp://192.168.1.50`.)
3. Haz una venta en efectivo de prueba y verifica el ticket, el corte y que el cajón abra. Si falla, la venta **no se pierde**: la pantalla avisa y puedes reimprimir con `R`.

## Pruebas automáticas

```bash
npm test
```

Cubren: cálculo de totales y descuento, cambio, descuento de stock y kárdex, **reversión de la transacción** (si algo falla no se guarda nada), búsqueda tolerante, ticket/ESC-POS (incluido el pulso del cajón), API HTTP y validaciones.

## API (resumen)

Todos los montos son **enteros en centavos**. El servidor recalcula precios, descuento, total y cambio; el cliente solo envía qué se vende y cómo se paga.

| Método y ruta | Uso |
|---|---|
| `GET /api/productos/codigo/:codigo` | Barras o código corto (404 si no existe) |
| `GET /api/productos/buscar?q=` | Búsqueda tolerante a errores |
| `GET /api/productos/botones-rapidos` | Botones por categoría |
| `GET/POST /api/productos`, `PUT/DELETE /api/productos/:id` | Catálogo (DELETE = desactivar) |
| `GET/POST /api/categorias`, `PUT/DELETE /api/categorias/:id` | Categorías |
| `POST /api/ventas` | `{items:[{producto_id,cantidad}], pagos:[{metodo,monto}], mayoreo}` → venta guardada en una transacción |
| `GET /api/ventas/:id`, `GET /api/ventas/:id/impresion`, `POST /api/ventas/:id/reimprimir` | Consulta y reimpresión |

## Estructura

```
src/  routes → controllers → services → repositories → db (SQLite)
public/  pantalla de caja (HTML/CSS/JS sin framework)
test/  node:test      scripts/  seed y utilidades      docs/  arquitectura
```

Detalle y decisiones en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

## Roadmap

1. ✅ Venta básica (este README)
2. Inventario y control: kárdex, stock bajo, ajustes, corte de caja, usuarios y permisos, compras manuales
3. Importación de facturas (XML CFDI)
4. Estadísticas, sincronización a Supabase y PWA del dueño
5. Puesta en marcha: catálogo real, etiquetas, respaldos y capacitación
