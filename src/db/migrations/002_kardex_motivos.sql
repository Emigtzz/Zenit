-- Fase 2: los ajustes de inventario llevan MOTIVO (catálogo cerrado) y una NOTA libre.
ALTER TABLE movimientos_inventario ADD COLUMN motivo TEXT;
ALTER TABLE movimientos_inventario ADD COLUMN nota TEXT;
CREATE INDEX idx_mov_fecha ON movimientos_inventario(fecha);
CREATE INDEX idx_mov_tipo ON movimientos_inventario(tipo);
