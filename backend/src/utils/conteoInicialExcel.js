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

  const headerRow = worksheet.getRow(1);
  const headerMap = {};

  headerRow.eachCell((cell, colNumber) => {
    headerMap[normalizeHeader(cell.value)] = colNumber;
  });

  // Buscar columnas (aceptar tanto español como inglés)
  const zonaCol = resolveColumnIndex(headerMap, ['zona', 'ubicacion', 'location']);
  const skuCol = resolveColumnIndex(headerMap, ['sku', 'codigo', 'code', 'código']);
  const descripcionCol = resolveColumnIndex(headerMap, ['descripcion', 'descripción', 'producto', 'nombre', 'description']);
  const cantidadCol = resolveColumnIndex(headerMap, ['cantidad', 'quantity', 'stock', 'existencia']);

  if (!zonaCol || !skuCol || !cantidadCol) {
    throw new Error(
      'El Excel debe tener al menos estas columnas: zona, sku/codigo y cantidad'
    );
  }

  const rows = [];
  const errors = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const zona = normalizeText(getCellValue(row.getCell(zonaCol)));
    const sku = normalizeText(getCellValue(row.getCell(skuCol)));
    const descripcion = descripcionCol ? normalizeText(getCellValue(row.getCell(descripcionCol))) : null;
    const cantidadRaw = getCellValue(row.getCell(cantidadCol));

    // Saltar filas de totales
    if (!zona || !sku || zona.toUpperCase() === 'TOTALES') return;
    
    // Saltar si la cantidad no es un número válido
    const cantidad = Number(cantidadRaw);
    if (isNaN(cantidad)) return;

    rows.push({
      zona: zona.toUpperCase(),
      sku: sku,
      descripcion: descripcion,
      cantidad: cantidad
    });
  });

  return { rows, errors };
}

module.exports = {
  parseConteoInicialExcel
};