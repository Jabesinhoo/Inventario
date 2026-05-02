// scripts/exportar-melissa.js
require('dotenv').config();
const sql = require('mssql');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

async function exportarInventarioMelissa() {
  console.log('========================================');
  console.log('📤 EXPORTANDO INVENTARIO PARA MELISSA');
  console.log('========================================\n');

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
      connectTimeout: 120000,
      requestTimeout: 120000
    }
  };

  let pool = null;

  try {
    pool = await sql.connect(config);
    console.log('✅ Conectado a SQL Server\n');

    // 1. Obtener el nombre de la empresa
    console.log('📊 Consultando datos de empresa...');
    const empresaResult = await pool.request().query(`
      SELECT TOP 1 Empresa as nombre FROM Empresas
    `);
    const nombreEmpresa = empresaResult.recordset[0]?.nombre || 'TECNOCOMPUTER MELISSA SANDOVAL';
    console.log(`🏢 Empresa: ${nombreEmpresa}\n`);

    // 2. Obtener productos con PRECIO COSTE (CostoPromedio) y grupos
    console.log('📊 Consultando productos con precio coste...');
    const productosResult = await pool.request().query(`
      SELECT 
        i.IdInventario,
        i.[CódigoInventario] as sku,
        i.[Descripción] as descripcion,
        i.UnidadDeMedida,
        i.IdGrupoInventarioDos as grupoId,
        g.Descripcion as grupoNombre,
        ISNULL((
          SELECT TOP 1 c.CostoPromedio 
          FROM CCA_M_Inventarios c 
          WHERE c.IdInventario = i.IdInventario 
            AND c.CostoPromedio > 0
          ORDER BY c.IdAsientoContable DESC
        ), 0) as precioCoste
      FROM Inventarios i
      LEFT JOIN [Inventarios - AgrupaciónDos] g ON g.IdGrupoInventarioDos = i.IdGrupoInventarioDos
      WHERE i.Activo = -1
      ORDER BY i.[CódigoInventario]
    `);

    console.log(`✅ Productos encontrados: ${productosResult.recordset.length}\n`);

    // 3. Obtener existencias actuales por bodega (sumando todas, no solo última)
    console.log('📊 Consultando existencias por bodega (totales)...');
    const cantidadesResult = await pool.request().query(`
      SELECT 
        IdInventario,
        IdBodegaInventario,
        SUM(Cantidad) as CantidadTotal
      FROM CCA_M_Inventarios
      WHERE IdBodegaInventario IN ('BOD', 'EXH')
      GROUP BY IdInventario, IdBodegaInventario
    `);

    // Crear mapa de cantidades
    const cantidadesMap = new Map();
    for (const row of cantidadesResult.recordset) {
      const key = `${row.IdInventario}|${row.IdBodegaInventario}`;
      cantidadesMap.set(key, {
        cantidad: row.CantidadTotal || 0
      });
    }

    console.log(`✅ Cantidades encontradas: ${cantidadesResult.recordset.length}\n`);

    // Crear mapa de productos
    const productosMap = new Map();
    for (const prod of productosResult.recordset) {
      productosMap.set(prod.IdInventario, {
        sku: prod.sku,
        descripcion: prod.descripcion,
        unidadMedida: prod.UnidadDeMedida || 'Und.',
        grupoNombre: prod.grupoNombre || 'SIN GRUPO',
        precioCoste: prod.precioCoste || 0
      });
    }

    // Crear Excel con UNA SOLA FILA por producto
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('INVENTARIO');

    // Columnas para importación (formato simple)
    worksheet.columns = [
      { header: 'SKU', key: 'sku', width: 20 },
      { header: 'Descripción', key: 'descripcion', width: 60 },
      { header: 'Unidad Medida', key: 'unidadMedida', width: 15 },
      { header: 'Cantidad Bodega', key: 'cantidadBodega', width: 18 },
      { header: 'Cantidad Exhibición', key: 'cantidadExhibicion', width: 18 },
      { header: 'Total Unidades', key: 'total', width: 15 },
      { header: 'Precio Coste', key: 'precioCoste', width: 18 },
      { header: 'Grupo', key: 'grupo', width: 25 }
    ];

    // Estilos encabezado
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563eb' }
    };
    worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

    const fechaActual = new Date();
    let totalBodega = 0;
    let totalExhibicion = 0;
    let productosConStock = 0;

    console.log('📝 Generando Excel (una fila por producto)...');

    // Iterar sobre los productos y crear UNA SOLA FILA
    for (const [idInventario, producto] of productosMap) {
      const bodegaKey = `${idInventario}|BOD`;
      const exhibicionKey = `${idInventario}|EXH`;
      
      const cantidadBodega = cantidadesMap.get(bodegaKey)?.cantidad || 0;
      const cantidadExhibicion = cantidadesMap.get(exhibicionKey)?.cantidad || 0;
      
      if (cantidadBodega > 0 || cantidadExhibicion > 0) {
        productosConStock++;
      }
      
      totalBodega += cantidadBodega;
      totalExhibicion += cantidadExhibicion;
      
      worksheet.addRow({
        sku: producto.sku,
        descripcion: producto.descripcion || 'Sin descripción',
        unidadMedida: producto.unidadMedida,
        cantidadBodega: cantidadBodega,
        cantidadExhibicion: cantidadExhibicion,
        total: cantidadBodega + cantidadExhibicion,
        precioCoste: producto.precioCoste,
        grupo: producto.grupoNombre
      });
    }

    // ==================== HOJA DE RESUMEN ====================
    const resumenSheet = workbook.addWorksheet('RESUMEN');
    resumenSheet.columns = [
      { header: 'Concepto', key: 'concepto', width: 35 },
      { header: 'Valor', key: 'valor', width: 25 }
    ];

    resumenSheet.getRow(1).font = { bold: true };
    resumenSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563eb' }
    };
    resumenSheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

    resumenSheet.addRows([
      { concepto: '📊 INFORMACIÓN GENERAL', valor: '' },
      { concepto: 'Fecha Exportación', valor: fechaActual.toLocaleString() },
      { concepto: 'Empresa', valor: nombreEmpresa },
      { concepto: '', valor: '' },
      { concepto: '📦 PRODUCTOS', valor: '' },
      { concepto: 'Total Productos Activos', valor: productosMap.size },
      { concepto: 'Productos con Stock', valor: productosConStock },
      { concepto: '', valor: '' },
      { concepto: '📦 CANTIDADES', valor: '' },
      { concepto: 'Total Unidades en Bodega', valor: totalBodega.toLocaleString() },
      { concepto: 'Total Unidades en Exhibición', valor: totalExhibicion.toLocaleString() },
      { concepto: 'Total General Unidades', valor: (totalBodega + totalExhibicion).toLocaleString() }
    ]);

    // Guardar archivo
    const exportsDir = path.join(__dirname, '../exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    const filename = `inventario_melissa_${fechaActual.toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
    const filepath = path.join(exportsDir, filename);
    
    await workbook.xlsx.writeFile(filepath);

    console.log('\n📊 RESUMEN FINAL:');
    console.log(`   - Empresa: ${nombreEmpresa}`);
    console.log(`   - Productos activos: ${productosMap.size}`);
    console.log(`   - Productos con stock: ${productosConStock}`);
    console.log(`   - Total unidades Bodega: ${totalBodega.toLocaleString()}`);
    console.log(`   - Total unidades Exhibición: ${totalExhibicion.toLocaleString()}`);
    console.log(`   - Total general: ${(totalBodega + totalExhibicion).toLocaleString()}`);
    console.log(`\n✅ Archivo guardado: ${filepath}`);
    console.log(`\n📥 Formato: Una fila por producto con columnas:`);
    console.log(`   - SKU | Descripción | Unidad Medida | Cantidad Bodega | Cantidad Exhibición | Total | Precio Coste | Grupo`);

    await pool.close();
    console.log('\n👋 Conexión cerrada');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error);
  }
}

exportarInventarioMelissa();