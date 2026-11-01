-- Fase 3: importación de facturas (XML CFDI / PDF) con revisión obligatoria.

-- Equivalencia proveedor -> producto, ahora con el FACTOR: cuántas piezas trae cada unidad facturada
-- (el proveedor factura "1 caja" y la tienda vende piezas: factor 24).
ALTER TABLE equivalencias_proveedor ADD COLUMN factor INTEGER NOT NULL DEFAULT 1 CHECK (factor >= 1);
ALTER TABLE equivalencias_proveedor ADD COLUMN descripcion TEXT;      -- cómo lo describe el proveedor (para reconocerla en la lista)
ALTER TABLE equivalencias_proveedor ADD COLUMN actualizado_en TEXT;

-- UUID fiscal de la factura: la misma factura no se registra dos veces (aunque llegue por XML y por PDF).
ALTER TABLE compras ADD COLUMN uuid_cfdi TEXT;
CREATE UNIQUE INDEX ux_compra_uuid ON compras(uuid_cfdi) WHERE uuid_cfdi IS NOT NULL AND estado = 'registrada';

-- Borradores: lo que se leyó del archivo, a la espera de que una persona lo revise y confirme.
CREATE TABLE importaciones (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  fuente         TEXT NOT NULL CHECK (fuente IN ('xml','pdf')),
  archivo_nombre TEXT NOT NULL,
  archivo_ruta   TEXT,                       -- relativa a data/facturas/
  sha256         TEXT NOT NULL,              -- detecta el mismo archivo subido dos veces
  uuid_cfdi      TEXT,
  estado         TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','confirmada','descartada')),
  datos          TEXT NOT NULL,              -- la factura leída, en JSON
  usuario_id     INTEGER REFERENCES usuarios(id),
  creado_en      TEXT NOT NULL,
  resuelta_en    TEXT,
  compra_id      INTEGER REFERENCES compras(id)
);
CREATE INDEX idx_importaciones_estado ON importaciones(estado, id);
CREATE INDEX idx_importaciones_hash ON importaciones(sha256);
