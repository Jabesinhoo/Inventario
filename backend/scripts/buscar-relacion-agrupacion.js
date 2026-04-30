// scripts/buscar-relacion-agrupacion.js
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

async function buscarRelacion() {
  console.log('========================================');
  console.log('🔍 BUSCANDO RELACIÓN INVENTARIO - AGRUPACIÓN');
  console.log('========================================\n');

  try {
    const pool = await sql.connect(config);
    console.log('✅ Conectado a SQL Server\n');

    // Buscar columnas que hagan referencia a IdGrupoInventarioDos
    console.log('📋 Tablas que contienen IdGrupoInventarioDos:');
    const tablasConGrupo = await pool.request().query(`
      SELECT DISTINCT TABLE_NAME, COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE COLUMN_NAME = 'IdGrupoInventarioDos'
    `);
    console.table(tablasConGrupo.recordset);

    // Ver la tabla Inventarios original
    console.log('\n📋 Columnas de Inventarios:');
    const inventariosCols = await pool.request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Inventarios'
      ORDER BY ORDINAL_POSITION
    `);
    console.table(inventariosCols.recordset);

    // Ver si hay columna de grupo directo en Inventarios
    console.log('\n🔍 Buscando columna de grupo en Inventarios:');
    const grupoCols = await pool.request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Inventarios'
        AND (COLUMN_NAME LIKE '%Grupo%' OR COLUMN_NAME LIKE '%Agrupación%')
    `);
    console.table(grupoCols.recordset);

    // Ver la tabla Inventarios - AgrupaciónDos (datos)
    console.log('\n📦 TABLA: Inventarios - AgrupaciónDos (full)');
    const agrupacionData = await pool.request().query(`
      SELECT 
        IdGrupoInventarioDos,
        CódigoAgrupación,
        Descripcion
      FROM [Inventarios - AgrupaciónDos]
      ORDER BY IdGrupoInventarioDos
    `);
    console.table(agrupacionData.recordset);

    // Intentar ver si hay una tabla puente
    console.log('\n🔗 Buscando tabla puente (muchos a muchos):');
    const tablasPuente = await pool.request().query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND TABLE_NAME LIKE '%Inventarios%'
        AND TABLE_NAME NOT LIKE '%Agrupación%'
      ORDER BY TABLE_NAME
    `);
    console.table(tablasPuente.recordset.slice(0, 20));

    // Ver la tabla Inventarios (datos completos de un producto)
    console.log('\n📊 Datos completos de un producto en Inventarios:');
    const productoEjemplo = await pool.request().query(`
      SELECT TOP 1 
        IdInventario,
        [CódigoInventario],
        [Descripción],
        IdGrupoInventarioUno,
        IdGrupoInventarioDos
      FROM Inventarios
      WHERE Activo = -1
    `);
    console.table(productoEjemplo.recordset);

    await pool.close();
    console.log('\n👋 Conexión cerrada');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

buscarRelacion();