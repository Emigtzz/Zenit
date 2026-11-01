-- Fase 2: corte de caja.
-- Un corte = un turno de la caja (un solo cajón). Las ventas se ligan al corte abierto al momento de cobrar.

ALTER TABLE cortes_caja ADD COLUMN usuario_apertura_id INTEGER REFERENCES usuarios(id);
ALTER TABLE cortes_caja ADD COLUMN usuario_cierre_id INTEGER REFERENCES usuarios(id);
ALTER TABLE cortes_caja ADD COLUMN notas TEXT;
-- Foto de los totales al cerrar: un corte cerrado no cambia aunque después cambie algo más.
ALTER TABLE cortes_caja ADD COLUMN num_ventas INTEGER;
ALTER TABLE cortes_caja ADD COLUMN total_ventas INTEGER;
ALTER TABLE cortes_caja ADD COLUMN descuentos INTEGER;
ALTER TABLE cortes_caja ADD COLUMN ventas_efectivo INTEGER;
ALTER TABLE cortes_caja ADD COLUMN ventas_tarjeta INTEGER;
ALTER TABLE cortes_caja ADD COLUMN ventas_transferencia INTEGER;
ALTER TABLE cortes_caja ADD COLUMN ingresos INTEGER;
ALTER TABLE cortes_caja ADD COLUMN retiros INTEGER;

-- La base misma impide dos cortes abiertos a la vez (índice único parcial sobre "cierre IS NULL").
CREATE UNIQUE INDEX ux_un_corte_abierto ON cortes_caja ((cierre IS NULL)) WHERE cierre IS NULL;

ALTER TABLE ventas ADD COLUMN corte_id INTEGER REFERENCES cortes_caja(id);
CREATE INDEX idx_ventas_corte ON ventas(corte_id);

-- Entradas y salidas de efectivo del cajón que NO son ventas (pago a un proveedor, retiro de dinero, cambio extra).
CREATE TABLE movimientos_caja (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  corte_id   INTEGER NOT NULL REFERENCES cortes_caja(id),
  tipo       TEXT NOT NULL CHECK (tipo IN ('ingreso','retiro')),
  monto      INTEGER NOT NULL CHECK (monto > 0),
  motivo     TEXT NOT NULL,
  fecha      TEXT NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id)
);
CREATE INDEX idx_movcaja_corte ON movimientos_caja(corte_id);
