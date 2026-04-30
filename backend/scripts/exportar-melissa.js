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

    // 2. Obtener productos con sus grupos y destinos (usando JOIN correcto)
    console.log('📊 Consultando productos con grupos...');
    const productosResult = await pool.request().query(`
      SELECT 
        i.IdInventario,
        i.[CódigoInventario] as sku,
        i.[Descripción] as descripcion,
        i.UnidadDeMedida,
        ISNULL(i.Iva, 0) as iva,
        ISNULL(i.Precio1, 0) as valorUnitario,
        i.IdGrupoInventarioDos as grupoId,
        g.Descripcion as grupoNombre
      FROM Inventarios i
      LEFT JOIN [Inventarios - AgrupaciónDos] g ON g.IdGrupoInventarioDos = i.IdGrupoInventarioDos
      WHERE i.Activo = -1
      ORDER BY i.[CódigoInventario]
    `);

    console.log(`✅ Productos encontrados: ${productosResult.recordset.length}\n`);

    // 3. Obtener existencias actuales por bodega
    console.log('📊 Consultando existencias por bodega...');
    const cantidadesResult = await pool.request().query(`
      WITH UltimosMovimientos AS (
        SELECT 
          c.IdInventario,
          c.IdBodegaInventario,
          c.Cantidad,
          c.Dcto,
          c.Vencimiento,
          c.IdLote,
          ROW_NUMBER() OVER (PARTITION BY c.IdInventario, c.IdBodegaInventario ORDER BY c.IdAsientoContable DESC) as rn
        FROM CCA_M_Inventarios c
      )
      SELECT 
        IdInventario,
        IdBodegaInventario,
        Cantidad,
        Dcto,
        Vencimiento,
        IdLote
      FROM UltimosMovimientos
      WHERE rn = 1
    `);

    // Crear mapa de cantidades
    const cantidadesMap = new Map();
    for (const row of cantidadesResult.recordset) {
      const key = `${row.IdInventario}|${row.IdBodegaInventario}`;
      cantidadesMap.set(key, {
        cantidad: row.Cantidad || 0,
        descuento: row.Dcto || 0,
        vencimiento: row.Vencimiento,
        lote: row.IdLote
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
        iva: prod.iva,
        valorUnitario: prod.valorUnitario,
        grupoNombre: prod.grupoNombre || 'SIN GRUPO'
      });
    }

    // Crear Excel
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('INVENTARIO');

    // Columnas según formato Melissa
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
      { header: 'Bodega', key: 'bodega', width: 15 },
      { header: 'Unidad De Medida', key: 'unidadMedida', width: 15 },
      { header: 'Cantidad Físico', key: 'cantidadFisico', width: 15 },
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
    let totalRegistros = 0;
    let totalUnidades = 0;

    console.log('📝 Generando Excel...');

    // Iterar sobre los productos
    for (const [idInventario, producto] of productosMap) {
      const bodegaKey = `${idInventario}|BOD`;
      const exhibicionKey = `${idInventario}|EXH`;
      
      const bodegaData = cantidadesMap.get(bodegaKey);
      const exhibicionData = cantidadesMap.get(exhibicionKey);
      
      const cantidadBodega = bodegaData?.cantidad || 0;
      const cantidadExhibicion = exhibicionData?.cantidad || 0;
      
      // Fecha de vencimiento
      const fechaVencimiento = bodegaData?.vencimiento || exhibicionData?.vencimiento || null;
      const fechaVencimientoStr = fechaVencimiento ? new Date(fechaVencimiento).toISOString().slice(0, 10) : fechaStr;
      
      // Fila para BODEGA
      worksheet.addRow({
        empresa: nombreEmpresa,
        tipoDocumento: 'AI',
        documentoNumero: '',
        fecha: fechaStr,
        elaborado: 'Admin',
        destino: producto.grupoNombre,
        nota: `Ajuste de inventario - ${mesActual}`,
        verificado: -1,
        anulado: 0,
        producto: producto.sku,
        bodega: 'BODEGA',
        unidadMedida: producto.unidadMedida,
        cantidadFisico: cantidadBodega,
        cantidadSistema: 0,
        iva: 0,
        valorUnitario: producto.valorUnitario,
        descuento: bodegaData?.descuento || 0,
        vencimiento: fechaVencimientoStr,
        lote: bodegaData?.lote || '',
        talla: '',
        color: ''
      });
      totalRegistros++;
      totalUnidades += cantidadBodega;
      
      // Fila para EXHIBICION
      worksheet.addRow({
        empresa: nombreEmpresa,
        tipoDocumento: 'AI',
        documentoNumero: '',
        fecha: fechaStr,
        elaborado: 'Admin',
        destino: producto.grupoNombre,
        nota: `Ajuste de inventario - ${mesActual}`,
        verificado: -1,
        anulado: 0,
        producto: producto.sku,
        bodega: 'EXHIBICION',
        unidadMedida: producto.unidadMedida,
        cantidadFisico: cantidadExhibicion,
        cantidadSistema: 0,
        iva: 0,
        valorUnitario: producto.valorUnitario,
        descuento: exhibicionData?.descuento || 0,
        vencimiento: fechaVencimientoStr,
        lote: exhibicionData?.lote || '',
        talla: '',
        color: ''
      });
      totalRegistros++;
      totalUnidades += cantidadExhibicion;
    }

    // Hoja de resumen
    const resumenSheet = workbook.addWorksheet('RESUMEN');
    resumenSheet.columns = [
      { header: 'Concepto', key: 'concepto', width: 30 },
      { header: 'Valor', key: 'valor', width: 20 }
    ];

    resumenSheet.addRows([
      { concepto: 'Fecha Exportación', valor: fechaActual.toLocaleString() },
      { concepto: 'Empresa', valor: nombreEmpresa },
      { concepto: 'Total Productos Activos', valor: productosMap.size },
      { concepto: 'Total Registros (Bodega+Exhibición)', valor: totalRegistros },
      { concepto: 'Total Unidades', valor: totalUnidades.toLocaleString() },
      { concepto: 'Tipo Documento', valor: 'AI' },
      { concepto: 'Mes de Ajuste', valor: mesActual },
      { concepto: 'Verificado', valor: '-1 (SI)' },
      { concepto: 'Anulado', valor: '0 (NO)' },
      { concepto: 'IVA', valor: '0' }
    ]);

    resumenSheet.getRow(1).font = { bold: true };

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
    console.log(`   - Registros generados: ${totalRegistros}`);
    console.log(`   - Total unidades: ${totalUnidades.toLocaleString()}`);
    console.log(`\n✅ Archivo guardado: ${filepath}`);

    await pool.close();
    console.log('\n👋 Conexión cerrada');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error);
  }
}

exportarInventarioMelissa();