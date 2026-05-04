// backend/src/utils/conteoInicialExcel.js
const ExcelJS = require('exceljs');

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
}

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function getCellValue(cell) {
  if (!cell) return null;
  if (cell.value && typeof cell.value === 'object') {
    if (cell.value.text) return String(cell.value.text).trim();
    if (cell.value.result !== undefined && cell.value.result !== null) {
      return String(cell.value.result).trim();
    }
  }
  return normalizeText(cell.value);
}

function resolveColumnIndex(headerMap, aliases) {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (headerMap[key] !== undefined) return headerMap[key];
  }
  return null;
}

async function parseConteoInicialExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('El archivo no contiene hojas');
  }

  console.log('[PARSER] Hoja encontrada:', worksheet.name);

  const headerRow = worksheet.getRow(1);
  const headerMap = {};

  headerRow.eachCell((cell, colNumber) => {
    const headerValue = normalizeHeader(cell.value);
    headerMap[headerValue] = colNumber;
    console.log(`[PARSER] Columna ${colNumber}: "${cell.value}" → "${headerValue}"`);
  });

  // Buscar columnas - MÁS OPCIONES PARA CADA UNA
  const skuCol = resolveColumnIndex(headerMap, [
    'sku', 'codigo', 'código', 'producto', 'product', 
    'codigoinventario', 'códigoinventario', 'cod'
  ]);
  
  const descripcionCol = resolveColumnIndex(headerMap, [
    'descripcion', 'descripción', 'nombre', 'description', 
    'producto', 'product', 'detalle'
  ]);
  
  const unidadMedidaCol = resolveColumnIndex(headerMap, [
    'unidadmedida', 'unidad medida', 'und', 'unitmeasure', 
    'unidad', 'medida', 'um'
  ]);
  
  const grupoCol = resolveColumnIndex(headerMap, [
    'grupo', 'destino', 'group', 'clasificacion', 
    'categoria', 'grupo2', 'grupodos'
  ]);
  
  const cantidadBodegaCol = resolveColumnIndex(headerMap, [
    'cantidadbodega', 'cantidad bodega', 'bodega', 'warehouse',
    'cantidad_bodega', 'cantidadbodega', 'cant bodega',
    'stock bodega', 'inventario bodega', 'bodega cantidad'
  ]);
  
  const cantidadExhibicionCol = resolveColumnIndex(headerMap, [
    'cantidadexhibicion', 'cantidad exhibicion', 'exhibicion', 'exhibición',
    'showroom', 'cantidad_exhibicion', 'cantidadexhibicion',
    'stock exhibicion', 'inventario exhibicion', 'exhibicion cantidad'
  ]);
  
  // Si no encuentra columnas separadas, buscar columna única "cantidad"
  let cantidadUnicaCol = null;
  if (!cantidadBodegaCol && !cantidadExhibicionCol) {
    cantidadUnicaCol = resolveColumnIndex(headerMap, [
      'cantidad', 'quantity', 'stock', 'existencia', 'total', 'unidades'
    ]);
  }

  const precioCosteCol = resolveColumnIndex(headerMap, [
    'preciocoste', 'precio coste', 'costopromedio', 'costo promedio', 
    'price', 'valorunitario', 'valor unitario', 'precio', 'costo',
    'preciocoste', 'precio_coste', 'coste'
  ]);

  console.log('[PARSER] Columnas encontradas:', {
    skuCol,
    descripcionCol,
    unidadMedidaCol,
    grupoCol,
    cantidadBodegaCol,
    cantidadExhibicionCol,
    cantidadUnicaCol,
    precioCosteCol
  });

  if (!skuCol) {
    throw new Error('El Excel debe tener una columna "sku" o "codigo" o "producto"');
  }

  const rows = [];
  const errors = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const skuRaw = getCellValue(row.getCell(skuCol));
    let sku = normalizeText(skuRaw);

    if (!sku || sku === 'VACIO' || sku === 'VACÍO' || sku === 'EMPTY' || sku === '') {
      console.log(`[PARSER] Fila ${rowNumber}: SKU inválido "${skuRaw}", omitiendo`);
      errors.push({ row: rowNumber, message: `SKU inválido: "${skuRaw}"` });
      return;
    }

    const descripcion = descripcionCol ? normalizeText(getCellValue(row.getCell(descripcionCol))) : null;
    const unidadMedida = unidadMedidaCol ? normalizeText(getCellValue(row.getCell(unidadMedidaCol))) : 'Und.';
    const grupo = grupoCol ? normalizeText(getCellValue(row.getCell(grupoCol))) : null;

    let cantidadBodega = 0;
    let cantidadExhibicion = 0;

    // Si tiene columnas separadas
    if (cantidadBodegaCol) {
      const val = getCellValue(row.getCell(cantidadBodegaCol));
      cantidadBodega = Number(val) || 0;
    }

    if (cantidadExhibicionCol) {
      const val = getCellValue(row.getCell(cantidadExhibicionCol));
      cantidadExhibicion = Number(val) || 0;
    }

    // Si solo hay una columna de cantidad (formato antiguo)
    if (cantidadUnicaCol && cantidadBodega === 0 && cantidadExhibicion === 0) {
      const val = getCellValue(row.getCell(cantidadUnicaCol));
      const cantidad = Number(val) || 0;
      // Por defecto, asignar a exhibición
      cantidadExhibicion = cantidad;
    }

    let precioCoste = 0;
    if (precioCosteCol) {
      const val = getCellValue(row.getCell(precioCosteCol));
      precioCoste = Number(val) || 0;
      console.log(`[PARSER] Fila ${rowNumber}: SKU=${sku}, precioCoste=${precioCoste}`);
    }

    // Guardar siempre, incluso con cantidad 0
    rows.push({
      sku,
      descripcion: descripcion || null,
      unidadMedida,
      grupo,
      cantidadBodega,
      cantidadExhibicion,
      cantidadTotal: cantidadBodega + cantidadExhibicion,
      precioCoste
    });
  });

  console.log(`[PARSER] Filas procesadas: ${rows.length}, Errores: ${errors.length}`);
  return { rows, errors };
}

module.exports = { parseConteoInicialExcel };