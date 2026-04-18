require('dotenv').config();
const sql = require('mssql');

async function ipQuery() {
  // Primero obtener la IP real
  const { exec } = require('child_process');
  
  exec('ping -4 SERTECNO -n 1', async (error, stdout) => {
    let serverIP = 'SERTECNO';
    
    // Extraer IP del ping
    const ipMatch = stdout.match(/\d+\.\d+\.\d+\.\d+/);
    if (ipMatch) {
      serverIP = ipMatch[0];
      console.log(`📍 IP detectada: ${serverIP}\n`);
    }
    
    const config = {
      user: 'Jabes',
      password: 'Jabes2026',
      server: serverIP,
      database: 'Melissa_2023',
      port: 1433,
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
      },
      connectionTimeout: 30000
    };
    
    console.log(`🔌 Conectando a ${config.server}:${config.port}...`);
    
    try {
      const pool = await sql.connect(config);
      console.log('✅ Conectado!\n');
      
      const result = await pool.request().query(`
        SELECT TOP 3 
          [IdInventario],
          [CódigoInventario],
          [Descripción]
        FROM [dbo].[Inventarios]
      `);
      
      console.log('📊 Productos:');
      console.table(result.recordset);
      
      await pool.close();
      
    } catch (err) {
      console.error('❌ Error:', err.message);
    }
  });
}

ipQuery();