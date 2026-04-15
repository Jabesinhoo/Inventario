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

  const headerMap = {};
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    headerMap[normalizeHeader(cell.value)] = colNumber;
  });

  const zonaCol = resolveColumnIndex(headerMap, ['zona', 'nombrezona', 'codigozona']);
  const skuCol = resolveColumnIndex(headerMap, ['sku', 'codigosku']);
  const codigoCol = resolveColumnIndex(headerMap, ['codigo', 'codigobarra', 'codigo de barra']);
  const descripcionCol = resolveColumnIndex(headerMap, ['descripcion', 'descripción', 'producto', 'nombre']);
  const cantidadCol = resolveColumnIndex(headerMap, ['cantidad', 'conteo', 'existencia']);

  if (!zonaCol || !cantidadCol || (!skuCol && !codigoCol)) {
    throw new Error(
      'El Excel debe tener al menos: zona, cantidad y sku o codigo'
    );
  }

  const rows = [];
  const errors = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const zona = normalizeText(getCellValue(row.getCell(zonaCol)));
    const sku = skuCol ? normalizeText(getCellValue(row.getCell(skuCol))) : null;
    const codigo = codigoCol ? normalizeText(getCellValue(row.getCell(codigoCol))) : null;
    const descripcion = descripcionCol ? normalizeText(getCellValue(row.getCell(descripcionCol))) : null;
    const cantidadRaw = getCellValue(row.getCell(cantidadCol));

    const isEmpty = !zona && !sku && !codigo && !descripcion && !cantidadRaw;
    if (isEmpty) return;

    const cantidad = Number(cantidadRaw);

    if (!zona || (!sku && !codigo) || Number.isNaN(cantidad)) {
      errors.push({
        row: rowNumber,
        message: 'Fila inválida. zona, cantidad y sku/codigo son obligatorios'
      });
      return;
    }

    rows.push({
      zona,
      sku,
      codigo,
      descripcion,
      cantidad
    });
  });

  return { rows, errors };
}

module.exports = {
  parseConteoInicialExcel
};