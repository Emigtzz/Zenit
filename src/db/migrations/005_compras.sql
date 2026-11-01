-- Fase 2: compras manuales y proveedores.
ALTER TABLE proveedores ADD COLUMN activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1));
CREATE UNIQUE INDEX ux_proveedores_nombre ON proveedores(nombre COLLATE NOCASE);

ALTER TABLE compras ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id);
ALTER TABLE compras ADD COLUMN estado TEXT NOT NULL DEFAULT 'registrada' CHECK (estado IN ('registrada','anulada'));
ALTER TABLE compras ADD COLUMN notas TEXT;
ALTER TABLE compras ADD COLUMN pagada_de_caja INTEGER NOT NULL DEFAULT 0 CHECK (pagada_de_caja IN (0,1));
ALTER TABLE compras ADD COLUMN anulada_en TEXT;
ALTER TABLE compras ADD COLUMN anulada_por INTEGER REFERENCES usuarios(id);
ALTER TABLE compras ADD COLUMN motivo_anulacion TEXT;

-- La misma factura no se captura dos veces para el mismo proveedor (si se anula, ya puede volver a capturarse).
CREATE UNIQUE INDEX ux_compra_folio ON compras(proveedor_id, folio_factura)
  WHERE folio_factura IS NOT NULL AND estado = 'registrada';
CREATE INDEX idx_compras_fecha ON compras(fecha);
CREATE INDEX idx_compradet_producto ON compra_detalle(producto_id);
