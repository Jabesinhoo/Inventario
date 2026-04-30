// scripts/explorar-melissa.js
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

async function explorarMelissa() {
  console.log('========================================');
  console.log('🔍 EXPLORANDO BASE DE DATOS MELISSA');
  console.log('========================================\n');

  let pool = null;

  try {
    pool = await sql.connect(config);
    console.log('✅ Conectado a SQL Server\n');

    // ==================== 1. LISTAR TODAS LAS TABLAS RELEVANTES ====================
    console.log('📋 TABLAS DISPONIBLES:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const tablas = await pool.request().query(`
      SELECT 
        TABLE_SCHEMA,
        TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND (
          TABLE_NAME LIKE '%Inventario%'
          OR TABLE_NAME LIKE '%Producto%'
          OR TABLE_NAME LIKE '%Articulo%'
          OR TABLE_NAME LIKE '%Costo%'
          OR TABLE_NAME LIKE '%Precio%'
          OR TABLE_NAME LIKE '%Iva%'
          OR TABLE_NAME LIKE '%Impuesto%'
        )
      ORDER BY TABLE_NAME
    `);
    
    console.table(tablas.recordset);

    // ==================== 2. EXPLORAR TABLA INVENTARIOS (principal) ====================
    console.log('\n📦 TABLA: Inventarios');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const inventariosCols = await pool.request().query(`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Inventarios'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.table(inventariosCols.recordset);
    
    // Datos ejemplo
    const inventariosSample = await pool.request().query(`
      SELECT TOP 5 *
      FROM Inventarios
      WHERE Activo = -1
    `);
    
    if (inventariosSample.recordset.length > 0) {
      console.log('\n📊 Datos ejemplo de Inventarios:');
      console.table(inventariosSample.recordset);
    }

    // ==================== 3. EXPLORAR TABLA CCA_M_Inventarios ====================
    console.log('\n📦 TABLA: CCA_M_Inventarios (movimientos/inventario actual)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const ccaCols = await pool.request().query(`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'CCA_M_Inventarios'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.table(ccaCols.recordset);
    
    const ccaSample = await pool.request().query(`
      SELECT TOP 5 *
      FROM CCA_M_Inventarios
      WHERE Cantidad > 0
    `);
    
    if (ccaSample.recordset.length > 0) {
      console.log('\n📊 Datos ejemplo de CCA_M_Inventarios:');
      console.table(ccaSample.recordset);
    }

    // ==================== 4. BUSCAR TABLA DE PRECIOS/COSTOS ====================
    console.log('\n💰 TABLAS DE PRECIOS/COSTOS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const precioTables = await pool.request().query(`
      SELECT 
        TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND (
          TABLE_NAME LIKE '%Precio%'
          OR TABLE_NAME LIKE '%Costo%'
          OR TABLE_NAME LIKE '%Valor%'
        )
    `);
    
    console.table(precioTables.recordset);
    
    // Si existe tabla de precios, explorarla
    for (const table of precioTables.recordset) {
      console.log(`\n📦 TABLA: ${table.TABLE_NAME}`);
      const cols = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '${table.TABLE_NAME}'
        ORDER BY ORDINAL_POSITION
      `);
      console.table(cols.recordset);
    }

    // ==================== 5. BUSCAR TABLA DE IVA/IMPUESTOS ====================
    console.log('\n📊 TABLAS DE IVA/IMPUESTOS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const ivaTables = await pool.request().query(`
      SELECT 
        TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND (
          TABLE_NAME LIKE '%Iva%'
          OR TABLE_NAME LIKE '%Impuesto%'
          OR TABLE_NAME LIKE '%Tax%'
        )
    `);
    
    console.table(ivaTables.recordset);

    // ==================== 6. BUSCAR TABLA DE TALLAS/COLORES (si existe) ====================
    console.log('\n🎨 TABLAS DE TALLAS/COLORES:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const tallaTables = await pool.request().query(`
      SELECT 
        TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND (
          TABLE_NAME LIKE '%Talla%'
          OR TABLE_NAME LIKE '%Color%'
          OR TABLE_NAME LIKE '%Medida%'
        )
    `);
    
    console.table(tallaTables.recordset);

    // ==================== 7. RELACIÓN PRODUCTO - PRECIO - IVA ====================
    console.log('\n🔗 RELACIÓN COMPLETA CON PRECIOS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Intentar hacer JOIN entre inventarios y precios
    try {
      const relacion = await pool.request().query(`
        SELECT TOP 10
          i.IdInventario,
          i.[CódigoInventario] as sku,
          i.[Descripción] as descripcion,
          i.[ValorUnitario],
          i.[Impuesto1],
          i.[Impuesto2]
        FROM Inventarios i
        WHERE i.Activo = -1
          AND i.[CódigoInventario] IS NOT NULL
      `);
      
      if (relacion.recordset.length > 0) {
        console.log('Inventarios con VALOR UNITARIO:');
        console.table(relacion.recordset);
      } else {
        console.log('⚠️ No se encontraron ValorUnitario en Inventarios');
        
        // Buscar en otras tablas
        const precios = await pool.request().query(`
          SELECT TOP 10
            p.*
          FROM Precios p
          WHERE p.IdProducto IS NOT NULL
        `);
        if (precios.recordset.length > 0) {
          console.log('Tabla de Precios:');
          console.table(precios.recordset);
        }
      }
    } catch (err) {
      console.log('No se pudo hacer JOIN de precios:', err.message);
    }

    // ==================== 8. RESUMEN DE CAMPOS ENCONTRADOS ====================
    console.log('\n📋 RESUMEN DE CAMPOS PARA EXPORTACIÓN:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const camposNecesarios = [
      'Producto (SKU/Código)',
      'Descripción',
      'Bodega (IdBodegaInventario)',
      'UnidadDeMedida',
      'Cantidad',
      'Cantidad Sistema',
      'IVA / Impuesto',
      'Valor Unitario',
      'Descuento',
      'Vencimiento',
      'Lote',
      'Talla',
      'Color'
    ];
    
    console.log('Campos necesarios para el Excel de Melissa:');
    for (const campo of camposNecesarios) {
      console.log(`   □ ${campo}`);
    }
    
    console.log('\n💡 RECOMENDACIONES:');
    console.log('   1. Identificar en qué tablas están los precios (ValorUnitario)');
    console.log('   2. Verificar si los impuestos (IVA) vienen en inventarios o tabla aparte');
    console.log('   3. Confirmar los códigos de bodega (BOD = Bodega, EXH = Exhibición)');
    console.log('   4. Verificar si hay conceptos de talla/color en los productos');
    
    await pool.close();
    console.log('\n👋 Conexión cerrada');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error);
  }
}

// Ejecutar exploración
explorarMelissa();