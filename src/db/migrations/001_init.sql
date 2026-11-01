-- Todos los montos son ENTEROS en centavos.
-- Fase 1 usa: categorias, productos, ventas, venta_detalle, pagos, movimientos_inventario.
-- El resto se crea ya (para no migrar después) pero se implementa en fases posteriores.

CREATE TABLE categorias (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre  TEXT NOT NULL UNIQUE,
  color   TEXT NOT NULL DEFAULT '#64748b',
  activo  INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1))
);

CREATE TABLE productos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_barras  TEXT UNIQUE,            -- NULL si el producto no trae código
  codigo_corto   TEXT UNIQUE,            -- código interno, ej. "101"
  nombre         TEXT NOT NULL,
  categoria_id   INTEGER REFERENCES categorias(id),
  costo          INTEGER NOT NULL DEFAULT 0 CHECK (costo >= 0),
  precio         INTEGER NOT NULL CHECK (precio >= 0),
  stock          INTEGER NOT NULL DEFAULT 0,   -- puede quedar negativo si se vende sin existencia registrada
  stock_minimo   INTEGER NOT NULL DEFAULT 0,
  boton_rapido   INTEGER NOT NULL DEFAULT 0 CHECK (boton_rapido IN (0,1)),
  activo         INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado_en      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_productos_categoria ON productos(categoria_id);
CREATE INDEX idx_productos_nombre ON productos(nombre);

-- usuarios se implementa en la fase 2; ventas.usuario_id queda NULL mientras tanto.
CREATE TABLE usuarios (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre          TEXT NOT NULL UNIQUE,
  rol             TEXT NOT NULL CHECK (rol IN ('cajero','dueño')),
  contrasena_hash TEXT NOT NULL
);

CREATE TABLE ventas (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  usuario_id        INTEGER REFERENCES usuarios(id),
  subtotal          INTEGER NOT NULL CHECK (subtotal >= 0),
  descuento_mayoreo INTEGER NOT NULL DEFAULT 0 CHECK (descuento_mayoreo >= 0),
  total             INTEGER NOT NULL CHECK (total >= 0),
  cambio            INTEGER NOT NULL DEFAULT 0 CHECK (cambio >= 0),  -- extra: para reimprimir el ticket
  estado            TEXT NOT NULL DEFAULT 'completada' CHECK (estado IN ('completada','cancelada')),
  sincronizada      INTEGER NOT NULL DEFAULT 0 CHECK (sincronizada IN (0,1)) -- fase 4: subida a Supabase
);
CREATE INDEX idx_ventas_fecha ON ventas(fecha);
CREATE INDEX idx_ventas_pendientes ON ventas(sincronizada) WHERE sincronizada = 0;

CREATE TABLE venta_detalle (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id        INTEGER NOT NULL REFERENCES ventas(id),
  producto_id     INTEGER NOT NULL REFERENCES productos(id),
  cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario INTEGER NOT NULL CHECK (precio_unitario >= 0),  -- COPIA del precio al vender
  importe         INTEGER NOT NULL CHECK (importe >= 0)
);
CREATE INDEX idx_detalle_venta ON venta_detalle(venta_id);

-- monto = lo aplicado a la venta (la suma de pagos de una venta == total).
-- En efectivo NO incluye el cambio devuelto: ese vive en ventas.cambio.
CREATE TABLE pagos (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL REFERENCES ventas(id),
  metodo   TEXT NOT NULL CHECK (metodo IN ('efectivo','tarjeta','transferencia')),
  monto    INTEGER NOT NULL CHECK (monto > 0)
);
CREATE INDEX idx_pagos_venta ON pagos(venta_id);

-- Kárdex. cantidad es CON SIGNO: venta = negativa, compra = positiva, ajuste = +/-, cancelación = positiva.
CREATE TABLE movimientos_inventario (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  tipo        TEXT NOT NULL CHECK (tipo IN ('venta','compra','ajuste','cancelacion')),
  cantidad    INTEGER NOT NULL CHECK (cantidad <> 0),
  referencia  TEXT,
  fecha       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  usuario_id  INTEGER REFERENCES usuarios(id)
);
CREATE INDEX idx_mov_producto ON movimientos_inventario(producto_id, fecha);

-- ===== Tablas de fases posteriores (sin lógica todavía) =====
CREATE TABLE proveedores (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  rfc    TEXT
);
CREATE TABLE compras (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  proveedor_id  INTEGER REFERENCES proveedores(id),
  folio_factura TEXT,
  fecha         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  total         INTEGER NOT NULL DEFAULT 0,
  archivo       TEXT
);
CREATE TABLE compra_detalle (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id      INTEGER NOT NULL REFERENCES compras(id),
  producto_id    INTEGER NOT NULL REFERENCES productos(id),
  cantidad       INTEGER NOT NULL CHECK (cantidad > 0),
  costo_unitario INTEGER NOT NULL CHECK (costo_unitario >= 0)
);
CREATE TABLE equivalencias_proveedor (
  proveedor_id    INTEGER NOT NULL REFERENCES proveedores(id),
  clave_proveedor TEXT NOT NULL,
  producto_id     INTEGER NOT NULL REFERENCES productos(id),
  PRIMARY KEY (proveedor_id, clave_proveedor)
);
CREATE TABLE cortes_caja (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  apertura          TEXT NOT NULL,
  cierre            TEXT,
  fondo_inicial     INTEGER NOT NULL DEFAULT 0,
  efectivo_esperado INTEGER,
  efectivo_contado  INTEGER,
  diferencia        INTEGER
);
