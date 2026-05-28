'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS sku_etiquetas (
        id SERIAL PRIMARY KEY,
        sku VARCHAR(80) NOT NULL,
        nombre VARCHAR(100) NOT NULL DEFAULT 'Muchos stickers',
        color VARCHAR(30) NOT NULL DEFAULT '#dc2626',
        nota TEXT NULL,
        activo BOOLEAN NOT NULL DEFAULT true,
        "creadoPorId" INTEGER NULL,
        "actualizadoPorId" INTEGER NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE sku_etiquetas
      ADD COLUMN IF NOT EXISTS sku VARCHAR(80);

      ALTER TABLE sku_etiquetas
      ADD COLUMN IF NOT EXISTS nombre VARCHAR(100) DEFAULT 'Muchos stickers';

      ALTER TABLE sku_etiquetas
      ADD COLUMN IF NOT EXISTS color VARCHAR(30) DEFAULT '#dc2626';

      ALTER TABLE sku_etiquetas
      ADD COLUMN IF NOT EXISTS nota TEXT;

      ALTER TABLE sku_etiquetas
      ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true;

      ALTER TABLE sku_etiquetas
      ADD COLUMN IF NOT EXISTS "creadoPorId" INTEGER;

      ALTER TABLE sku_etiquetas
      ADD COLUMN IF NOT EXISTS "actualizadoPorId" INTEGER;

      ALTER TABLE sku_etiquetas
      ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT NOW();

      ALTER TABLE sku_etiquetas
      ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();
    `);

    await queryInterface.sequelize.query(`
      UPDATE sku_etiquetas
      SET
        sku = TRIM(sku::text),
        nombre = COALESCE(NULLIF(TRIM(nombre::text), ''), 'Muchos stickers'),
        color = COALESCE(NULLIF(TRIM(color::text), ''), '#dc2626'),
        activo = COALESCE(activo, true),
        "createdAt" = COALESCE("createdAt", NOW()),
        "updatedAt" = COALESCE("updatedAt", NOW())
      WHERE sku IS NOT NULL;
    `);

    await queryInterface.sequelize.query(`
      DELETE FROM sku_etiquetas
      WHERE sku IS NULL
         OR TRIM(sku::text) = '';
    `);

    await queryInterface.sequelize.query(`
      WITH duplicados AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY sku, nombre
            ORDER BY "updatedAt" DESC, id DESC
          ) AS rn
        FROM sku_etiquetas
      )
      DELETE FROM sku_etiquetas
      WHERE id IN (
        SELECT id
        FROM duplicados
        WHERE rn > 1
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sku_etiquetas_sku_nombre
      ON sku_etiquetas (sku, nombre);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_sku_etiquetas_sku
      ON sku_etiquetas (sku);

      CREATE INDEX IF NOT EXISTS idx_sku_etiquetas_sku_activo
      ON sku_etiquetas (sku, activo);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_sku_etiquetas_sku_activo;
      DROP INDEX IF EXISTS idx_sku_etiquetas_sku;
      DROP INDEX IF EXISTS uq_sku_etiquetas_sku_nombre;
      DROP TABLE IF EXISTS sku_etiquetas;
    `);
  }
};