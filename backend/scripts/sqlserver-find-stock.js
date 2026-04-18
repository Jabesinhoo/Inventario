require('dotenv').config();
const sql = require('mssql');

async function findRealStock() {
  const config = {
    user: 'Jabes',
    password: 'Jabes2026',
    server: 'SERTECNO',
    database: 'Melissa_2023',
    options: {
      instanceName: 'WORLDOFFICE14',
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true
    },
    connectionTimeout: 60000,
    requestTimeout: 60000
  };

  console.log('========================================');
  console.log('🔍 BUSCANDO EXISTENCIAS REALES');
  console.log('========================================\n');

  try {
    const pool = await sql.connect(config);
    console.log('✅ Conectado\n');

    // 1. Buscar todas las tablas con columnas que parezcan cantidades
    console.log('📋 TABLAS CON POSIBLES CANTIDADES:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const tablesWithStock = await pool.request().query(`
      SELECT DISTINCT
        c.TABLE_NAME,
        c.COLUMN_NAME,
        c.DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS c
      WHERE 
        c.TABLE_NAME LIKE '%Inventario%'
        AND (
          LOWER(c.COLUMN_NAME) LIKE '%cant%'
          OR LOWER(c.COLUMN_NAME) LIKE '%exis%'
          OR LOWER(c.COLUMN_NAME) LIKE '%stock%'
          OR LOWER(c.COLUMN_NAME) LIKE '%saldo%'
          OR LOWER(c.COLUMN_NAME) LIKE '%unidad%'
        )
      ORDER BY c.TABLE_NAME, c.COLUMN_NAME
    `);
    
    for (const table of tablesWithStock.recordset) {
      console.log(`\n📁 ${table.TABLE_NAME}`);
      console.log(`   Columna: ${table.COLUMN_NAME} (${table.DATA_TYPE})`);
      
      // Ver si tiene datos
      try {
        const countResult = await pool.request().query(`
          SELECT COUNT(*) as total 
          FROM [dbo].[${table.TABLE_NAME}] 
          WHERE ${table.COLUMN_NAME} > 0
        `);
        
        if (countResult.recordset[0].total > 0) {
          console.log(`   ✅ ${countResult.recordset[0].total} registros con datos`);
          
          // Mostrar ejemplo
          const sample = await pool.request().query(`
            SELECT TOP 3 
              [IdInventario],
              [CódigoInventario],
              ${table.COLUMN_NAME} as cantidad
            FROM [dbo].[${table.TABLE_NAME}] i
            WHERE ${table.COLUMN_NAME} > 0
          `);
          
          if (sample.recordset.length > 0) {
            console.log('   Ejemplo:');
            sample.recordset.forEach(row => {
              console.log(`     - ${row.CódigoInventario}: ${row.cantidad} unidades`);
            });
          }
        }
      } catch (err) {
        console.log(`   ⚠️ Error: ${err.message}`);
      }
    }
    
    // 2. Buscar tabla específica de Kardex o Movimientos
    console.log('\n🔍 BUSCANDO KARDEX / MOVIMIENTOS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const kardexTables = await pool.request().query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND (
          LOWER(TABLE_NAME) LIKE '%kardex%'
          OR LOWER(TABLE_NAME) LIKE '%movim%'
          OR LOWER(TABLE_NAME) LIKE '%transacc%'
          OR LOWER(TABLE_NAME) LIKE '%entrada%'
          OR LOWER(TABLE_NAME) LIKE '%salida%'
        )
      ORDER BY TABLE_NAME
    `);
    
    for (const table of kardexTables.recordset) {
      console.log(`\n📁 ${table.TABLE_NAME}`);
      
      try {
        const columns = await pool.request().query(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = '${table.TABLE_NAME}'
        `);
        
        console.log(`   Columnas: ${columns.recordset.slice(0, 10).map(c => c.COLUMN_NAME).join(', ')}...`);
        
        const count = await pool.request().query(`SELECT COUNT(*) as total FROM [dbo].[${table.TABLE_NAME}]`);
        console.log(`   Registros: ${count.recordset[0].total}`);
      } catch (err) {
        console.log(`   Error: ${err.message}`);
      }
    }
    
    // 3. Buscar directamente por productos específicos
    console.log('\n🔍 BUSCANDO EXISTENCIA DE PRODUCTOS ESPECÍFICOS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const testProduct = await pool.request().query(`
      SELECT TOP 5 
        [IdInventario],
        [CódigoInventario],
        [Descripción]
      FROM [dbo].[Inventarios]
      WHERE [Activo] = 1
      ORDER BY [IdInventario]
    `);
    
    for (const product of testProduct.recordset) {
      console.log(`\n🔎 Producto: ${product.CódigoInventario} - ${product.Descripción?.substring(0, 30)}`);
      
      // Buscar en todas las tablas candidatas
      for (const table of tablesWithStock.recordset.slice(0, 5)) {
        try {
          const stockQuery = await pool.request().query(`
            SELECT TOP 1 ${table.COLUMN_NAME} as cantidad
            FROM [dbo].[${table.TABLE_NAME}]
            WHERE IdInventario = ${product.IdInventario}
              AND ${table.COLUMN_NAME} IS NOT NULL
          `);
          
          if (stockQuery.recordset.length > 0 && stockQuery.recordset[0].cantidad) {
            console.log(`   📊 ${table.TABLE_NAME}.${table.COLUMN_NAME}: ${stockQuery.recordset[0].cantidad}`);
          }
        } catch (err) {
          // Ignorar errores de columnas
        }
      }
    }
    
    await pool.close();
    console.log('\n👋 Conexión cerrada');
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

findRealStock();