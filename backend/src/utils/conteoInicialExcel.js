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

// 🔥 NUEVA FUNCIÓN: Normalizar zona para formato Melissa
function normalizarZonaMelissa(zonaTexto) {
  const valor = String(zonaTexto || '').trim().toUpperCase();
  
  // Mapeo de BODEGA
  if (valor === 'BODEGA' || valor === 'BOD' || valor === 'BODEGA PRINCIPAL') {
    return { nombre: 'Bodega Principal', codigo: 'BOD', tipo: 'BODEGA' };
  }
  
  // Mapeo de EXHIBICION
  if (valor === 'EXHIBICION' || valor === 'EXHIBICIÓN' || valor === 'EXH' || valor === 'EXHIBICION PRINCIPAL') {
    return { nombre: 'Exhibición', codigo: 'EXH', tipo: 'EXHIBICION' };
  }
  
  // Si no coincide, devolver el original
  return { nombre: valor, codigo: valor.slice(0, 10), tipo: 'OTRO' };
}

async function parseConteoInicialExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('El archivo no contiene hojas');
  }

  console.log('[PARSER] Hoja encontrada:', worksheet.name);
  console.log('[PARSER] Número de filas:', worksheet.rowCount);

  const headerRow = worksheet.getRow(1);
  const headerMap = {};

  headerRow.eachCell((cell, colNumber) => {
    const headerValue = normalizeHeader(cell.value);
    headerMap[headerValue] = colNumber;
    console.log(`[PARSER] Columna ${colNumber}: "${cell.value}" → normalizado: "${headerValue}"`);
  });

  // Columnas esperadas para formato Melissa
  const zonaCol = resolveColumnIndex(headerMap, ['zona', 'ubicacion', 'location']);
  const skuCol = resolveColumnIndex(headerMap, ['sku', 'codigo', 'code', 'código']);
  const descripcionCol = resolveColumnIndex(headerMap, [
    'descripcion',
    'descripción',
    'nombre',
    'detalle',
    'producto'
  ]);
  const cantidadCol = resolveColumnIndex(headerMap, ['cantidad', 'quantity', 'stock', 'existencia']);
  const codigoBarraCol = resolveColumnIndex(headerMap, [
    'codigobarra',
    'codigo de barras',
    'codigo barras',
    'codbarras',
    'barcode',
    'ean'
  ]);

  console.log('[PARSER] Columnas encontradas:', {
    zonaCol,
    skuCol,
    descripcionCol,
    cantidadCol,
    codigoBarraCol
  });

  if (!zonaCol || !skuCol || !cantidadCol) {
    throw new Error(
      `El Excel debe tener al menos: zona (columna ${zonaCol}), sku/codigo (columna ${skuCol}) y cantidad (columna ${cantidadCol})`
    );
  }

  const rows = [];
  const errors = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const zonaRaw = getCellValue(row.getCell(zonaCol));
    const zona = normalizeText(zonaRaw);
    const sku = normalizeText(getCellValue(row.getCell(skuCol)));
    const descripcion = descripcionCol
      ? normalizeText(getCellValue(row.getCell(descripcionCol)))
      : null;
    const codigoBarra = codigoBarraCol
      ? normalizeText(getCellValue(row.getCell(codigoBarraCol)))
      : null;

    const cantidadRaw = getCellValue(row.getCell(cantidadCol));
    const cantidad = Number(cantidadRaw);

    if (rowNumber % 100 === 0) {
      console.log(
        `[PARSER] Procesando fila ${rowNumber}: zona="${zona}", sku="${sku}", descripcion="${descripcion}", cantidad=${cantidad}`
      );
    }

    if (!zona || !sku) {
      errors.push({
        row: rowNumber,
        message: `Fila inválida: zona="${zona}", sku="${sku}"`
      });
      return;
    }

    if (Number.isNaN(cantidad)) {
      errors.push({
        row: rowNumber,
        message: `Cantidad inválida: "${cantidadRaw}"`
      });
      return;
    }

    // 🔥 Normalizar zona para formato Melissa
    const zonaNormalizada = normalizarZonaMelissa(zona);
    
    rows.push({
      zona: zonaNormalizada.tipo,
      zonaNombre: zonaNormalizada.nombre,
      zonaCodigo: zonaNormalizada.codigo,
      sku: String(sku).trim(),
      codigoLeido: codigoBarra || String(sku).trim(),
      descripcion: descripcion || null,
      cantidad
    });
  });

  console.log(`[PARSER] Total filas procesadas: ${rows.length}`);
  console.log(`[PARSER] Total errores: ${errors.length}`);

  return { rows, errors };
}

module.exports = {
  parseConteoInicialExcel
};