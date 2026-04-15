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
    if (headerMap[key] !== undefined) {
      return headerMap[key];
    }
  }
  return null;
}

async function parseProductosExcel(buffer) {
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

  const skuCol = resolveColumnIndex(headerMap, ['sku', 'codigo sku', 'codigosku']);
  const codigoBarraCol = resolveColumnIndex(headerMap, [
    'codigobarra',
    'codigo de barra',
    'codigo',
    'ean',
    'barcode'
  ]);
  const codigoQrCol = resolveColumnIndex(headerMap, ['codigoqr', 'qr']);
  const descripcionCol = resolveColumnIndex(headerMap, [
    'descripcion',
    'descripción',
    'nombre',
    'producto'
  ]);
  const categoriaCol = resolveColumnIndex(headerMap, ['categoria', 'categoría', 'linea', 'línea']);

  if (!skuCol || !codigoBarraCol || !descripcionCol) {
    throw new Error(
      'El Excel debe tener al menos estas columnas: sku, codigoBarra/codigo, descripcion'
    );
  }

  const rows = [];
  const errors = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const sku = normalizeText(getCellValue(row.getCell(skuCol)));
    const codigoBarra = normalizeText(getCellValue(row.getCell(codigoBarraCol)));
    const codigoQr = codigoQrCol ? normalizeText(getCellValue(row.getCell(codigoQrCol))) : null;
    const descripcion = normalizeText(getCellValue(row.getCell(descripcionCol)));
    const categoria = categoriaCol ? normalizeText(getCellValue(row.getCell(categoriaCol))) : null;

    const isEmpty = !sku && !codigoBarra && !descripcion && !codigoQr && !categoria;
    if (isEmpty) return;

    if (!sku || !codigoBarra || !descripcion) {
      errors.push({
        row: rowNumber,
        message: 'Fila incompleta. sku, codigoBarra/codigo y descripcion son obligatorios'
      });
      return;
    }

    rows.push({
      sku,
      codigoBarra,
      codigoQr,
      descripcion,
      categoria
    });
  });

  return {
    rows,
    errors
  };
}

module.exports = {
  parseProductosExcel
};