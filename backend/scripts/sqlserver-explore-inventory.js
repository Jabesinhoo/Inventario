require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const sql = require('mssql');

async function exploreInventory() {
  // Configuración básica sin pool
  const config = {
    user: process.env.SQLSERVER_USER,
    password: process.env.SQLSERVER_PASSWORD,
    server: process.env.SQLSERVER_HOST,
    database: process.env.SQLSERVER_DATABASE || 'Melissa_2023',
    options: {
      instanceName: process.env.SQLSERVER_INSTANCE,
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
      connectTimeout: 60000,
      requestTimeout: 60000
    }
  };

  console.log('========================================');
  console.log('🔍 Explorando SQL Server');
  console.log('========================================');
  console.log(`📡 Servidor: ${config.server}`);
  console.log(`🗄️ Instancia: ${config.options.instanceName}`);
  console.log(`💾 Base de datos: ${config.database}`);
  console.log('========================================\n');

  let pool = null;

  try {
    pool = await sql.connect(config);
    console.log('✅ Conexión exitosa!\n');

    // 1. Listar todas las tablas
    console.log('📋 TODAS LAS TABLAS DISPONIBLES:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const tables = await pool.request().query(`
      SELECT 
        TABLE_SCHEMA,
        TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `);
    
    tables.recordset.forEach(t => {
      console.log(`   📁 ${t.TABLE_SCHEMA}.${t.TABLE_NAME}`);
    });
    
    console.log('\n');

    // 2. Buscar tablas relacionadas con inventario/bodega/exhibición
    console.log('🔍 TABLAS RELEVANTES PARA INVENTARIO:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const relevantTables = await pool.request().query(`
      SELECT 
        TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND (
          LOWER(TABLE_NAME) LIKE '%inventario%'
          OR LOWER(TABLE_NAME) LIKE '%bodega%'
          OR LOWER(TABLE_NAME) LIKE '%exhib%'
          OR LOWER(TABLE_NAME) LIKE '%stock%'
          OR LOWER(TABLE_NAME) LIKE '%existencia%'
          OR LOWER(TABLE_NAME) LIKE '%ubicacion%'
        )
      ORDER BY TABLE_NAME
    `);
    
    relevantTables.recordset.forEach(t => {
      console.log(`   📦 ${t.TABLE_NAME}`);
    });
    
    console.log('\n');

    // 3. Ver estructura de "Inventarios - Por Bodega"
    console.log('📊 ESTRUCTURA DE "Inventarios - Por Bodega":');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      const columns = await pool.request().query(`
        SELECT 
          COLUMN_NAME,
          DATA_TYPE,
          IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'Inventarios - Por Bodega'
        ORDER BY ORDINAL_POSITION
      `);
      
      console.table(columns.recordset);
      
      // Datos de ejemplo
      const sample = await pool.request().query(`
        SELECT TOP 5 *
        FROM [dbo].[Inventarios - Por Bodega]
      `);
      
      console.log('\n📋 EJEMPLO DE DATOS:');
      console.table(sample.recordset);
      
    } catch (err) {
      console.log(`⚠️ Error: ${err.message}`);
    }
    
    console.log('\n');

    // 4. Buscar columnas de cantidad
    console.log('🔍 COLUMNAS DE CANTIDAD/EXISTENCIA:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const quantityColumns = await pool.request().query(`
      SELECT 
        TABLE_NAME,
        COLUMN_NAME,
        DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE 
        LOWER(COLUMN_NAME) LIKE '%cant%'
        OR LOWER(COLUMN_NAME) LIKE '%exis%'
        OR LOWER(COLUMN_NAME) LIKE '%stock%'
        OR LOWER(COLUMN_NAME) LIKE '%saldo%'
      ORDER BY TABLE_NAME, COLUMN_NAME
    `);
    
    if (quantityColumns.recordset.length === 0) {
      console.log('   No se encontraron columnas de cantidad');
    } else {
      console.table(quantityColumns.recordset.slice(0, 30));
    }
    
    await pool.close();
    console.log('\n👋 Conexión cerrada');
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('\n💡 Sugerencia: El servidor puede estar usando un puerto diferente');
    console.error('   Prueba con: node scripts/sqlserver-test-connection.js');
  }
}

exploreInventory();