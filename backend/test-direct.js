require('dotenv').config();
const sql = require('mssql');

async function testDirect() {
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
      connectTimeout: 30000,
      requestTimeout: 30000
    }
  };

  console.log('Intentando conectar...');
  console.log(`Servidor: ${config.server}\\${config.options.instanceName}`);
  
  try {
    const pool = await sql.connect(config);
    console.log('✅ CONECTADO!\n');
    
    const result = await pool.request().query('SELECT COUNT(*) as total FROM [dbo].[Inventarios]');
    console.log(`Total productos: ${result.recordset[0].total}`);
    
    await pool.close();
    console.log('\n✅ Desconectado');
    return true;
  } catch (err) {
    console.error('❌ Error:', err.message);
    return false;
  }
}

testDirect();