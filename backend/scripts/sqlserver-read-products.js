require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const sql = require('mssql');

async function readProductsFromSQLServer() {
  console.log('\n🔍 Conectando a SQL Server...');
  console.log(`📡 Servidor: ${process.env.SQLSERVER_HOST}`);
  console.log(`🗄️ Instancia: ${process.env.SQLSERVER_INSTANCE}`);
  console.log(`💾 Base de datos: ${process.env.SQLSERVER_DATABASE || 'Melissa_2023'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

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

  let pool = null;

  try {
    pool = await sql.connect(config);
    console.log('✅ Conexión exitosa a SQL Server\n');

    // Leer datos de la tabla Inventarios (solo las columnas útiles)
    console.log('📊 PRODUCTOS EN INVENTARIO:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const inventariosResult = await pool.request().query(`
      SELECT 
        [IdInventario],
        [CódigoInventario] as codigo,
        [CodigoBarras] as codigo_barra,
        [Descripción] as descripcion,
        [Nombre_Generico] as nombre_generico,
        [Activo] as activo
      FROM [dbo].[Inventarios]
      WHERE [Activo] = 1 OR [Activo] = 0
      ORDER BY [CódigoInventario]
    `);
    
    console.log(`📦 Total de productos: ${inventariosResult.recordset.length}\n`);
    
    // Mostrar primeros 20
    console.log('📋 Primeros 20 productos:');
    console.table(inventariosResult.recordset.slice(0, 20));
    
    // Mostrar estadísticas
    const activos = inventariosResult.recordset.filter(p => p.activo === 1 || p.activo === true).length;
    const inactivos = inventariosResult.recordset.filter(p => p.activo === 0 || p.activo === false || p.activo === -1).length;
    
    console.log('\n📊 ESTADÍSTICAS:');
    console.log(`   ✅ Activos: ${activos}`);
    console.log(`   ❌ Inactivos: ${inactivos}`);
    
    // Verificar si hay existencia real en alguna columna
    console.log('\n🔍 BUSCANDO EXISTENCIAS REALES:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Buscar tablas con existencias
    const tablasResult = await pool.request().query(`
      SELECT 
        TABLE_NAME,
        COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE 
        LOWER(COLUMN_NAME) LIKE '%existencia%'
        OR LOWER(COLUMN_NAME) LIKE '%stock%'
        OR LOWER(COLUMN_NAME) LIKE '%saldo%'
        OR LOWER(COLUMN_NAME) LIKE '%cantidad%'
      ORDER BY TABLE_NAME
    `);
    
    if (tablasResult.recordset.length > 0) {
      console.log('📋 Tablas con columnas de existencia/stock:');
      console.table(tablasResult.recordset);
    } else {
      console.log('⚠️ No se encontraron columnas de existencia real');
      console.log('   La tabla "Inventarios" parece ser solo catálogo.');
      console.log('   Para el conteo inicial, usaremos cantidad 0 como base.');
    }
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
  } finally {
    if (pool) {
      await pool.close();
      console.log('\n👋 Conexión cerrada');
    }
  }
}

readProductsFromSQLServer();