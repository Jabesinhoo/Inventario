-- ===== ZONAS =====
CREATE TABLE IF NOT EXISTS zonas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    descripcion TEXT,
    ubicacion VARCHAR(200),
    area VARCHAR(100),
    orden INTEGER DEFAULT 0,
    activo BOOLEAN DEFAULT true,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== GRUPOS =====
CREATE TABLE IF NOT EXISTS grupos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    descripcion TEXT,
    lider_id INTEGER REFERENCES usuarios(id),
    color VARCHAR(7) DEFAULT '#667eea',
    activo BOOLEAN DEFAULT true,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== MIEMBROS DE GRUPO =====
CREATE TABLE IF NOT EXISTS grupo_miembros (
    id SERIAL PRIMARY KEY,
    grupo_id INTEGER REFERENCES grupos(id) ON DELETE CASCADE,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
    rol VARCHAR(50) DEFAULT 'miembro',
    agregado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(grupo_id, usuario_id)
);

-- ===== ASIGNACIONES DE INVENTARIO =====
CREATE TABLE IF NOT EXISTS asignaciones_inventario (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    fecha DATE NOT NULL,
    grupo_id INTEGER REFERENCES grupos(id),
    zona_id INTEGER REFERENCES zonas(id),
    hora_inicio TIME,
    hora_fin TIME,
    estado VARCHAR(20) DEFAULT 'pendiente',
    observaciones TEXT,
    creado_por INTEGER REFERENCES usuarios(id),
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== CONTEOS POR ASIGNACIÓN =====
ALTER TABLE sesiones_conteo ADD COLUMN IF NOT EXISTS asignacion_id INTEGER REFERENCES asignaciones_inventario(id);
ALTER TABLE sesiones_conteo ADD COLUMN IF NOT EXISTS zona_id INTEGER REFERENCES zonas(id);
ALTER TABLE sesiones_conteo ADD COLUMN IF NOT EXISTS grupo_id INTEGER REFERENCES grupos(id);

-- ===== ÍNDICES =====
CREATE INDEX IF NOT EXISTS idx_zonas_codigo ON zonas(codigo);
CREATE INDEX IF NOT EXISTS idx_grupos_codigo ON grupos(codigo);
CREATE INDEX IF NOT EXISTS idx_asignaciones_fecha ON asignaciones_inventario(fecha);
CREATE INDEX IF NOT EXISTS idx_asignaciones_grupo ON asignaciones_inventario(grupo_id);
CREATE INDEX IF NOT EXISTS idx_asignaciones_zona ON asignaciones_inventario(zona_id);
CREATE INDEX IF NOT EXISTS idx_asignaciones_estado ON asignaciones_inventario(estado);

-- ===== INSERTAR DATOS DE EJEMPLO =====
-- Zonas
INSERT INTO zonas (nombre, codigo, descripcion, orden) VALUES
('Zona Norte', 'Z-NORTE-01', 'Pasillos 1 al 5', 1),
('Zona Sur', 'Z-SUR-01', 'Pasillos 6 al 10', 2),
('Zona Este', 'Z-ESTE-01', 'Pasillos 11 al 15', 3),
('Zona Oeste', 'Z-OESTE-01', 'Pasillos 16 al 20', 4),
('Bodega Principal', 'Z-BOD-01', 'Almacén principal', 5)
ON CONFLICT (codigo) DO NOTHING;

-- Grupos ejemplo
INSERT INTO grupos (nombre, codigo, descripcion, color) VALUES
('Equipo Alpha', 'G-ALPHA-01', 'Equipo de conteo rápido', '#48bb78'),
('Equipo Beta', 'G-BETA-01', 'Equipo de verificación', '#4299e1'),
('Equipo Gamma', 'G-GAMMA-01', 'Equipo de respaldo', '#ed8936')
ON CONFLICT (codigo) DO NOTHING;