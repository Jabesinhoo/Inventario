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

    // Obtener nombre de la empresa
    const empresaResult = await pool.request().query(`
      SELECT TOP 1 Empresa as nombre FROM Empresas
    `);
    const nombreEmpresa = empresaResult.recordset[0]?.nombre || 'TECNOCOMPUTER MELISSA SANDOVAL';
    console.log(`🏢 Empresa: ${nombreEmpresa}\n`);

    // Consulta con cantidades ACTUALES (una sola fila por producto)
    console.log('📊 Consultando productos con cantidades ACTUALES...');
    
    const productosResult = await pool.request().query(`
      WITH UltimasCantidades AS (
        SELECT 
          c.IdInventario,
          c.IdBodegaInventario,
          c.Cantidad,
          ROW_NUMBER() OVER (PARTITION BY c.IdInventario, c.IdBodegaInventario ORDER BY c.IdAsientoContable DESC) as rn
        FROM CCA_M_Inventarios c
        WHERE c.IdBodegaInventario IN ('BOD', 'EXH')
      ),
      PrecioCoste AS (
        SELECT 
          IdInventario,
          CostoPromedio,
          ROW_NUMBER() OVER (PARTITION BY IdInventario ORDER BY IdAsientoContable DESC) as rn
        FROM CCA_M_Inventarios
        WHERE CostoPromedio > 0
      )
      SELECT 
        i.[CódigoInventario] as sku,
        i.[Descripción] as descripcion,
        i.UnidadDeMedida,
        i.IdGrupoInventarioDos as grupoId,
        g.Descripcion as grupoNombre,
        ISNULL(pc.CostoPromedio, 0) as precioCoste,
        MAX(CASE WHEN uc.IdBodegaInventario = 'BOD' THEN uc.Cantidad ELSE 0 END) as cantidadBodega,
        MAX(CASE WHEN uc.IdBodegaInventario = 'EXH' THEN uc.Cantidad ELSE 0 END) as cantidadExhibicion
      FROM Inventarios i
      LEFT JOIN [Inventarios - AgrupaciónDos] g ON g.IdGrupoInventarioDos = i.IdGrupoInventarioDos
      LEFT JOIN UltimasCantidades uc ON uc.IdInventario = i.IdInventario AND uc.rn = 1
      LEFT JOIN PrecioCoste pc ON pc.IdInventario = i.IdInventario AND pc.rn = 1
      WHERE i.Activo = -1
      GROUP BY 
        i.[CódigoInventario],
        i.[Descripción],
        i.UnidadDeMedida,
        i.IdGrupoInventarioDos,
        g.Descripcion,
        pc.CostoPromedio
      HAVING 
        MAX(CASE WHEN uc.IdBodegaInventario = 'BOD' THEN uc.Cantidad ELSE 0 END) > 0
        OR MAX(CASE WHEN uc.IdBodegaInventario = 'EXH' THEN uc.Cantidad ELSE 0 END) > 0
      ORDER BY i.[CódigoInventario]
    `);

    console.log(`✅ Productos con stock actual: ${productosResult.recordset.length}\n`);

    // Crear Excel
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('INVENTARIO');

    // 🔥 COLUMNAS COMPLETAS - UNA SOLA FILA POR PRODUCTO
    worksheet.columns = [
      { header: 'Empresa', key: 'empresa', width: 30 },
      { header: 'Tipo Documento', key: 'tipoDocumento', width: 15 },
      { header: 'Documento Número', key: 'documentoNumero', width: 20 },
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Elaborado', key: 'elaborado', width: 20 },
      { header: 'Destino', key: 'destino', width: 25 },
      { header: 'Nota', key: 'nota', width: 35 },
      { header: 'Verificado', key: 'verificado', width: 12 },
      { header: 'Anulado', key: 'anulado', width: 10 },
      { header: 'Producto', key: 'producto', width: 20 },
      { header: 'Descripción', key: 'descripcion', width: 60 },
      { header: 'Unidad De Medida', key: 'unidadMedida', width: 15 },
      { header: 'Cantidad Bodega', key: 'cantidadBodega', width: 18 },
      { header: 'Cantidad Exhibición', key: 'cantidadExhibicion', width: 18 },
      { header: 'Cantidad Sistema', key: 'cantidadSistema', width: 15 },
      { header: 'IVA', key: 'iva', width: 10 },
      { header: 'Valor Unitario', key: 'valorUnitario', width: 15 },
      { header: 'Descuento', key: 'descuento', width: 10 },
      { header: 'Vencimiento', key: 'vencimiento', width: 12 },
      { header: 'Lote', key: 'lote', width: 15 },
      { header: 'Talla', key: 'talla', width: 10 },
      { header: 'Color', key: 'color', width: 15 }
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
    const fechaStr = fechaActual.toISOString().slice(0, 10);
    const mesActual = fechaActual.toLocaleString('es', { month: 'long' });
    let totalBodega = 0;
    let totalExhibicion = 0;

    console.log('📝 Generando Excel (una fila por producto)...');

    for (const row of productosResult.recordset) {
      const cantidadBodega = Number(row.cantidadBodega) || 0;
      const cantidadExhibicion = Number(row.cantidadExhibicion) || 0;
      
      totalBodega += cantidadBodega;
      totalExhibicion += cantidadExhibicion;
      
      worksheet.addRow({
        empresa: nombreEmpresa,
        tipoDocumento: 'AI',
        documentoNumero: '',
        fecha: fechaStr,
        elaborado: 'Admin',
        destino: row.grupoNombre || 'SIN GRUPO',
        nota: `Ajuste de inventario - ${mesActual}`,
        verificado: -1,
        anulado: 0,
        producto: row.sku,
        descripcion: row.descripcion || 'Sin descripción',
        unidadMedida: row.UnidadDeMedida || 'Und.',
        cantidadBodega: cantidadBodega,
        cantidadExhibicion: cantidadExhibicion,
        cantidadSistema: 0,
        iva: 0,
        valorUnitario: row.precioCoste || 0,
        descuento: 0,
        vencimiento: fechaStr,
        lote: '',
        talla: '',
        color: ''
      });
    }

    // Hoja de resumen
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
      { concepto: 'Tipo Documento', valor: 'AI' },
      { concepto: 'Verificado', valor: '-1 (SI)' },
      { concepto: 'Anulado', valor: '0 (NO)' },
      { concepto: 'IVA', valor: '0' },
      { concepto: '', valor: '' },
      { concepto: '📦 PRODUCTOS', valor: '' },
      { concepto: 'Productos con Stock', valor: productosResult.recordset.length },
      { concepto: '', valor: '' },
      { concepto: '📦 CANTIDADES', valor: '' },
      { concepto: 'Total Unidades en Bodega', valor: totalBodega.toLocaleString() },
      { concepto: 'Total Unidades en Exhibición', valor: totalExhibicion.toLocaleString() },
      { concepto: 'Total General', valor: (totalBodega + totalExhibicion).toLocaleString() }
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
    console.log(`   - Productos con stock: ${productosResult.recordset.length}`);
    console.log(`   - Total unidades Bodega: ${totalBodega.toLocaleString()}`);
    console.log(`   - Total unidades Exhibición: ${totalExhibicion.toLocaleString()}`);
    console.log(`   - Total general: ${(totalBodega + totalExhibicion).toLocaleString()}`);
    console.log(`\n✅ Archivo guardado: ${filepath}`);
    console.log(`\n📥 Formato COMPLETO para Melissa (una fila por producto):`);
    console.log(`   Columnas: Empresa | Tipo Doc | Fecha | Producto | Descripción | Unidad | Cantidad Bodega | Cantidad Exhibición | Valor Unitario | Destino | etc.`);

    await pool.close();
    console.log('\n👋 Conexión cerrada');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error);
  }
}

exportarInventarioMelissa();