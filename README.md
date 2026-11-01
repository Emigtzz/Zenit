# Zenit POS — Luna de precios

Punto de venta e inventario **local primero**: la caja cobra sin internet. Servidor Node.js + Express, base SQLite local y pantalla de venta en el navegador (`localhost`).

> **Estado: Fase 1 completa y Fase 2 en curso (kárdex, ajustes y stock bajo listos).** Corte de caja, usuarios y compras manuales siguen en la fase 2; estadísticas y nube llegan después (ver [Roadmap](#roadmap)).

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

Abre <http://localhost:3000>. **La primera vez** no hay usuarios: la pantalla de entrada te pide crear la cuenta del dueño (nombre y contraseña de 8+ caracteres). Después, el dueño crea a los cajeros en `/usuarios.html`.

Para el modo kiosco en la caja:

```bat
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk http://localhost:3000
```

Otras pantallas (solo dueño):

- Catálogo (alta, edición y desactivación): <http://localhost:3000/catalogo.html>
- Inventario (ajustes y kárdex): <http://localhost:3000/inventario.html>
- Usuarios: <http://localhost:3000/usuarios.html>
- Cortes de caja: <http://localhost:3000/cortes.html>
- Compras y proveedores: <http://localhost:3000/compras.html>
- Importar facturas (XML/PDF): <http://localhost:3000/importar.html>

## Compras y proveedores

Solo el **dueño** (`/compras.html`): las compras manejan costos. Pestañas: *Nueva compra*, *Historial* y *Proveedores*.

Una compra se captura con proveedor, folio de factura (opcional), fecha y los productos con **cantidad** y **costo unitario**; el total lo calcula el servidor. Al registrarla, **en una sola transacción**:

1. se guarda la compra y su detalle;
2. el stock **sube** y el kárdex registra un movimiento `compra` (referencia `compra:N`, nota con la factura);
3. el **costo del producto se actualiza** al de esta compra;
4. si marcaste *Pagada con efectivo del cajón*, se registra el **retiro en el corte de caja** (si no hay caja abierta o no alcanza el efectivo, no se guarda nada).

Reglas que conviene conocer:

- **El costo vigente es el de la compra más reciente _por fecha_**, no el de la última que se capturó. Si hoy capturas una factura de hace 10 días, el stock entra pero el costo no pisa uno más nuevo.
- Al capturar, cada línea muestra *costo actual → nuevo (±%)* y avisa con ⚠ si el nuevo costo **iguala o supera el precio de venta** (sin ganancia). Al registrar, se listan los costos cambiados y los productos por revisar.
- **No se puede capturar dos veces la misma factura** del mismo proveedor (otro proveedor, o sin folio, sí).
- La fecha no puede ser futura. Un mismo producto no puede repetirse en la compra (junta las piezas).
- **Anular** una compra (motivo obligatorio) revierte el stock con un movimiento `cancelacion` y regresa el costo al de la compra anterior; si no hay otra, al que tenía antes. No pisa un costo que corregiste a mano después. **No se puede anular si lo comprado ya se vendió** (el stock quedaría negativo): haz antes un conteo físico. Anular libera el folio para recapturar la factura correcta. Si la compra se pagó del cajón, el reembolso se registra a mano con `F6`.
- Costos en pesos con centavos: un costo con fracciones de centavo (p. ej. $0.833 por pieza) se captura redondeado.

## Importar facturas (XML y PDF)

Solo el **dueño** (`/importar.html`). En vez de teclear cada factura de un proveedor, se sube el archivo y el sistema la lee; **una persona siempre la revisa antes de que se registre nada**.

**Dos caminos, el mismo resultado:**

| | XML (CFDI) | PDF |
|---|---|---|
| Cómo se lee | Directo en la caja, **sin internet** y sin costo | Con IA (Claude): requiere internet y una clave |
| Confiabilidad | Datos exactos del documento fiscal | Aproximada: **verifica cada renglón** |
| UUID fiscal | Sí (evita duplicados) | No (se apoya en folio y hash del archivo) |

Si tu proveedor te manda XML, úsalo: es más rápido, gratis y exacto. El PDF es el respaldo.

**Flujo:** subir (arrastrar o elegir) → **borrador** → *Revisión* → **Confirmar**. Un borrador no mueve inventario, costos ni caja. La revisión pide, renglón por renglón:

1. **Proveedor:** se reconoce por RFC o nombre; si es nuevo, se crea al confirmar.
2. **Producto de tu tienda** para cada renglón: ya viene sugerido si el sistema lo aprendió, o con candidatos parecidos (la búsqueda ignora el empaque y compara tamaños: "600ML" encuentra "600 ml").
3. **Piezas por unidad:** el proveedor factura *cajas* y tú vendes *piezas*. Una caja de 24 → 24. Piezas = cantidad × factor (debe salir entero) y **costo por pieza = importe del renglón ÷ piezas**, que puedes corregir.
4. **El costo incluye IVA** (casilla; el valor inicial sale de `COSTO_INCLUYE_IMPUESTOS` en `.env`).
5. Quitar renglones que no son mercancía (flete, cargos), fecha, notas y si se pagó del cajón.

Al confirmar se usa **la misma compra transaccional** de la captura manual (stock, kárdex, costo vigente, retiro de caja). Además:

- **Aprende:** guarda proveedor + clave → producto + factor. La siguiente factura de ese proveedor llega ya con todo sugerido (siempre revisable). Las equivalencias se ven y se borran en la pestaña *Equivalencias aprendidas*.
- **Duplicados:** no se acepta la misma factura dos veces (mismo **UUID**, mismo **folio** del proveedor, o el **mismo archivo**), aunque llegue por XML y por PDF.
- Se compara el **total de la factura** con el que se va a registrar y se avisa si difieren.
- Se guarda el **archivo original** en `data/facturas/` (incluye esa carpeta en tus respaldos) y se puede abrir desde la revisión.
- No se aceptan notas de crédito, complementos de pago, traslados ni nómina: solo facturas de compra (tipo Ingreso). Moneda extranjera: se convierte con el tipo de cambio de la factura y se avisa.
- **Límites:** 8 MB por archivo. **No se valida el sello ni se consulta al SAT**: solo se extraen los datos.

### Activar la lectura de PDF con IA (opcional)

1. Crea una clave en <https://console.anthropic.com> y ponla en `.env`: `ANTHROPIC_API_KEY=...`
2. Reinicia la caja. Sin clave, los PDF se rechazan con un mensaje claro y los XML siguen funcionando.

El modelo por defecto es `claude-opus-5-5` (`IA_MODELO` en `.env`). Cada PDF cuesta del orden de centavos de dólar. ⚠ **El contenido del PDF se envía a Anthropic** para leerlo. El PDF se trata como contenido no confiable (se le pide al modelo ignorar instrucciones escondidas en el documento) y el resultado jamás se registra sin tu revisión.

## Corte de caja

Cada turno de la caja es un **corte**. Al entrar, si la caja está cerrada, la pantalla pide **abrir caja** con el *fondo inicial* (el efectivo con que arranca el cajón); **sin caja abierta no se puede vender**, y cada venta queda ligada a su corte. La base de datos misma impide tener dos cortes abiertos.

```
efectivo esperado = fondo inicial + ventas en efectivo + ingresos − retiros
```

Tarjeta y transferencia **no** cuentan, porque ese dinero no está en el cajón. De las ventas en efectivo solo cuenta lo aplicado a la venta (no el cambio que se devolvió). Las ventas canceladas no cuentan.

- **`F6` Entrada/salida de efectivo:** registra un retiro o ingreso con motivo obligatorio y quién lo hizo. No permite retirar más efectivo del que debe haber.
- **`F10` Corte:** el cajero **cuenta el efectivo sin ver cuánto debería haber** (corte *ciego*, para que no se "cuadre" a ojo). Pide confirmación y muestra *faltan* / *sobran* / *caja cuadrada*. El dueño sí ve el desglose antes de cerrar. No se permite con una venta en curso.
- Al cerrar se imprime el **ticket del corte** (con firma; nunca abre el cajón). Una falla de la impresora no deshace el cierre.
- El **dueño** consulta el historial en `/cortes.html`: totales por método y por cajero, movimientos de efectivo, diferencia y reimpresión. Los totales de un corte cerrado quedan guardados y no cambian.

> Al actualizar una instalación existente, la primera vez que alguien entre se pedirá abrir caja.

## Usuarios y roles

Todo el sistema pide iniciar sesión. En la pantalla de entrada se elige el nombre y se teclea la contraseña o PIN (la caja recuerda al último usuario: basta escribir el PIN y Enter). **`F9` cambia de usuario** (no se permite con una venta a medias). Cada venta, ajuste y movimiento de kárdex guarda **quién lo hizo**, y el ticket dice `Atendió: …`.

| | Cajero | Dueño |
|---|:-:|:-:|
| Vender, buscar productos, reimprimir tickets | ✅ | ✅ |
| Ver stock bajo | ✅ | ✅ |
| Abrir caja, mover efectivo y hacer el corte (ciego) | ✅ | ✅ |
| Ver el historial de cortes y su desglose | ❌ | ✅ |
| Cambiar su propia contraseña | ✅ | ✅ |
| Ver **costos** de los productos | ❌ | ✅ |
| Alta/edición/desactivación de catálogo y precios | ❌ | ✅ |
| Ajustes de inventario y kárdex | ❌ | ✅ |
| Gestionar usuarios | ❌ | ✅ |
| Compras, proveedores e importar facturas | ❌ | ✅ |

Contraseñas: **dueño** mínimo 8 caracteres; **cajero** mínimo 4 (puede ser un PIN). Se guardan con `scrypt` y sal propia, nunca en claro. Tras **5 intentos fallidos** el usuario se bloquea 1 minuto. Las sesiones duran 12 h de inactividad. Desactivar a alguien, cambiarle el rol o restablecerle la contraseña cierra sus sesiones abiertas. Siempre debe quedar al menos un dueño activo.

**¿Se le olvidó la contraseña al dueño?** Desde una terminal en la computadora de la caja:

```bash
npm run usuarios -- listar
npm run usuarios -- contrasena "Nombre"      # pide la nueva contraseña sin mostrarla
npm run usuarios -- crear-dueno "Nombre"
```

## Inventario: kárdex y ajustes

El stock **nunca se edita directamente**: cada cambio es un movimiento del kárdex (`venta`, `ajuste`; `compra` y `cancelacion` llegan después) y el stock se actualiza en la misma transacción. Los movimientos llevan signo (venta = negativo).

Ajustes (`/inventario.html`, pestaña *Ajustar existencias*):

| Tipo | Qué hace |
|---|---|
| Entrada | Suma piezas |
| Salida | Resta piezas (no permite dejar el stock bajo cero) |
| Conteo físico | Escribes lo que **contaste** y el sistema calcula la diferencia. Es la forma de corregir un stock negativo |

### Stock bajo

Pestaña *Stock bajo* (es la primera pantalla de Inventario cuando hay algo por reponer) y aviso `Inventario ⚠ N por reponer` en el encabezado de la caja. Solo cuenta productos **activos**:

| Estado | Regla |
|---|---|
| **Contar (negativo)** | `stock < 0`: se vendió sin existencia registrada; hay que hacer un conteo físico |
| **Agotado** | `stock = 0` y tiene mínimo definido |
| **Bajo** | `0 < stock ≤ stock_mínimo` |

Un producto con `stock_minimo = 0` se considera "sin mínimo definido" y no genera alerta (salvo que quede negativo): define el mínimo en el catálogo. La lista se ordena por gravedad, muestra cuántas piezas **faltan** para llegar al mínimo, tiene botón *Ajustar* por fila y se puede imprimir como lista de reposición.

Todo ajuste exige un **motivo** (conteo físico, merma, caducado, dañado, robo o extravío, devolución a proveedor, error de captura, otro). Con "Otro" la nota es obligatoria. El kárdex muestra el **saldo acumulado** tras cada movimiento y se filtra por producto, tipo y fechas. La pantalla avisa si el stock de algún producto no coincide con la suma de su kárdex (`GET /api/inventario/verificar`).

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
| `F6` | Entrada o salida de efectivo del cajón (pago a proveedor, retiro, cambio extra) |
| `F10` | Corte de caja (cierra el turno) |
| `F9` | Cambiar de usuario |
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

Todas las rutas excepto `/api/auth/estado`, `/api/auth/login` y `/api/auth/setup` exigen sesión (cookie `HttpOnly`). Todos los montos son **enteros en centavos**. El servidor recalcula precios, descuento, total y cambio; el cliente solo envía qué se vende y cómo se paga.

| Método y ruta | Uso |
|---|---|
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/yo`, `POST /api/auth/contrasena` | Sesión y contraseña propia |
| `GET/POST /api/usuarios`, `PUT /api/usuarios/:id`, `POST /api/usuarios/:id/contrasena` | Gestión de usuarios (dueño) |
| `GET /api/productos/codigo/:codigo` | Barras o código corto (404 si no existe) |
| `GET /api/productos/buscar?q=` | Búsqueda tolerante a errores |
| `GET /api/productos/botones-rapidos` | Botones por categoría |
| `GET/POST /api/productos`, `PUT/DELETE /api/productos/:id` | Catálogo (DELETE = desactivar) |
| `GET/POST /api/categorias`, `PUT/DELETE /api/categorias/:id` | Categorías |
| `POST /api/ventas` | `{items:[{producto_id,cantidad}], pagos:[{metodo,monto}], mayoreo}` → venta guardada en una transacción |
| `GET /api/ventas/:id`, `GET /api/ventas/:id/impresion`, `POST /api/ventas/:id/reimprimir` | Consulta y reimpresión |
| `POST /api/inventario/ajustes` | `{producto_id, modo: entrada\|salida\|conteo, cantidad, motivo, nota}` |
| `GET /api/inventario/kardex?producto_id=&tipo=&desde=&hasta=&pagina=` | Movimientos con saldo acumulado (fechas `AAAA-MM-DD`, hora local) |
| `POST /api/importaciones` (cuerpo = el archivo, cabecera `X-Nombre-Archivo`), `GET /api/importaciones[/:id]`, `GET /api/importaciones/:id/archivo`, `POST /api/importaciones/:id/confirmar`, `POST /api/importaciones/:id/descartar` | Importación de facturas (dueño). Confirmar recibe piezas y costo por pieza ya revisados |
| `GET /api/equivalencias`, `DELETE /api/equivalencias?proveedor_id=&clave=` | Equivalencias proveedor → producto (dueño) |
| `GET/POST /api/proveedores`, `PUT /api/proveedores/:id` | Proveedores (dueño) |
| `POST /api/compras`, `GET /api/compras`, `GET /api/compras/:id`, `POST /api/compras/:id/anular`, `GET /api/compras/producto/:id` | Compras (dueño). El cuerpo: `{proveedor_id, folio_factura?, fecha?, pagar_de_caja?, items:[{producto_id, cantidad, costo_unitario}]}` en centavos |
| `GET /api/caja/estado`, `POST /api/caja/abrir`, `GET /api/caja/resumen`, `POST /api/caja/movimientos`, `POST /api/caja/cerrar` | Turno de caja (cajero y dueño; el cajero recibe un resumen ciego) |
| `GET /api/caja/cortes`, `GET /api/caja/cortes/:id`, `POST /api/caja/cortes/:id/imprimir` | Historial de cortes (dueño) |
| `GET /api/inventario/stock-bajo` | `{total, por_nivel, productos[]}` con `nivel` y `faltante` |
| `GET /api/inventario/motivos`, `GET /api/inventario/verificar` | Catálogo de motivos y chequeo de consistencia |

## Estructura

```
src/  routes → controllers → services → repositories → db (SQLite)
public/  pantalla de caja (HTML/CSS/JS sin framework)
test/  node:test      scripts/  seed y utilidades      docs/  arquitectura
```

Detalle y decisiones en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

## Roadmap

1. ✅ Venta básica (este README)
2. ✅ Inventario y control: kárdex, ajustes, stock bajo, usuarios y permisos, corte de caja y compras manuales
3. ✅ Importación de facturas: XML CFDI y PDF con IA, con revisión obligatoria
4. Estadísticas, sincronización a Supabase y PWA del dueño
5. Puesta en marcha: catálogo real, etiquetas, respaldos y capacitación

## Grafo de conocimiento del código (Graphify)

El proyecto usa [Graphify](https://github.com/graphify-labs/graphify) para mapear el código (funciones, módulos y sus relaciones). Se versionan `graphify-out/graph.json` y `graphify-out/GRAPH_REPORT.md`.

```bash
pip install graphifyy          # el paquete de PyPI se llama "graphifyy" (doble y)
graphify update .              # reconstruye el grafo solo con AST: sin LLM y sin costo
graphify explain "crearApp"    # explica un nodo y sus vecinos
graphify path "crearApp" "ventaService"
```

Vuelve a ejecutar `graphify update .` después de cambiar código (o instala su hook de git con `graphify hook install`).
