require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const sql = require('mssql');

async function testConnection() {
  const config = {
    user: process.env.SQLSERVER_USER,
    password: process.env.SQLSERVER_PASSWORD,
    server: process.env.SQLSERVER_HOST,
    database: process.env.SQLSERVER_DATABASE || 'Melissa_2023',
    options: {
      instanceName: process.env.SQLSERVER_INSTANCE,
      encrypt: false,
      trustServerCertificate: true
    },
    connectionTimeout: 30000
  };

  console.log('🔍 Probando conexión...');
  console.log(`   Servidor: ${config.server}`);
  console.log(`   Instancia: ${config.options.instanceName}`);
  console.log(`   Base de datos: ${config.database}`);

  try {
    const pool = await sql.connect(config);
    console.log('✅ Conexión exitosa!');
    
    // Consulta simple
    const result = await pool.request().query('SELECT TOP 1 * FROM [dbo].[Inventarios]');
    console.log('📊 Datos de ejemplo:');
    console.log(`   ID: ${result.recordset[0].IdInventario}`);
    console.log(`   Código: ${result.recordset[0]['CódigoInventario']}`);
    console.log(`   Descripción: ${result.recordset[0]['Descripción']?.substring(0, 50)}...`);
    
    await pool.close();
    console.log('👋 Conexión cerrada');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testConnection();