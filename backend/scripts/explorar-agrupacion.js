// scripts/explorar-agrupacion-simple.js
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

async function explorarAgrupacionSimple() {
  console.log('========================================');
  console.log('🔍 EXPLORANDO TABLA AGRUPACIÓN DOS');
  console.log('========================================\n');

  try {
    const pool = await sql.connect(config);
    console.log('✅ Conectado a SQL Server\n');

    // Usar comillas dobles o brackets para el nombre con espacios
    const query = `
      SELECT TOP 5 * 
      FROM [Inventarios - AgrupaciónDos]
    `;
    
    console.log('Ejecutando consulta...');
    const result = await pool.request().query(query);
    
    if (result.recordset.length > 0) {
      console.log('\n📊 Columnas encontradas:');
      const columnas = Object.keys(result.recordset[0]);
      console.table(columnas);
      
      console.log('\n📊 Datos ejemplo:');
      console.table(result.recordset);
    } else {
      console.log('No hay datos en la tabla');
    }

    // También ver la relación con inventarios
    console.log('\n🔗 RELACIÓN CON INVENTARIOS:');
    const relationQuery = `
      SELECT TOP 5 
        i.[CódigoInventario] as sku,
        i.[Descripción] as descripcion,
        a.*
      FROM Inventarios i
      LEFT JOIN [Inventarios - AgrupaciónDos] a ON a.IdInventario = i.IdInventario
      WHERE i.Activo = -1
    `;
    
    const relationResult = await pool.request().query(relationQuery);
    if (relationResult.recordset.length > 0) {
      console.table(relationResult.recordset);
    }

    await pool.close();
    console.log('\n👋 Conexión cerrada');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

explorarAgrupacionSimple();