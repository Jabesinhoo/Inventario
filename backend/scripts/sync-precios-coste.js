// scripts/sync-precios-coste.js
require('dotenv').config();
const sql = require('mssql');
const { sequelize, ConteoInicialDetalle } = require('../src/models');

const config = {
  user: 'Jabes',
  password: 'Jabes2026',
  server: 'SERTECNO',
  database: 'Melissa_2023',
  options: {
    instanceName: 'WORLDOFFICE14',
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 120000,
    requestTimeout: 120000
  }
};

async function syncPreciosCoste() {
  console.log('========================================');
  console.log('🔄 SINCRONIZANDO PRECIOS COSTE');
  console.log('========================================\n');

  let pool = null;

  try {
    pool = await sql.connect(config);
    console.log('✅ Conectado a SQL Server\n');

    // Obtener todos los SKU con su precio coste
    const result = await pool.request().query(`
      WITH PrecioCoste AS (
        SELECT 
          i.[CódigoInventario] as sku,
          ISNULL((
            SELECT TOP 1 c.CostoPromedio 
            FROM CCA_M_Inventarios c 
            WHERE c.IdInventario = i.IdInventario 
              AND c.CostoPromedio > 0
            ORDER BY c.IdAsientoContable DESC
          ), 0) as precioCoste,
          g.Descripcion as grupoNombre,
          i.[Descripción] as descripcion
        FROM Inventarios i
        LEFT JOIN [Inventarios - AgrupaciónDos] g ON g.IdGrupoInventarioDos = i.IdGrupoInventarioDos
        WHERE i.Activo = -1
      )
      SELECT * FROM PrecioCoste
      WHERE precioCoste > 0
      ORDER BY sku
    `);

    console.log(`✅ Productos con precio coste encontrados: ${result.recordset.length}\n`);

    let actualizados = 0;
    let noEncontrados = 0;

    for (const row of result.recordset) {
      // Buscar en nuestra BD
      const exists = await ConteoInicialDetalle.findOne({
        where: { sku: row.sku }
      });

      if (exists) {
        await exists.update({
          precioCoste: row.precioCoste,
          grupoNombre: row.grupoNombre || exists.grupoNombre,
          descripcionSnapshot: row.descripcion || exists.descripcionSnapshot
        });
        actualizados++;
        console.log(`✅ Actualizado SKU ${row.sku}: precioCoste = ${row.precioCoste}`);
      } else {
        noEncontrados++;
        console.log(`⚠️ SKU ${row.sku} no encontrado en conteo_inicial_detalle`);
      }
    }

    console.log('\n📊 RESUMEN:');
    console.log(`   - SKU con precio coste en SQL Server: ${result.recordset.length}`);
    console.log(`   - Actualizados en nuestra BD: ${actualizados}`);
    console.log(`   - No encontrados en nuestra BD: ${noEncontrados}`);

    await pool.close();
    console.log('\n👋 Conexión cerrada');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error);
  }
}

syncPreciosCoste();