require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const sql = require('mssql');

// La IP que obtuviste del ping
const SERVER_IP = '10.90.64.200'; // Cambia por la IP real

async function testConnection() {
  // Configuración usando IP y puerto 1433
  const config = {
    user: process.env.SQLSERVER_USER,
    password: process.env.SQLSERVER_PASSWORD,
    server: SERVER_IP,
    port: 1433,
    database: process.env.SQLSERVER_DATABASE || 'Melissa_2023',
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true
    },
    connectionTimeout: 30000,
    requestTimeout: 30000
  };

  console.log('========================================');
  console.log('🔍 Probando conexión a SQL Server');
  console.log('========================================');
  console.log(`📡 Servidor IP: ${config.server}`);
  console.log(`🔌 Puerto: ${config.port}`);
  console.log(`💾 Base de datos: ${config.database}`);
  console.log(`👤 Usuario: ${config.user}`);
  console.log('========================================\n');

  try {
    const pool = await sql.connect(config);
    console.log('✅ Conexión exitosa!\n');
    
    // Consulta simple
    const result = await pool.request().query(`
      SELECT TOP 3 
        [IdInventario],
        [CódigoInventario] as codigo,
        [Descripción] as descripcion
      FROM [dbo].[Inventarios]
    `);
    
    console.log('📊 Datos de ejemplo:');
    console.table(result.recordset);
    
    // Contar total
    const countResult = await pool.request().query(`
      SELECT COUNT(*) as total FROM [dbo].[Inventarios]
    `);
    
    console.log(`\n📦 Total de productos: ${countResult.recordset[0].total}`);
    
    // Buscar tablas de bodega/exhibición
    console.log('\n🔍 Buscando tablas con cantidades...');
    
    const tablesResult = await pool.request().query(`
      SELECT 
        TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND (
          LOWER(TABLE_NAME) LIKE '%bodega%'
          OR LOWER(TABLE_NAME) LIKE '%exhib%'
          OR LOWER(TABLE_NAME) LIKE '%stock%'
          OR LOWER(TABLE_NAME) LIKE '%existencia%'
        )
      ORDER BY TABLE_NAME
    `);
    
    if (tablesResult.recordset.length > 0) {
      console.log('📋 Tablas encontradas:');
      tablesResult.recordset.forEach(t => {
        console.log(`   - ${t.TABLE_NAME}`);
      });
    } else {
      console.log('   No se encontraron tablas adicionales');
    }
    
    await pool.close();
    console.log('\n👋 Conexión cerrada');
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
  }
}

testConnection();