-- Fase 2: usuarios y roles.
ALTER TABLE usuarios ADD COLUMN activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1));
ALTER TABLE usuarios ADD COLUMN creado_en TEXT;

-- Sesiones en la base (no en memoria): sobreviven a un reinicio del servidor o de la computadora.
-- Se guarda el HASH del token: si alguien copia la base, no puede usar las sesiones.
CREATE TABLE sesiones (
  token_hash       TEXT PRIMARY KEY,
  usuario_id       INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creada_en        TEXT NOT NULL,
  ultima_actividad TEXT NOT NULL
);
CREATE INDEX idx_sesiones_usuario ON sesiones(usuario_id);
