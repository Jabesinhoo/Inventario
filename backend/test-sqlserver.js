require('dotenv').config();
const sql = require('mssql');

const config = {
  user: process.env.SQLSERVER_USER,
  password: process.env.SQLSERVER_PASSWORD,
  server: process.env.SQLSERVER_HOST,
  database: process.env.SQLSERVER_DATABASE || 'Melissa_2023',
  options: {
    instanceName: process.env.SQLSERVER_INSTANCE,
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  },
  connectionTimeout: 30000,
  requestTimeout: 30000
};

async function test() {
  console.log('========================================');
  console.log('🔍 Probando conexión a SQL Server');
  console.log('========================================');
  console.log(`📡 Servidor: ${config.server}`);
  console.log(`🗄️ Instancia: ${config.options.instanceName}`);
  console.log(`💾 Base de datos: ${config.database}`);
  console.log(`👤 Usuario: ${config.user}`);
  console.log('========================================\n');

  let pool = null;

  try {
    pool = await sql.connect(config);
    console.log('✅ Conexión exitosa a SQL Server!\n');
    
    // Probar consulta
    const result = await pool.request().query(`
      SELECT TOP 5 
        [IdInventario],
        [CódigoInventario] as codigo,
        [Descripción] as descripcion
      FROM [dbo].[Inventarios]
    `);
    
    console.log('📊 Datos de prueba:');
    console.table(result.recordset);
    
    // Contar total
    const countResult = await pool.request().query(`
      SELECT COUNT(*) as total FROM [dbo].[Inventarios]
    `);
    
    console.log(`\n📦 Total de productos en catálogo: ${countResult.recordset[0].total}`);
    
    await pool.close();
    console.log('\n👋 Conexión cerrada');
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('\n🔧 Posibles soluciones:');
    console.error('   1. Verifica que SQL Server Browser esté corriendo en el servidor');
    console.error('   2. Verifica que el firewall permita UDP 1434 (SQL Browser)');
    console.error('   3. Confirma que la instancia WORLDOFFICE14 existe');
    console.error('   4. Pide al administrador que configure un puerto fijo para la instancia');
  }
}

test();