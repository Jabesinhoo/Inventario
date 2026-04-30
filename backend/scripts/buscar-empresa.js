// scripts/buscar-empresa.js
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

async function buscarEmpresa() {
  console.log('========================================');
  console.log('🔍 BUSCANDO NOMBRE DE EMPRESA');
  console.log('========================================\n');

  try {
    const pool = await sql.connect(config);
    console.log('✅ Conectado a SQL Server\n');

    // Buscar tablas que contengan la palabra Empresa
    console.log('📋 Tablas con "Empresa" en el nombre:');
    const tablasEmpresa = await pool.request().query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND TABLE_NAME LIKE '%Empresa%'
      ORDER BY TABLE_NAME
    `);
    
    console.table(tablasEmpresa.recordset);

    // Buscar tablas con "Configuracion" o "Datos"
    console.log('\n📋 Tablas de configuración:');
    const tablasConfig = await pool.request().query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND (TABLE_NAME LIKE '%Config%' OR TABLE_NAME LIKE '%Param%' OR TABLE_NAME LIKE '%Datos%')
      ORDER BY TABLE_NAME
    `);
    
    console.table(tablasConfig.recordset.slice(0, 20));

    // Buscar columnas que contengan "NombreEmpresa" o similar
    console.log('\n🔍 Columnas con "Empresa" en el nombre:');
    const columnasEmpresa = await pool.request().query(`
      SELECT 
        TABLE_NAME,
        COLUMN_NAME,
        DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE COLUMN_NAME LIKE '%Empresa%'
         OR COLUMN_NAME LIKE '%Nombre%'
      ORDER BY TABLE_NAME, COLUMN_NAME
    `);
    
    console.table(columnasEmpresa.recordset.slice(0, 30));

    // Si encontramos una tabla, mostrar sus datos
    if (tablasEmpresa.recordset.length > 0) {
      const tablaNombre = tablasEmpresa.recordset[0].TABLE_NAME;
      console.log(`\n📊 Datos de tabla ${tablaNombre}:`);
      const datos = await pool.request().query(`SELECT TOP 5 * FROM ${tablaNombre}`);
      console.table(datos.recordset);
    }

    // También buscar en la tabla de parámetros generales
    console.log('\n📊 Buscando en tablas de parámetros...');
    const tablasSistema = await pool.request().query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND (TABLE_NAME LIKE '%Param%' OR TABLE_NAME LIKE '%Sistema%')
    `);
    
    for (const tabla of tablasSistema.recordset.slice(0, 5)) {
      console.log(`\n📦 Tabla: ${tabla.TABLE_NAME}`);
      const datos = await pool.request().query(`SELECT TOP 3 * FROM ${tabla.TABLE_NAME}`);
      console.table(datos.recordset);
    }

    await pool.close();
    console.log('\n👋 Conexión cerrada');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

buscarEmpresa();