require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const sql = require('mssql');

async function checkStockTables() {
  // Usar configuración con instancia nombrada (la que funcionó)
  const config = {
    user: process.env.SQLSERVER_USER,
    password: process.env.SQLSERVER_PASSWORD,
    server: 'SERTECNO',  // Usar nombre, no IP
    database: process.env.SQLSERVER_DATABASE || 'Melissa_2023',
    options: {
      instanceName: 'WORLDOFFICE14',
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true
    },
    connectionTimeout: 30000,
    requestTimeout: 60000
  };

  console.log('========================================');
  console.log('🔍 Buscando EXISTENCIAS REALES');
  console.log('========================================');
  console.log(`📡 Servidor: ${config.server}`);
  console.log(`🗄️ Instancia: ${config.options.instanceName}`);
  console.log(`💾 Base de datos: ${config.database}`);
  console.log('========================================\n');

  try {
    const pool = await sql.connect(config);
    console.log('✅ Conectado exitosamente\n');

    // 1. Ver la estructura de Temp_MaterialRequeridoPorBodegas
    console.log('📊 TABLA: Temp_MaterialRequeridoPorBodegas');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      const tempData = await pool.request().query(`
        SELECT TOP 10
          IdInventarioAsociado,
          SubProd,
          CantidadReq,
          SumaDeExistencia,
          Diferencia,
          Bodega,
          Usuario
        FROM [dbo].[Temp_MaterialRequeridoPorBodegas]
      `);
      
      if (tempData.recordset.length > 0) {
        console.log('📋 Datos de existencias:');
        console.table(tempData.recordset);
        
        // Resumen por bodega
        const bodegaSummary = await pool.request().query(`
          SELECT 
            Bodega,
            SUM(SumaDeExistencia) as total_existencia,
            COUNT(DISTINCT IdInventarioAsociado) as productos
          FROM [dbo].[Temp_MaterialRequeridoPorBodegas]
          GROUP BY Bodega
          ORDER BY Bodega
        `);
        
        console.log('\n📊 Resumen por bodega/ubicación:');
        console.table(bodegaSummary.recordset);
      } else {
        console.log('⚠️ No hay datos en Temp_MaterialRequeridoPorBodegas');
      }
    } catch (err) {
      console.log(`⚠️ Error leyendo Temp_MaterialRequeridoPorBodegas: ${err.message}`);
    }
    
    // 2. Buscar otras tablas con existencias
    console.log('\n🔍 BUSCANDO TABLAS CON EXISTENCIAS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const stockTables = await pool.request().query(`
      SELECT DISTINCT
        TABLE_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE 
        LOWER(COLUMN_NAME) LIKE '%existencia%'
        OR LOWER(COLUMN_NAME) LIKE '%stock%'
        OR LOWER(COLUMN_NAME) LIKE '%saldo%'
        OR LOWER(COLUMN_NAME) LIKE '%cantidad%'
      ORDER BY TABLE_NAME
    `);
    
    for (const table of stockTables.recordset) {
      console.log(`\n📁 Tabla: ${table.TABLE_NAME}`);
      
      // Obtener columnas de cantidad
      const columns = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '${table.TABLE_NAME}'
          AND (
            LOWER(COLUMN_NAME) LIKE '%existencia%'
            OR LOWER(COLUMN_NAME) LIKE '%stock%'
            OR LOWER(COLUMN_NAME) LIKE '%saldo%'
            OR LOWER(COLUMN_NAME) LIKE '%cantidad%'
          )
      `);
      
      console.log(`   Columnas de cantidad: ${columns.recordset.map(c => c.COLUMN_NAME).join(', ')}`);
      
      // Mostrar ejemplo
      try {
        const sample = await pool.request().query(`SELECT TOP 3 * FROM [dbo].[${table.TABLE_NAME}]`);
        if (sample.recordset.length > 0) {
          console.log('   Ejemplo (primer registro):');
          const firstRow = sample.recordset[0];
          // Mostrar solo propiedades relevantes
          const relevant = {};
          for (const key of Object.keys(firstRow)) {
            if (key.toLowerCase().includes('inventario') || 
                key.toLowerCase().includes('codigo') ||
                key.toLowerCase().includes('existencia') ||
                key.toLowerCase().includes('cantidad') ||
                key.toLowerCase().includes('bodega')) {
              relevant[key] = firstRow[key];
            }
          }
          console.log('   ', JSON.stringify(relevant, null, 2).substring(0, 300));
        }
      } catch (err) {
        console.log(`   Error: ${err.message}`);
      }
    }
    
    // 3. Buscar relación directa con Inventarios
    console.log('\n🔍 RELACIÓN INVENTARIOS CON EXISTENCIAS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Buscar si hay una tabla de Kardex o Movimientos
    const kardexTables = await pool.request().query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND (
          LOWER(TABLE_NAME) LIKE '%kardex%'
          OR LOWER(TABLE_NAME) LIKE '%movim%'
          OR LOWER(TABLE_NAME) LIKE '%transacc%'
        )
    `);
    
    if (kardexTables.recordset.length > 0) {
      console.log('📋 Posibles tablas de movimientos:');
      kardexTables.recordset.forEach(t => console.log(`   - ${t.TABLE_NAME}`));
    } else {
      console.log('⚠️ No se encontraron tablas de movimientos/kardex');
    }
    
    await pool.close();
    console.log('\n👋 Conexión cerrada');
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('\n💡 Sugerencia: Verifica que el servidor SERTECNO esté accesible');
  }
}

checkStockTables();