const { sequelize } = require('../src/models');
const { QueryTypes } = require('sequelize');

async function testDiferencias() {
  try {
    await sequelize.authenticate();
    console.log('✅ Conexión a BD establecida\n');

    const inventarioBaseId = 5;
    const inventarioComparadoId = 6;

    // Consulta para obtener diferencias
    const query = `
      WITH 
      -- Última ronda completa del inventario base
      ultima_ronda_base AS (
        SELECT id
        FROM rondas_conteo
        WHERE "inventarioId" = :inventarioBaseId
          AND "tipoRonda" = 'completa'
          AND estado = 'cerrada'
        ORDER BY "numeroRonda" DESC
        LIMIT 1
      ),
      -- Última ronda completa del inventario comparado
      ultima_ronda_comparado AS (
        SELECT id
        FROM rondas_conteo
        WHERE "inventarioId" = :inventarioComparadoId
          AND "tipoRonda" = 'completa'
          AND estado = 'cerrada'
        ORDER BY "numeroRonda" DESC
        LIMIT 1
      ),
      -- SKUs del inventario base
      base_skus AS (
        SELECT 
          l.sku,
          COALESCE(SUM(l.cantidad), 0) as cantidad_base,
          MAX(l."descripcionSnapshot") as descripcion
        FROM lecturas l
        WHERE l."inventarioId" = :inventarioBaseId
          AND l.estado = 'valida'
          AND l.sku IS NOT NULL
          AND l."rondaId" IN (SELECT id FROM ultima_ronda_base)
        GROUP BY l.sku
      ),
      -- SKUs del inventario comparado
      comparado_skus AS (
        SELECT 
          l.sku,
          COALESCE(SUM(l.cantidad), 0) as cantidad_comparada,
          MAX(l."descripcionSnapshot") as descripcion
        FROM lecturas l
        WHERE l."inventarioId" = :inventarioComparadoId
          AND l.estado = 'valida'
          AND l.sku IS NOT NULL
          AND l."rondaId" IN (SELECT id FROM ultima_ronda_comparado)
        GROUP BY l.sku
      ),
      -- Unir todos los SKUs
      todos_skus AS (
        SELECT sku, descripcion FROM base_skus
        UNION
        SELECT sku, descripcion FROM comparado_skus
      )
      SELECT 
        COALESCE(b.sku, c.sku) as sku,
        COALESCE(b.descripcion, c.descripcion) as descripcion,
        COALESCE(b.cantidad_base, 0) as cantidad_base,
        COALESCE(c.cantidad_comparada, 0) as cantidad_comparada,
        (COALESCE(c.cantidad_comparada, 0) - COALESCE(b.cantidad_base, 0)) as diferencia
      FROM todos_skus t
      LEFT JOIN base_skus b ON b.sku = t.sku
      LEFT JOIN comparado_skus c ON c.sku = t.sku
      WHERE COALESCE(b.cantidad_base, 0) != COALESCE(c.cantidad_comparada, 0)
      ORDER BY ABS(COALESCE(c.cantidad_comparada, 0) - COALESCE(b.cantidad_base, 0)) DESC
    `;

    const resultados = await sequelize.query(query, {
      replacements: { inventarioBaseId, inventarioComparadoId },
      type: QueryTypes.SELECT
    });

    console.log(`📊 Total de diferencias encontradas: ${resultados.length}\n`);
    
    if (resultados.length > 0) {
      console.log('TOP 10 diferencias:');
      console.log('='.repeat(80));
      resultados.slice(0, 10).forEach((row, i) => {
        console.log(`${i+1}. SKU: ${row.sku}`);
        console.log(`   Descripción: ${row.descripcion?.substring(0, 60)}...`);
        console.log(`   Base: ${row.cantidad_base} | Comparado: ${row.cantidad_comparada} | Diferencia: ${row.diferencia}`);
        console.log('-'.repeat(40));
      });
    } else {
      console.log('✅ No hay diferencias entre los inventarios');
    }

    await sequelize.close();
    console.log('\n✅ Conexión cerrada');

  } catch (error) {
    console.error('❌ Error:', error);
    await sequelize.close();
  }
}

testDiferencias();