require('dotenv').config();
const sql = require('mssql');
const ExcelJS = require('exceljs');
const path = require('path');

async function exportToExcel() {
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

  console.log('========================================');
  console.log('📤 EXPORTANDO EXISTENCIAS ACTUALES A EXCEL');
  console.log('========================================\n');
  console.log('🔌 Conectando a SQL Server...');

  let pool = null;

  try {
    pool = await sql.connect(config);
    console.log('✅ Conectado exitosamente\n');

    console.log('📊 Consultando existencias ACTUALES...');

    // Obtener TODOS los productos activos (incluyendo los que tienen cantidad 0)
    const result = await pool.request().query(`
      SELECT 
        i.[CódigoInventario] as sku,
        i.[Descripción] as descripcion,
        -- Cantidad ACTUAL en Bodega (último movimiento)
        ISNULL((
          SELECT TOP 1 c.Cantidad 
          FROM [dbo].[CCA_M_Inventarios] c 
          WHERE c.IdInventario = i.IdInventario 
            AND c.IdBodegaInventario = 'BOD'
          ORDER BY c.IdAsientoContable DESC
        ), 0) as cantidadBodega,
        -- Cantidad ACTUAL en Exhibición (último movimiento)
        ISNULL((
          SELECT TOP 1 c.Cantidad 
          FROM [dbo].[CCA_M_Inventarios] c 
          WHERE c.IdInventario = i.IdInventario 
            AND c.IdBodegaInventario = 'EXH'
          ORDER BY c.IdAsientoContable DESC
        ), 0) as cantidadExhibicion
      FROM [dbo].[Inventarios] i
      WHERE i.[Activo] = -1
      ORDER BY i.[CódigoInventario]
    `);

    console.log(`✅ Productos encontrados: ${result.recordset.length}\n`);

    // Crear archivo Excel
    console.log('📝 Creando archivo Excel...');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Inventario App';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Conteo Inicial');

    // Definir columnas SOLO las necesarias
    worksheet.columns = [
      { header: 'zona', key: 'zona', width: 20 },
      { header: 'sku', key: 'sku', width: 20 },
      { header: 'descripcion', key: 'descripcion', width: 50 },
      { header: 'cantidad', key: 'cantidad', width: 15 }
    ];

    // Estilos para el encabezado
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563eb' }
    };
    worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

    let totalBodega = 0;
    let totalExhibicion = 0;
    let productosConStock = 0;
    let filasAgregadas = 0;

    // Agregar datos - Una fila por zona por producto
    for (const row of result.recordset) {
      const cantidadBodega = Number(row.cantidadBodega) || 0;
      const cantidadExhibicion = Number(row.cantidadExhibicion) || 0;
      
      totalBodega += cantidadBodega;
      totalExhibicion += cantidadExhibicion;
      
      // Fila para BODEGA (siempre incluir aunque sea 0)
      worksheet.addRow({
        zona: 'BODEGA',
        sku: row.sku,
        descripcion: row.descripcion || 'Sin descripción',
        cantidad: cantidadBodega
      });
      filasAgregadas++;
      
      if (cantidadBodega > 0) productosConStock++;
      
      // Fila para EXHIBICIÓN (siempre incluir aunque sea 0)
      worksheet.addRow({
        zona: 'EXHIBICION',
        sku: row.sku,
        descripcion: row.descripcion || 'Sin descripción',
        cantidad: cantidadExhibicion
      });
      filasAgregadas++;
      
      if (cantidadExhibicion > 0) productosConStock++;
    }

    // Agregar fila de resumen al final
    worksheet.addRow({});
    worksheet.addRow({
      zona: 'TOTALES',
      sku: '',
      descripcion: '',
      cantidad: ''
    });
    
    worksheet.addRow({
      zona: 'Total Bodega',
      sku: '',
      descripcion: '',
      cantidad: totalBodega
    });
    
    worksheet.addRow({
      zona: 'Total Exhibición',
      sku: '',
      descripcion: '',
      cantidad: totalExhibicion
    });
    
    worksheet.addRow({
      zona: 'Total General',
      sku: '',
      descripcion: '',
      cantidad: totalBodega + totalExhibicion
    });

    // Guardar archivo
    const filename = `inventario_base_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
    const fs = require('fs');
    const exportDir = path.join(__dirname, '../exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const filepath = path.join(exportDir, filename);
    await workbook.xlsx.writeFile(filepath);

    console.log('📊 RESUMEN:');
    console.log(`   - Productos únicos: ${result.recordset.length}`);
    console.log(`   - Filas en Excel: ${filasAgregadas} (2 por producto)`);
    console.log(`   - Productos con stock en Bodega: ${result.recordset.filter(r => r.cantidadBodega > 0).length}`);
    console.log(`   - Productos con stock en Exhibición: ${result.recordset.filter(r => r.cantidadExhibicion > 0).length}`);
    console.log(`   - Total unidades en Bodega: ${totalBodega.toLocaleString()}`);
    console.log(`   - Total unidades en Exhibición: ${totalExhibicion.toLocaleString()}`);
    console.log(`   - Total general: ${(totalBodega + totalExhibicion).toLocaleString()}\n`);
    
    console.log(`✅ Archivo guardado: ${filepath}`);
    console.log(`\n📥 Formato del Excel:`);
    console.log(`   - zona: BODEGA o EXHIBICION`);
    console.log(`   - sku: Código del producto`);
    console.log(`   - descripcion: Nombre del producto`);
    console.log(`   - cantidad: Unidades actuales en esa ubicación`);
    console.log(`\n💡 Para importar: Ve a "Conteo Inicial" en el frontend y usa "Importar desde Excel"`);
    
    await pool.close();
    console.log('\n👋 Conexión cerrada');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
  }
}

exportToExcel();