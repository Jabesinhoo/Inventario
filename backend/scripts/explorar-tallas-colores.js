// scripts/explorar-tallas-colores.js
require('dotenv').config();
const sql = require('mssql');

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
    connectTimeout: 60000,
    requestTimeout: 120000
  }
};

async function explorarTallasColores() {
  console.log('========================================');
  console.log('🔍 EXPLORANDO TABLAS DE TALLAS Y COLORES');
  console.log('========================================\n');

  try {
    const pool = await sql.connect(config);
    console.log('✅ Conectado a SQL Server\n');

    // 1. Explorar Inventarios_Tallas
    console.log('📦 TABLA: Inventarios_Tallas');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      const tallasCols = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'Inventarios_Tallas'
        ORDER BY ORDINAL_POSITION
      `);
      
      console.log('Columnas:');
      console.table(tallasCols.recordset);
      
      const tallasSample = await pool.request().query(`
        SELECT TOP 5 *
        FROM Inventarios_Tallas
      `);
      
      if (tallasSample.recordset.length > 0) {
        console.log('\nDatos ejemplo:');
        console.table(tallasSample.recordset);
      } else {
        console.log('\n⚠️ No hay datos en Inventarios_Tallas');
      }
    } catch (err) {
      console.log('❌ Error con Inventarios_Tallas:', err.message);
    }

    // 2. Explorar Inventarios_Tallas_Detalles
    console.log('\n📦 TABLA: Inventarios_Tallas_Detalles');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      const tallasDetCols = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'Inventarios_Tallas_Detalles'
        ORDER BY ORDINAL_POSITION
      `);
      
      console.log('Columnas:');
      console.table(tallasDetCols.recordset);
      
      const tallasDetSample = await pool.request().query(`
        SELECT TOP 5 *
        FROM Inventarios_Tallas_Detalles
      `);
      
      if (tallasDetSample.recordset.length > 0) {
        console.log('\nDatos ejemplo:');
        console.table(tallasDetSample.recordset);
      } else {
        console.log('\n⚠️ No hay datos en Inventarios_Tallas_Detalles');
      }
    } catch (err) {
      console.log('❌ Error con Inventarios_Tallas_Detalles:', err.message);
    }

    // 3. Explorar Inventarios_Colores
    console.log('\n📦 TABLA: Inventarios_Colores');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      const coloresCols = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'Inventarios_Colores'
        ORDER BY ORDINAL_POSITION
      `);
      
      console.log('Columnas:');
      console.table(coloresCols.recordset);
      
      const coloresSample = await pool.request().query(`
        SELECT TOP 5 *
        FROM Inventarios_Colores
      `);
      
      if (coloresSample.recordset.length > 0) {
        console.log('\nDatos ejemplo:');
        console.table(coloresSample.recordset);
      } else {
        console.log('\n⚠️ No hay datos en Inventarios_Colores');
      }
    } catch (err) {
      console.log('❌ Error con Inventarios_Colores:', err.message);
    }

    // 4. Explorar Inventarios_Colores_Detalle
    console.log('\n📦 TABLA: Inventarios_Colores_Detalle');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      const coloresDetCols = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'Inventarios_Colores_Detalle'
        ORDER BY ORDINAL_POSITION
      `);
      
      console.log('Columnas:');
      console.table(coloresDetCols.recordset);
      
      const coloresDetSample = await pool.request().query(`
        SELECT TOP 5 *
        FROM Inventarios_Colores_Detalle
      `);
      
      if (coloresDetSample.recordset.length > 0) {
        console.log('\nDatos ejemplo:');
        console.table(coloresDetSample.recordset);
      } else {
        console.log('\n⚠️ No hay datos en Inventarios_Colores_Detalle');
      }
    } catch (err) {
      console.log('❌ Error con Inventarios_Colores_Detalle:', err.message);
    }

    // 5. Ver qué tablas tienen relación con inventarios
    console.log('\n🔗 RELACIÓN CON INVENTARIOS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      // Buscar en CCA_M_Inventarios las columnas de talla/color
      const ccaCols = await pool.request().query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'CCA_M_Inventarios'
          AND (COLUMN_NAME LIKE '%Talla%' OR COLUMN_NAME LIKE '%Color%')
      `);
      
      if (ccaCols.recordset.length > 0) {
        console.log('Columnas en CCA_M_Inventarios:');
        console.table(ccaCols.recordset);
      } else {
        console.log('No hay columnas de Talla/Color en CCA_M_Inventarios');
      }
    } catch (err) {
      console.log('❌ Error:', err.message);
    }

    await pool.close();
    console.log('\n👋 Conexión cerrada');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

explorarTallasColores();