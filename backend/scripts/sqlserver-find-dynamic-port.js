require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const sql = require('mssql');
const dgram = require('dgram');

async function findPortViaBrowser() {
  return new Promise((resolve, reject) => {
    const INSTANCE_NAME = process.env.SQLSERVER_INSTANCE || 'WORLDOFFICE14';
    const SERVER_HOST = process.env.SQLSERVER_HOST || 'SERTECNO';
    const BROWSER_PORT = 1434;
    
    console.log(`🔍 Buscando puerto para instancia ${INSTANCE_NAME} en ${SERVER_HOST}...`);
    
    const client = dgram.createSocket('udp4');
    let resolved = false;
    
    client.on('message', (msg) => {
      if (resolved) return;
      resolved = true;
      client.close();
      
      const response = msg.toString('ucs2');
      const blocks = response.split('\x00\x00\x00\x00');
      
      for (const block of blocks) {
        if (block.includes(INSTANCE_NAME)) {
          // Buscar puerto TCP
          const tcpMatch = block.match(/tcp\s*(\d+)/i);
          if (tcpMatch) {
            resolve(tcpMatch[1]);
            return;
          }
        }
      }
      reject(new Error(`No se encontró puerto para ${INSTANCE_NAME}`));
    });
    
    client.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      client.close();
      reject(err);
    });
    
    const message = Buffer.from([0x03]);
    client.send(message, 0, message.length, BROWSER_PORT, SERVER_HOST, (err) => {
      if (err && !resolved) {
        resolved = true;
        client.close();
        reject(err);
      }
    });
    
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        client.close();
        reject(new Error('Timeout'));
      }
    }, 3000);
  });
}

async function testWithDynamicPort() {
  const INSTANCE_NAME = process.env.SQLSERVER_INSTANCE || 'WORLDOFFICE14';
  const SERVER_HOST = process.env.SQLSERVER_HOST || 'SERTECNO';
  
  try {
    // Primero intentar con conexión directa por instancia (funcionó antes)
    console.log('========================================');
    console.log('🔍 Probando conexión con instancia nombrada');
    console.log('========================================');
    
    const config = {
      user: process.env.SQLSERVER_USER,
      password: process.env.SQLSERVER_PASSWORD,
      server: SERVER_HOST,
      database: process.env.SQLSERVER_DATABASE || 'Melissa_2023',
      options: {
        instanceName: INSTANCE_NAME,
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
      },
      connectionTimeout: 30000,
      requestTimeout: 30000
    };
    
    console.log(`📡 Servidor: ${config.server}`);
    console.log(`🗄️ Instancia: ${config.options.instanceName}`);
    console.log(`💾 Base de datos: ${config.database}`);
    console.log('========================================\n');
    
    const pool = await sql.connect(config);
    console.log('✅ Conexión exitosa con instancia nombrada!\n');
    
    // Obtener información
    const result = await pool.request().query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN [Activo] = 1 THEN 1 ELSE 0 END) as activos
      FROM [dbo].[Inventarios]
    `);
    
    console.log(`📊 Estadísticas:`);
    console.log(`   Total productos: ${result.recordset[0].total}`);
    console.log(`   Productos activos: ${result.recordset[0].activos}`);
    
    // Buscar tablas de bodega/exhibición
    console.log('\n🔍 Buscando tablas de inventario por ubicación...');
    
    const tables = await pool.request().query(`
      SELECT 
        TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND TABLE_NAME LIKE '%Bodega%'
        OR TABLE_NAME LIKE '%Exhib%'
        OR TABLE_NAME LIKE '%Ubicacion%'
      ORDER BY TABLE_NAME
    `);
    
    if (tables.recordset.length > 0) {
      console.log('📋 Tablas encontradas:');
      for (const t of tables.recordset) {
        console.log(`   - ${t.TABLE_NAME}`);
        
        // Ver columnas de cada tabla
        const columns = await pool.request().query(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = '${t.TABLE_NAME}'
          ORDER BY ORDINAL_POSITION
        `);
        
        console.log(`     Columnas: ${columns.recordset.map(c => c.COLUMN_NAME).join(', ')}`);
        
        // Mostrar ejemplo
        const sample = await pool.request().query(`
          SELECT TOP 3 * FROM [dbo].[${t.TABLE_NAME}]
        `);
        if (sample.recordset.length > 0) {
          console.log(`     Ejemplo:`, sample.recordset[0]);
        }
      }
    } else {
      console.log('   No se encontraron tablas adicionales');
    }
    
    await pool.close();
    console.log('\n👋 Conexión cerrada');
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    
    // Intentar descubrir puerto dinámico
    console.log('\n🔍 Intentando descubrir puerto dinámico...');
    try {
      const port = await findPortViaBrowser();
      console.log(`✅ Puerto dinámico encontrado: ${port}`);
      console.log(`\n📝 Puedes usar esta configuración en .env:`);
      console.log(`SQLSERVER_HOST=${SERVER_HOST}`);
      console.log(`SQLSERVER_PORT=${port}`);
      console.log(`SQLSERVER_DATABASE=Melissa_2023`);
      console.log(`# Elimina SQLSERVER_INSTANCE`);
    } catch (err) {
      console.log('❌ No se pudo descubrir el puerto:', err.message);
    }
  }
}

testWithDynamicPort();