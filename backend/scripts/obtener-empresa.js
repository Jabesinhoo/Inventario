// scripts/obtener-empresa.js
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

async function obtenerEmpresa() {
  console.log('========================================');
  console.log('🔍 OBTENIENDO DATOS DE EMPRESA');
  console.log('========================================\n');

  try {
    const pool = await sql.connect(config);
    console.log('✅ Conectado a SQL Server\n');

    // Ver estructura de la tabla Empresas
    console.log('📋 Estructura de tabla Empresas:');
    const estructura = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Empresas'
      ORDER BY ORDINAL_POSITION
    `);
    console.table(estructura.recordset);

    // Obtener datos de la empresa
    console.log('\n📊 Datos de la empresa:');
    const empresas = await pool.request().query(`
      SELECT TOP 5 * FROM Empresas
    `);
    console.table(empresas.recordset);

    // Identificar la columna que contiene el nombre
    const posiblesColumnasNombre = ['Nombre', 'RazonSocial', 'RazónSocial', 'NombreEmpresa', 'Empresa'];
    let nombreEmpresa = 'Tecnonacho'; // valor por defecto

    for (const columna of posiblesColumnasNombre) {
      const result = await pool.request().query(`
        SELECT TOP 1 ${columna} as nombre FROM Empresas WHERE ${columna} IS NOT NULL
      `);
      if (result.recordset.length > 0 && result.recordset[0].nombre) {
        nombreEmpresa = result.recordset[0].nombre;
        console.log(`\n✅ Nombre de empresa encontrado en columna '${columna}': ${nombreEmpresa}`);
        break;
      }
    }

    console.log(`\n🏢 Empresa a usar: ${nombreEmpresa}`);

    await pool.close();
    console.log('\n👋 Conexión cerrada');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

obtenerEmpresa();