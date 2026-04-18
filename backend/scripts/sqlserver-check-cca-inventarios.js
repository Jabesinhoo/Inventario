require('dotenv').config();
const sql = require('mssql');

async function checkCCAInventarios() {
  const config = {
    user: 'Jabes',
    password: 'Jabes2026',
    server: 'SERTECNO',
    database: 'Melissa_2023',
    options: {
      instanceName: 'WORLDOFFICE14',
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true
    }
  };

  console.log('========================================');
  console.log('🔍 EXPLORANDO CCA_M_Inventarios');
  console.log('========================================\n');

  try {
    const pool = await sql.connect(config);
    console.log('✅ Conectado\n');

    // 1. Ver todas las columnas de la tabla
    console.log('📋 COLUMNAS DE CCA_M_Inventarios:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const columns = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'CCA_M_Inventarios'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.table(columns.recordset);
    
    // 2. Ver datos de ejemplo
    console.log('\n📊 DATOS DE EJEMPLO:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const sample = await pool.request().query(`
      SELECT TOP 5
        IdInventario,
        IdBodegaInventario,
        Cantidad,
        CantInventario,
        CantReal,
        UnidadDeMedida
      FROM [dbo].[CCA_M_Inventarios]
      WHERE Cantidad > 0
    `);
    
    console.table(sample.recordset);
    
    // 3. Ver qué bodegas existen
    console.log('\n🏢 BODEGAS DISPONIBLES:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const bodegas = await pool.request().query(`
      SELECT DISTINCT 
        IdBodegaInventario,
        COUNT(*) as productos
      FROM [dbo].[CCA_M_Inventarios]
      WHERE Cantidad > 0
      GROUP BY IdBodegaInventario
      ORDER BY IdBodegaInventario
    `);
    
    console.table(bodegas.recordset);
    
    // 4. Relacionar con Inventarios para obtener código y descripción
    console.log('\n🔗 RELACIÓN CON PRODUCTOS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const relation = await pool.request().query(`
      SELECT TOP 10
        i.[CódigoInventario] as codigo,
        i.[Descripción] as descripcion,
        c.IdBodegaInventario as bodega,
        c.Cantidad as cantidad,
        c.CantInventario,
        c.CantReal
      FROM [dbo].[CCA_M_Inventarios] c
      JOIN [dbo].[Inventarios] i ON i.IdInventario = c.IdInventario
      WHERE c.Cantidad > 0
      ORDER BY c.Cantidad DESC
    `);
    
    console.table(relation.recordset);
    
    // 5. Verificar si hay diferenciación por tipo de ubicación
    console.log('\n🎯 BUSCANDO EXHIBICIÓN vs BODEGA:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Ver si existe columna TipoUbicacion o similar
    const ubicacionCols = await pool.request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'CCA_M_Inventarios'
        AND (
          LOWER(COLUMN_NAME) LIKE '%ubic%'
          OR LOWER(COLUMN_NAME) LIKE '%tipo%'
          OR LOWER(COLUMN_NAME) LIKE '%exhib%'
        )
    `);
    
    if (ubicacionCols.recordset.length > 0) {
      console.log('Columnas de ubicación encontradas:');
      console.table(ubicacionCols.recordset);
    } else {
      console.log('⚠️ No hay columna explícita de tipo de ubicación');
      console.log('   Posiblemente la diferenciación es por IdBodegaInventario:');
      console.log('   - Una bodega = EXHIBICIÓN');
      console.log('   - Otra bodega = BODEGA');
    }
    
    // 6. Resumen por bodega
    console.log('\n📊 RESUMEN POR BODEGA (cantidades totales):');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const resumenBodega = await pool.request().query(`
      SELECT 
        IdBodegaInventario,
        SUM(Cantidad) as total_cantidad,
        COUNT(DISTINCT IdInventario) as productos
      FROM [dbo].[CCA_M_Inventarios]
      WHERE Cantidad > 0
      GROUP BY IdBodegaInventario
      ORDER BY total_cantidad DESC
    `);
    
    console.table(resumenBodega.recordset);
    
    await pool.close();
    console.log('\n👋 Conexión cerrada');
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

checkCCAInventarios();