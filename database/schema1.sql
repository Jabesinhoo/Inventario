-- Tabla de grupos
CREATE TABLE IF NOT EXISTS grupos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    lider_id INTEGER REFERENCES usuarios(id),
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de miembros de grupo
CREATE TABLE IF NOT EXISTS grupo_miembros (
    id SERIAL PRIMARY KEY,
    grupo_id INTEGER REFERENCES grupos(id) ON DELETE CASCADE,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
    rol VARCHAR(50) DEFAULT 'miembro',
    agregado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(grupo_id, usuario_id)
);

-- Actualizar tabla sesiones_conteo para incluir grupo_id
ALTER TABLE sesiones_conteo ADD COLUMN IF NOT EXISTS grupo_id INTEGER REFERENCES grupos(id);

-- Índices
CREATE INDEX IF NOT EXISTS idx_grupos_lider ON grupos(lider_id);
CREATE INDEX IF NOT EXISTS idx_grupo_miembros_grupo ON grupo_miembros(grupo_id);
CREATE INDEX IF NOT EXISTS idx_grupo_miembros_usuario ON grupo_miembros(usuario_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_grupo ON sesiones_conteo(grupo_id);