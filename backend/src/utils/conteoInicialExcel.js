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

  // Buscar columnas
  const skuCol = resolveColumnIndex(headerMap, ['sku', 'codigo', 'código', 'producto']);
  const descripcionCol = resolveColumnIndex(headerMap, ['descripcion', 'descripción', 'nombre']);
  const cantidadBodegaCol = resolveColumnIndex(headerMap, ['cantidadbodega', 'cantidad bodega', 'bodega']);
  const cantidadExhibicionCol = resolveColumnIndex(headerMap, ['cantidadexhibicion', 'cantidad exhibicion', 'exhibicion', 'exhibición']);

  console.log('[PARSER] Columnas encontradas:', {
    skuCol,
    descripcionCol,
    cantidadBodegaCol,
    cantidadExhibicionCol
  });

  if (!skuCol) {
    throw new Error('El Excel debe tener una columna "sku" o "codigo"');
  }

  if (!cantidadBodegaCol && !cantidadExhibicionCol) {
    throw new Error('El Excel debe tener al menos una columna de cantidad (Bodega o Exhibición)');
  }

  const rows = [];
  const errors = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const sku = normalizeText(getCellValue(row.getCell(skuCol)));
    const descripcion = descripcionCol ? normalizeText(getCellValue(row.getCell(descripcionCol))) : null;
    
    let cantidadBodega = 0;
    if (cantidadBodegaCol) {
      const val = getCellValue(row.getCell(cantidadBodegaCol));
      cantidadBodega = Number(val) || 0;
    }
    
    let cantidadExhibicion = 0;
    if (cantidadExhibicionCol) {
      const val = getCellValue(row.getCell(cantidadExhibicionCol));
      cantidadExhibicion = Number(val) || 0;
    }

    if (!sku) {
      errors.push({ row: rowNumber, message: 'SKU vacío' });
      return;
    }

    if (cantidadBodega === 0 && cantidadExhibicion === 0) {
      errors.push({ row: rowNumber, message: `SKU ${sku} sin cantidades` });
      return;
    }

    rows.push({
      sku,
      descripcion: descripcion || null,
      cantidadBodega,
      cantidadExhibicion,
      cantidadTotal: cantidadBodega + cantidadExhibicion
    });
  });

  console.log(`[PARSER] Filas procesadas: ${rows.length}, Errores: ${errors.length}`);
  return { rows, errors };
}

module.exports = { parseConteoInicialExcel };