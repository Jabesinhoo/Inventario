require('dotenv').config();
const sql = require('mssql');

async function simpleQuery() {
  // Configuración directa sin pool
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
      connectTimeout: 60000,
      requestTimeout: 60000
    }
  };

  console.log('🔌 Conectando a SQL Server...');
  console.log(`   Servidor: ${config.server}\\${config.options.instanceName}`);
  console.log(`   Base de datos: ${config.database}`);
  
  let pool = null;
  
  try {
    pool = await sql.connect(config);
    console.log('✅ Conectado!\n');
    
    // 1. Contar productos
    const countResult = await pool.request().query(`
      SELECT COUNT(*) as total FROM [dbo].[Inventarios]
    `);
    console.log(`📦 Total productos: ${countResult.recordset[0].total}\n`);
    
    // 2. Ver tabla Temp_MaterialRequeridoPorBodegas
    console.log('📊 Temp_MaterialRequeridoPorBodegas:');
    const tempResult = await pool.request().query(`
      SELECT TOP 5 
        IdInventarioAsociado,
        SumaDeExistencia,
        Bodega
      FROM [dbo].[Temp_MaterialRequeridoPorBodegas]
    `);
    
    if (tempResult.recordset.length > 0) {
      console.table(tempResult.recordset);
      
      // Resumen por bodega
      const summary = await pool.request().query(`
        SELECT 
          Bodega,
          SUM(SumaDeExistencia) as total,
          COUNT(*) as items
        FROM [dbo].[Temp_MaterialRequeridoPorBodegas]
        GROUP BY Bodega
      `);
      
      console.log('\n📊 Resumen por ubicación:');
      console.table(summary.recordset);
    } else {
      console.log('   No hay datos en esta tabla');
    }
    
    // 3. Buscar otras tablas con existencias
    console.log('\n🔍 Otras tablas con columnas de cantidad:');
    const tablesResult = await pool.request().query(`
      SELECT DISTINCT 
        TABLE_NAME,
        COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE 
        LOWER(COLUMN_NAME) LIKE '%exis%'
        OR LOWER(COLUMN_NAME) LIKE '%stock%'
        OR LOWER(COLUMN_NAME) LIKE '%saldo%'
      ORDER BY TABLE_NAME
    `);
    
    const uniqueTables = [...new Map(tablesResult.recordset.map(r => [r.TABLE_NAME, r.COLUMN_NAME])).entries()];
    for (const [tableName, colName] of uniqueTables.slice(0, 10)) {
      console.log(`   📁 ${tableName} → ${colName}`);
    }
    
    await pool.close();
    console.log('\n👋 Desconectado');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\n💡 Posibles soluciones:');
    console.error('   1. Ejecuta: ping SERTECNO (debe responder)');
    console.error('   2. Verifica que SQL Server Browser esté corriendo');
    console.error('   3. Prueba con IP: 10.90.64.200');
  }
}

simpleQuery();