-- Fase 4: sincronización con la nube (Supabase).

-- Una sola fila. `instalacion_id` identifica ESTA base de datos: si algún día se reinstala la caja con la base vacía
-- (los ids vuelven a empezar en 1), sus ventas nuevas no pisan el historial de la anterior en la nube.
CREATE TABLE sync_estado (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  instalacion_id    TEXT NOT NULL,
  ultimo_intento    TEXT,
  ultimo_exito      TEXT,
  ultimo_error      TEXT,
  error_tipo        TEXT,
  intentos_fallidos INTEGER NOT NULL DEFAULT 0,
  ventas_subidas    INTEGER NOT NULL DEFAULT 0
);
-- UUID versión 4 generado en SQL (SQLite no trae uno): 8-4-4-4-12 hexadecimales con la versión y la variante correctas
INSERT INTO sync_estado (id, instalacion_id) VALUES (1, lower(
  hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
  substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))));

-- Los cortes también se suben (cuando ya están cerrados). Las ventas ya tenían su bandera `sincronizada` desde la fase 1.
ALTER TABLE cortes_caja ADD COLUMN sincronizada INTEGER NOT NULL DEFAULT 0 CHECK (sincronizada IN (0,1));

-- Si algo que ya se subió CAMBIA (una venta que se cancela, un corte que se corrige), vuelve a quedar pendiente solo.
-- La condición `NEW.sincronizada = OLD.sincronizada` evita que el propio acto de marcar "subido" lo reactive.
CREATE TRIGGER ventas_vuelve_a_pendiente AFTER UPDATE ON ventas
WHEN NEW.sincronizada = OLD.sincronizada AND OLD.sincronizada = 1 AND (NEW.estado <> OLD.estado OR NEW.total <> OLD.total OR NEW.fecha <> OLD.fecha)
BEGIN UPDATE ventas SET sincronizada = 0 WHERE id = NEW.id; END;

CREATE TRIGGER cortes_vuelve_a_pendiente AFTER UPDATE ON cortes_caja
WHEN NEW.sincronizada = OLD.sincronizada AND OLD.sincronizada = 1
BEGIN UPDATE cortes_caja SET sincronizada = 0 WHERE id = NEW.id; END;
