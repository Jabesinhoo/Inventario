// scripts/buscar-precio-coste.js
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

async function buscarPrecioCoste() {
  console.log('========================================');
  console.log('🔍 BUSCANDO PRECIO COSTE');
  console.log('========================================\n');

  try {
    const pool = await sql.connect(config);
    console.log('✅ Conectado a SQL Server\n');

    // Ver columnas de precio en Inventarios
    console.log('📋 Columnas de precio en Inventarios:');
    const precioCols = await pool.request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Inventarios'
        AND (COLUMN_NAME LIKE '%Precio%' OR COLUMN_NAME LIKE '%Costo%' OR COLUMN_NAME LIKE '%Coste%')
      ORDER BY COLUMN_NAME
    `);
    console.table(precioCols.recordset);

    // Ver datos de ejemplo con precios
    console.log('\n📊 Datos de ejemplo con precios:');
    const preciosEjemplo = await pool.request().query(`
      SELECT TOP 5 
        [CódigoInventario] as sku,
        [Descripción],
        Precio1,
        Precio2,
        Precio3,
        Precio4,
        Precio5
      FROM Inventarios
      WHERE Activo = -1 
        AND (Precio1 > 0 OR Precio2 > 0 OR Precio3 > 0)
    `);
    console.table(preciosEjemplo.recordset);

    // Ver si hay columna de costo
    console.log('\n🔍 Buscando "Costo" en otras tablas:');
    const costoTablas = await pool.request().query(`
      SELECT TABLE_NAME, COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE COLUMN_NAME LIKE '%Costo%' OR COLUMN_NAME LIKE '%Coste%'
      ORDER BY TABLE_NAME
    `);
    console.table(costoTablas.recordset.slice(0, 30));

    // Ver CCA_M_Inventarios para ver el costo
    console.log('\n📦 CCA_M_Inventarios (tiene CostoPromedio):');
    const costoCCA = await pool.request().query(`
      SELECT TOP 5 
        IdInventario,
        CostoPromedio,
        CostoInventario,
        MontoMonetarioUnitario
      FROM CCA_M_Inventarios
      WHERE CostoPromedio > 0
    `);
    console.table(costoCCA.recordset);

    await pool.close();
    console.log('\n👋 Conexión cerrada');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

buscarPrecioCoste();