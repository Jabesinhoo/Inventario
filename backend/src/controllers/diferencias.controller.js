const Joi = require('joi');
const ExcelJS = require('exceljs');
const { QueryTypes, Op } = require('sequelize');
const { sequelize, Zona, Inventario, RondaConteo, DiscrepanciaConteo, ParejaInventario } = require('../models');
const parejaService = require('../services/parejaInventario.service');

const compareSchema = Joi.object({
  inventarioBaseId: Joi.number().integer().required(),
  inventarioComparadoId: Joi.number().integer().required(),
  zonaBaseId: Joi.number().integer().allow(null, ''),
  zonaComparadaId: Joi.number().integer().allow(null, ''),
  zonaId: Joi.number().integer().allow(null, ''),
  cantidadesAceptadas: Joi.string().allow(null, '', '{}')
});

function isAdminOrSupervisor(req) {
  return ['admin', 'supervisor'].includes(String(req.user?.rol || '').toLowerCase());
}

function normalizeZoneText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function areEquivalentZones(zonaA, zonaB) {
  if (!zonaA || !zonaB) return false;

  const codigoA = normalizeZoneText(zonaA.codigo);
  const codigoB = normalizeZoneText(zonaB.codigo);

  if (codigoA && codigoB) {
    return codigoA === codigoB;
  }

  const nombreA = normalizeZoneText(zonaA.nombre);
  const nombreB = normalizeZoneText(zonaB.nombre);

  return nombreA === nombreB;
}

async function getAllowedGroupIds(req) {
  if (isAdminOrSupervisor(req)) return null;

  const rows = await sequelize.query(
    `
    SELECT DISTINCT ug."grupoId"
    FROM usuario_grupo ug
    WHERE ug."usuarioId" = :usuarioId
    `,
    {
      replacements: { usuarioId: req.user.id },
      type: QueryTypes.SELECT
    }
  );

  return rows.map((row) => Number(row.grupoId));
}

function buildLecturasFilterSql({
  groupIds,
  zonaId,
  alias = 'l',
  groupParam = 'groupIds',
  zonaParam = 'zonaId'
}) {
  let sql = '';

  if (groupIds !== null) {
    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      return ' AND 1 = 0 ';
    }
    sql += ` AND ${alias}."grupoId" IN (:${groupParam}) `;
  }

  if (zonaId) {
    sql += ` AND ${alias}."zonaId" = :${zonaParam} `;
  }

  return sql;
}

async function getSkuComparisonRows(
  inventarioBaseId,
  inventarioComparadoId,
  allowedGroupIds,
  zonaBaseId,
  zonaComparadaId
) {
  async function getSkuRowsEfectivos({
    inventarioId,
    zonaId,
    zonaParam
  }) {
    const filter = buildLecturasFilterSql({
      groupIds: allowedGroupIds,
      zonaId,
      alias: 'l',
      groupParam: 'allowedGroupIds',
      zonaParam
    });

    return sequelize.query(
      `
      WITH rondas_completas AS (
        SELECT
          r.id,
          r."zonaId",
          r."numeroRonda",
          r."updatedAt",
          ROW_NUMBER() OVER (
            PARTITION BY r."zonaId"
            ORDER BY r."numeroRonda" DESC, r.id DESC
          ) AS rn
        FROM rondas_conteo r
        WHERE r."inventarioId" = :inventarioId
          AND r."tipoRonda" = 'completa'
          AND r.estado IN ('activa', 'pausada', 'cerrada')
          ${zonaId ? `AND r."zonaId" = :${zonaParam}` : ''}
      ),

      ultimas_completas AS (
        SELECT id
        FROM rondas_completas
        WHERE rn = 1
      ),

      completa AS (
        SELECT
          l.sku,
          MAX(NULLIF(l."descripcionSnapshot", 'Sin descripción')) AS descripcion,
          COALESCE(SUM(l.cantidad), 0)::int AS cantidad,
          MAX(l."rondaId") AS "rondaId"
        FROM lecturas l
        WHERE l."inventarioId" = :inventarioId
          AND l.estado = 'valida'
          AND l.sku IS NOT NULL
          AND l."rondaId" IN (SELECT id FROM ultimas_completas)
          ${filter}
        GROUP BY l.sku
      ),

      rondas_reconteo AS (
        SELECT
          r.id,
          r."zonaId",
          r."numeroRonda",
          r."updatedAt"
        FROM rondas_conteo r
        WHERE r."inventarioId" = :inventarioId
          AND r."tipoRonda" = 'reconteo'
          AND r.estado IN ('activa', 'pausada', 'cerrada')
          ${zonaId ? `AND r."zonaId" = :${zonaParam}` : ''}
      ),

      reconteo_por_ronda_sku AS (
        SELECT
          l.sku,
          MAX(NULLIF(l."descripcionSnapshot", 'Sin descripción')) AS descripcion,
          COALESCE(SUM(l.cantidad), 0)::int AS cantidad,
          l."rondaId",
          MAX(rr."numeroRonda") AS "numeroRonda",
          MAX(rr."updatedAt") AS "updatedAt"
        FROM lecturas l
        INNER JOIN rondas_reconteo rr
          ON rr.id = l."rondaId"
        WHERE l."inventarioId" = :inventarioId
          AND l.estado = 'valida'
          AND l.sku IS NOT NULL
          ${filter}
        GROUP BY l.sku, l."rondaId"
      ),

      ultimo_reconteo_sku AS (
        SELECT DISTINCT ON (sku)
          sku,
          descripcion,
          cantidad,
          "rondaId",
          "numeroRonda",
          "updatedAt"
        FROM reconteo_por_ronda_sku
        ORDER BY sku, "numeroRonda" DESC, "updatedAt" DESC, "rondaId" DESC
      ),

      efectivo AS (
        SELECT
          COALESCE(r.sku, c.sku) AS sku,
          COALESCE(r.descripcion, c.descripcion, 'Producto ' || COALESCE(r.sku, c.sku)) AS descripcion,
          COALESCE(r.cantidad, c.cantidad, 0)::int AS cantidad,
          CASE WHEN r.sku IS NOT NULL THEN 'reconteo' ELSE 'completa' END AS fuente,
          COALESCE(r."rondaId", c."rondaId") AS "rondaId"
        FROM completa c
        FULL OUTER JOIN ultimo_reconteo_sku r
          ON r.sku = c.sku
      )

      SELECT
        sku,
        descripcion,
        cantidad,
        fuente,
        "rondaId"
      FROM efectivo
      ORDER BY sku ASC
      `,
      {
        replacements: {
          inventarioId,
          allowedGroupIds,
          [zonaParam]: zonaId || null
        },
        type: QueryTypes.SELECT
      }
    );
  }

  const [baseRows, comparadoRows] = await Promise.all([
    getSkuRowsEfectivos({ inventarioId: inventarioBaseId, zonaId: zonaBaseId, zonaParam: 'zonaBaseId' }),
    getSkuRowsEfectivos({ inventarioId: inventarioComparadoId, zonaId: zonaComparadaId, zonaParam: 'zonaComparadaId' })
  ]);

  const baseMap = new Map();
  const comparadoMap = new Map();

  for (const row of baseRows) {
    baseMap.set(row.sku, {
      sku: row.sku,
      descripcion: row.descripcion || `Producto ${row.sku}`,
      cantidad: Number(row.cantidad || 0),
      fuente: row.fuente || 'completa',
      rondaId: row.rondaId || null
    });
  }

  for (const row of comparadoRows) {
    comparadoMap.set(row.sku, {
      sku: row.sku,
      descripcion: row.descripcion || `Producto ${row.sku}`,
      cantidad: Number(row.cantidad || 0),
      fuente: row.fuente || 'completa',
      rondaId: row.rondaId || null
    });
  }

  const allSkus = Array.from(new Set([...baseMap.keys(), ...comparadoMap.keys()])).sort();

  return allSkus.map((sku) => {
    const base = baseMap.get(sku);
    const comparado = comparadoMap.get(sku);

    const cantidadBase = Number(base?.cantidad || 0);
    const cantidadComparada = Number(comparado?.cantidad || 0);
    const diferencia = cantidadComparada - cantidadBase;

    return {
      sku,
      descripcion: base?.descripcion || comparado?.descripcion || `Producto ${sku}`,
      cantidadBase,
      cantidadComparada,
      diferencia,
      estado: diferencia === 0 ? 'coincide' : 'difiere',
      fuenteBase: base?.fuente || null,
      fuenteComparada: comparado?.fuente || null,
      rondaBaseId: base?.rondaId || null,
      rondaComparadaId: comparado?.rondaId || null
    };
  });
}


async function getTotalesPorGrupo(inventarioId, allowedGroupIds, zonaId) {
  const filter = buildLecturasFilterSql({
    groupIds: allowedGroupIds,
    zonaId,
    alias: 'l',
    groupParam: 'allowedGroupIds',
    zonaParam: 'zonaId'
  });

  return sequelize.query(
    `
    WITH ultima_ronda AS (
      SELECT id
      FROM (
        SELECT
          r.id,
          r."zonaId",
          ROW_NUMBER() OVER (
            PARTITION BY r."zonaId"
            ORDER BY r."numeroRonda" DESC, r.id DESC
          ) AS rn
        FROM rondas_conteo r
        WHERE r."inventarioId" = :inventarioId
          AND r."tipoRonda" = 'completa'
          AND r.estado IN ('activa', 'pausada', 'cerrada')
          ${zonaId ? 'AND r."zonaId" = :zonaId' : ''}
      ) x
      WHERE x.rn = 1
    )
    SELECT
      g.id AS "id",
      g.nombre AS "nombre",
      MAX(z.nombre) AS "zona",
      COALESCE(SUM(l.cantidad), 0)::int AS "totalEscaneos",
      COUNT(DISTINCT l.sku)::int AS "productosUnicos"
    FROM lecturas l
    INNER JOIN ultima_ronda ur ON ur.id = l."rondaId"
    LEFT JOIN grupos g ON g.id = l."grupoId"
    LEFT JOIN zonas z ON z.id = l."zonaId"
    WHERE l."inventarioId" = :inventarioId
      AND l.estado = 'valida'
      ${filter}
    GROUP BY g.id, g.nombre
    ORDER BY g.nombre ASC
    `,
    { replacements: { inventarioId, allowedGroupIds, zonaId: zonaId || null }, type: QueryTypes.SELECT }
  );
}


async function getTotalesPorZona(inventarioId, allowedGroupIds, zonaId) {
  const filter = buildLecturasFilterSql({
    groupIds: allowedGroupIds,
    zonaId,
    alias: 'l',
    groupParam: 'allowedGroupIds',
    zonaParam: 'zonaId'
  });

  return sequelize.query(
    `
    WITH ultima_ronda AS (
      SELECT id
      FROM (
        SELECT
          r.id,
          r."zonaId",
          ROW_NUMBER() OVER (
            PARTITION BY r."zonaId"
            ORDER BY r."numeroRonda" DESC, r.id DESC
          ) AS rn
        FROM rondas_conteo r
        WHERE r."inventarioId" = :inventarioId
          AND r."tipoRonda" = 'completa'
          AND r.estado IN ('activa', 'pausada', 'cerrada')
          ${zonaId ? 'AND r."zonaId" = :zonaId' : ''}
      ) x
      WHERE x.rn = 1
    )
    SELECT
      z.id AS "id",
      z.nombre AS "nombre",
      z.codigo AS "codigo",
      COALESCE(SUM(l.cantidad), 0)::int AS "totalEscaneos",
      COUNT(DISTINCT l.sku)::int AS "productosUnicos"
    FROM lecturas l
    INNER JOIN ultima_ronda ur ON ur.id = l."rondaId"
    LEFT JOIN zonas z ON z.id = l."zonaId"
    WHERE l."inventarioId" = :inventarioId
      AND l.estado = 'valida'
      ${filter}
    GROUP BY z.id, z.nombre, z.codigo
    ORDER BY z.nombre ASC
    `,
    { replacements: { inventarioId, allowedGroupIds, zonaId: zonaId || null }, type: QueryTypes.SELECT }
  );
}


async function getTotalesPorMiembro(inventarioId, allowedGroupIds, zonaId) {
  const filter = buildLecturasFilterSql({
    groupIds: allowedGroupIds,
    zonaId,
    alias: 'l',
    groupParam: 'allowedGroupIds',
    zonaParam: 'zonaId'
  });

  return sequelize.query(
    `
    WITH ultima_ronda AS (
      SELECT id
      FROM (
        SELECT
          r.id,
          r."zonaId",
          ROW_NUMBER() OVER (
            PARTITION BY r."zonaId"
            ORDER BY r."numeroRonda" DESC, r.id DESC
          ) AS rn
        FROM rondas_conteo r
        WHERE r."inventarioId" = :inventarioId
          AND r."tipoRonda" = 'completa'
          AND r.estado IN ('activa', 'pausada', 'cerrada')
          ${zonaId ? 'AND r."zonaId" = :zonaId' : ''}
      ) x
      WHERE x.rn = 1
    )
    SELECT
      u.id AS "id",
      u.nombre AS "nombre",
      u.email AS "email",
      MAX(g.nombre) AS "grupo",
      MAX(z.nombre) AS "zona",
      COALESCE(SUM(l.cantidad), 0)::int AS "totalEscaneos",
      COUNT(DISTINCT l.sku)::int AS "productosUnicos"
    FROM lecturas l
    INNER JOIN ultima_ronda ur ON ur.id = l."rondaId"
    LEFT JOIN usuarios u ON u.id = l."usuarioId"
    LEFT JOIN grupos g ON g.id = l."grupoId"
    LEFT JOIN zonas z ON z.id = l."zonaId"
    WHERE l."inventarioId" = :inventarioId
      AND l.estado = 'valida'
      ${filter}
    GROUP BY u.id, u.nombre, u.email
    ORDER BY u.nombre ASC
    `,
    { replacements: { inventarioId, allowedGroupIds, zonaId: zonaId || null }, type: QueryTypes.SELECT }
  );
}


async function buildComparisonData(
  req,
  inventarioBaseId,
  inventarioComparadoId,
  zonaBaseId,
  zonaComparadaId
) {
  const allowedGroupIds = await getAllowedGroupIds(req);

  let zonaBase = null;
  let zonaComparada = null;

  if ((zonaBaseId && !zonaComparadaId) || (!zonaBaseId && zonaComparadaId)) {
    const error = new Error(
      'Si vas a comparar por zona, debes seleccionar zona base y zona comparada.'
    );
    error.status = 400;
    throw error;
  }

  if (zonaBaseId && zonaComparadaId) {
    const zonas = await Promise.all([
      Zona.findByPk(Number(zonaBaseId), { attributes: ['id', 'nombre', 'codigo'] }),
      Zona.findByPk(Number(zonaComparadaId), { attributes: ['id', 'nombre', 'codigo'] })
    ]);

    zonaBase = zonas[0];
    zonaComparada = zonas[1];

    if (!zonaBase || !zonaComparada) {
      const error = new Error('Una de las zonas seleccionadas no existe');
      error.status = 404;
      throw error;
    }

    if (!areEquivalentZones(zonaBase, zonaComparada)) {
      const error = new Error(
        `No se puede comparar la zona "${zonaBase.nombre}" con "${zonaComparada.nombre}" porque no son equivalentes.`
      );
      error.status = 400;
      throw error;
    }
  }

  const comparisonRows = await getSkuComparisonRows(
    inventarioBaseId,
    inventarioComparadoId,
    allowedGroupIds,
    zonaBaseId,
    zonaComparadaId
  );

  const coinciden = comparisonRows.filter((row) => row.estado === 'coincide');
  const diferencias = comparisonRows.filter((row) => row.estado === 'difiere');

  const [
    gruposBase,
    gruposComparado,
    zonasBase,
    zonasComparado,
    miembrosBase,
    miembrosComparado
  ] = await Promise.all([
    getTotalesPorGrupo(inventarioBaseId, allowedGroupIds, zonaBaseId),
    getTotalesPorGrupo(inventarioComparadoId, allowedGroupIds, zonaComparadaId),
    getTotalesPorZona(inventarioBaseId, allowedGroupIds, zonaBaseId),
    getTotalesPorZona(inventarioComparadoId, allowedGroupIds, zonaComparadaId),
    getTotalesPorMiembro(inventarioBaseId, allowedGroupIds, zonaBaseId),
    getTotalesPorMiembro(inventarioComparadoId, allowedGroupIds, zonaComparadaId)
  ]);

  return {
    filtros: {
      inventarioBaseId,
      inventarioComparadoId,
      zonaBase: zonaBase ? zonaBase.toJSON() : null,
      zonaComparada: zonaComparada ? zonaComparada.toJSON() : null
    },
    resumen: {
      inventarioBaseId,
      inventarioComparadoId,
      totalItemsComparados: comparisonRows.length,
      totalDiferencias: diferencias.length,
      totalDiferenciaUnidades: diferencias.reduce((sum, row) => sum + Math.abs(row.diferencia), 0)
    },
    comparacion: comparisonRows,
    coinciden,
    diferencias,
    totales: {
      base: {
        grupos: gruposBase,
        zonas: zonasBase,
        miembros: miembrosBase
      },
      comparado: {
        grupos: gruposComparado,
        zonas: zonasComparado,
        miembros: miembrosComparado
      }
    }
  };
}

async function compareInventarios(req, res, next) {
  try {
    const { error, value } = compareSchema.validate(req.query);

    if (error) {
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const data = await buildComparisonData(
      req,
      Number(value.inventarioBaseId),
      Number(value.inventarioComparadoId),
      value.zonaBaseId ? Number(value.zonaBaseId) : null,
      value.zonaComparadaId ? Number(value.zonaComparadaId) : null
    );

    const pareja = await parejaService.crearOPareja(
      Number(value.inventarioBaseId),
      Number(value.inventarioComparadoId),
      value.zonaBaseId ? Number(value.zonaBaseId) : null
    );

    if (data.diferencias.length > 0 && pareja.estado === 'completada') {
      await parejaService.actualizarEstadoPareja(pareja.id, 'pendiente');
    }

    res.json({
      ok: true,
      data: {
        ...data,
        pareja: {
          id: pareja.id,
          estado: pareja.estado,
          fechaComparacion: pareja.fechaComparacion
        }
      }
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        ok: false,
        message: error.message
      });
    }
    next(error);
  }
}


function sanitizeExcelSheetName(name) {
  return String(name || 'Hoja')
    .replace(/[\\/*?:[\]]/g, '')
    .substring(0, 31)
    .trim() || 'Hoja';
}

function addWorksheetSafe(workbook, desiredName, usedNames) {
  const baseName = sanitizeExcelSheetName(desiredName);
  let sheetName = baseName;
  let counter = 2;

  while (usedNames.has(sheetName)) {
    const suffix = ` ${counter}`;
    sheetName = `${baseName.substring(0, 31 - suffix.length)}${suffix}`;
    counter += 1;
  }

  usedNames.add(sheetName);
  return workbook.addWorksheet(sheetName);
}

function styleHeaderRow(sheet, argb = 'FF2563EB') {
  const header = sheet.getRow(1);

  header.font = {
    bold: true,
    color: { argb: 'FFFFFFFF' }
  };

  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb }
  };

  header.alignment = {
    vertical: 'middle',
    horizontal: 'center',
    wrapText: true
  };
}

function getCantidadAceptadaExcel(cantidadesAceptadas, row) {
  const keys = [
    `${row.zonaBase?.id}|${row.zonaComparada?.id}|${row.sku}`,
    `${row.zonaBase?.id}-${row.zonaComparada?.id}-${row.sku}`,
    String(row.sku)
  ];

  for (const key of keys) {
    if (cantidadesAceptadas && cantidadesAceptadas[key] !== undefined) {
      return Number(cantidadesAceptadas[key] || 0);
    }
  }

  return Number(row.cantidadComparada || 0);
}

async function getZonasInventarioParaExcel(inventarioId, allowedGroupIds = null) {
  if (
    allowedGroupIds !== null &&
    (!Array.isArray(allowedGroupIds) || allowedGroupIds.length === 0)
  ) {
    return [];
  }

  const groupFilter = allowedGroupIds !== null
    ? 'AND l."grupoId" IN (:allowedGroupIds)'
    : '';

  return sequelize.query(
    `
    SELECT DISTINCT
      z.id,
      z.nombre,
      z.codigo
    FROM zonas z
    WHERE EXISTS (
      SELECT 1
      FROM lecturas l
      WHERE l."inventarioId" = :inventarioId
        AND l."zonaId" = z.id
        AND l.estado = 'valida'
        ${groupFilter}
    )
    OR EXISTS (
      SELECT 1
      FROM rondas_conteo r
      WHERE r."inventarioId" = :inventarioId
        AND r."zonaId" = z.id
    )
    ORDER BY z.nombre ASC
    `,
    {
      replacements: {
        inventarioId,
        allowedGroupIds
      },
      type: QueryTypes.SELECT
    }
  );
}

async function getZonaPairsParaExportacion({
  inventarioBaseId,
  inventarioComparadoId,
  zonaBaseId,
  zonaComparadaId,
  allowedGroupIds
}) {
  if (zonaBaseId && zonaComparadaId) {
    const [zonaBase, zonaComparada] = await Promise.all([
      Zona.findByPk(Number(zonaBaseId), {
        attributes: ['id', 'nombre', 'codigo']
      }),
      Zona.findByPk(Number(zonaComparadaId), {
        attributes: ['id', 'nombre', 'codigo']
      })
    ]);

    if (!zonaBase || !zonaComparada) {
      const error = new Error('Una de las zonas seleccionadas no existe');
      error.status = 404;
      throw error;
    }

    if (!areEquivalentZones(zonaBase, zonaComparada)) {
      const error = new Error(
        `No se puede exportar la zona "${zonaBase.nombre}" contra "${zonaComparada.nombre}" porque no son equivalentes.`
      );
      error.status = 400;
      throw error;
    }

    return [
      {
        zonaBase: zonaBase.toJSON ? zonaBase.toJSON() : zonaBase,
        zonaComparada: zonaComparada.toJSON ? zonaComparada.toJSON() : zonaComparada
      }
    ];
  }

  const [zonasBase, zonasComparado] = await Promise.all([
    getZonasInventarioParaExcel(inventarioBaseId, allowedGroupIds),
    getZonasInventarioParaExcel(inventarioComparadoId, allowedGroupIds)
  ]);

  const pairs = [];

  for (const zonaBase of zonasBase) {
    const zonaComparada = zonasComparado.find((zona) =>
      areEquivalentZones(zonaBase, zona)
    );

    if (zonaComparada) {
      pairs.push({
        zonaBase,
        zonaComparada
      });
    }
  }

  return pairs;
}

function setupInventarioCompletoSheet(sheet) {
  sheet.columns = [
    { header: 'Empresa', key: 'empresa', width: 34 },
    { header: 'Tipo Documento', key: 'tipoDocumento', width: 16 },
    { header: 'Documento Número', key: 'documentoNumero', width: 20 },
    { header: 'Fecha', key: 'fecha', width: 14 },
    { header: 'Elaborado', key: 'elaborado', width: 24 },
    { header: 'Destino', key: 'destino', width: 28 },
    { header: 'Nota', key: 'nota', width: 40 },
    { header: 'Verificado', key: 'verificado', width: 12 },
    { header: 'Anulado', key: 'anulado', width: 10 },
    { header: 'Producto', key: 'producto', width: 18 },
    { header: 'Descripción', key: 'descripcion', width: 60 },
    { header: 'Unidad De Medida', key: 'unidadMedida', width: 18 },
    { header: 'Cantidad Físico', key: 'cantidadFisico', width: 18 },
    { header: 'Cantidad Sistema', key: 'cantidadSistema', width: 18 },
    { header: 'IVA', key: 'iva', width: 10 },
    { header: 'Valor Unitario', key: 'valorUnitario', width: 16 },
    { header: 'Descuento', key: 'descuento', width: 12 },
    { header: 'Vencimiento', key: 'vencimiento', width: 14 },
    { header: 'Lote', key: 'lote', width: 16 },
    { header: 'Talla', key: 'talla', width: 10 },
    { header: 'Color', key: 'color', width: 16 }
  ];

  styleHeaderRow(sheet, 'FF2563EB');

  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  sheet.getColumn('cantidadFisico').numFmt = '#,##0';
  sheet.getColumn('cantidadSistema').numFmt = '#,##0';
  sheet.getColumn('iva').numFmt = '#,##0';
  sheet.getColumn('valorUnitario').numFmt = '#,##0';
  sheet.getColumn('descuento').numFmt = '#,##0';
}

function addInventarioCompletoRowsToSheet({
  sheet,
  rows,
  cantidadesAceptadas,
  productosMap,
  nombreEmpresa,
  fechaStr,
  mesActual,
  elaboradoPor
}) {
  for (const row of rows) {
    const cantidadAceptada = getCantidadAceptadaExcel(cantidadesAceptadas, row);
    const datosProducto = productosMap.get(String(row.sku)) || {};

    const valorUnitario = Number(
      datosProducto.precioCoste ||
      datosProducto.valorUnitario ||
      0
    );

    sheet.addRow({
      empresa: nombreEmpresa,
      tipoDocumento: 'AI',
      documentoNumero: '',
      fecha: fechaStr,
      elaborado: elaboradoPor,

      // Destino original del Excel importado en conteo inicial.
      destino: datosProducto.grupoNombre || 'SIN DESTINO',

      nota: `Ajuste de inventario - ${mesActual}`,
      verificado: -1,
      anulado: 0,
      producto: row.sku,
      descripcion: datosProducto.descripcion || row.descripcion || 'Sin descripción',
      unidadMedida: datosProducto.unidadMedida || 'Und.',
      cantidadFisico: cantidadAceptada,
      cantidadSistema: 0,
      iva: 0,
      valorUnitario,
      descuento: 0,
      vencimiento: datosProducto.vencimiento || '',
      lote: datosProducto.lote || '',
      talla: datosProducto.talla || '',
      color: datosProducto.color || ''
    });
  }
}

function setupComparisonSheet(sheet) {
  sheet.columns = [
    { header: 'Zona Base', key: 'zonaBase', width: 24 },
    { header: 'Zona Comparada', key: 'zonaComparada', width: 24 },
    { header: 'SKU', key: 'sku', width: 16 },
    { header: 'Descripción', key: 'descripcion', width: 55 },
    { header: 'Cantidad Base', key: 'cantidadBase', width: 15 },
    { header: 'Cantidad Comparada', key: 'cantidadComparada', width: 18 },
    { header: 'Cantidad Aceptada', key: 'cantidadAceptada', width: 18 },
    { header: 'Diferencia', key: 'diferencia', width: 14 },
    { header: 'Estado', key: 'estado', width: 16 },
    { header: 'Fuente Base', key: 'fuenteBase', width: 16 },
    { header: 'Fuente Comparada', key: 'fuenteComparada', width: 18 },
    { header: 'Ronda Base ID', key: 'rondaBaseId', width: 14 },
    { header: 'Ronda Comparada ID', key: 'rondaComparadaId', width: 18 },
    { header: 'Valor Unitario', key: 'valorUnitario', width: 16 },
    { header: 'Subtotal', key: 'subtotal', width: 16 }
  ];

  styleHeaderRow(sheet, 'FFDC2626');

  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  sheet.getColumn('cantidadBase').numFmt = '#,##0';
  sheet.getColumn('cantidadComparada').numFmt = '#,##0';
  sheet.getColumn('cantidadAceptada').numFmt = '#,##0';
  sheet.getColumn('diferencia').numFmt = '#,##0';
  sheet.getColumn('valorUnitario').numFmt = '#,##0';
  sheet.getColumn('subtotal').numFmt = '#,##0';
}

function addComparisonRowsToSheet(sheet, rows, cantidadesAceptadas, productosMap) {
  for (const row of rows) {
    const cantidadAceptada = getCantidadAceptadaExcel(cantidadesAceptadas, row);
    const datosProducto = productosMap.get(String(row.sku)) || {};
    const valorUnitario = Number(datosProducto.precioCoste || datosProducto.valorUnitario || 0);

    sheet.addRow({
      zonaBase: row.zonaBase?.nombre || 'Todas',
      zonaComparada: row.zonaComparada?.nombre || 'Todas',
      sku: row.sku,
      descripcion: datosProducto.descripcion || row.descripcion || 'Sin descripción',
      cantidadBase: Number(row.cantidadBase || 0),
      cantidadComparada: Number(row.cantidadComparada || 0),
      cantidadAceptada,
      diferencia: Number(row.diferencia || 0),
      estado: Number(row.diferencia || 0) === 0 ? 'Coincide' : 'Difiere',
      fuenteBase: row.fuenteBase || 'completa',
      fuenteComparada: row.fuenteComparada || 'completa',
      rondaBaseId: row.rondaBaseId || '',
      rondaComparadaId: row.rondaComparadaId || '',
      valorUnitario,
      subtotal: cantidadAceptada * valorUnitario
    });
  }
}

async function exportarComparacionExcel(req, res, next) {
  try {
    console.log('📥 Exportando diferencias a Excel por zonas...');
    console.log('📋 Método:', req.method);
    console.log('📋 Query recibido:', req.query);
    console.log('📋 Body recibido:', req.body);

    const { error, value } = compareSchema.validate(req.query);

    if (error) {
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    let cantidadesAceptadas = {};

    if (req.method === 'POST') {
      cantidadesAceptadas = req.body.cantidadesAceptadas || {};
    } else {
      const rawCantidades = req.query.cantidadesAceptadas;

      if (rawCantidades) {
        try {
          cantidadesAceptadas = JSON.parse(rawCantidades);
        } catch {
          cantidadesAceptadas = {};
        }
      }
    }

    if (typeof cantidadesAceptadas === 'string') {
      try {
        cantidadesAceptadas = JSON.parse(cantidadesAceptadas);
      } catch {
        cantidadesAceptadas = {};
      }
    }

    const inventarioBaseId = Number(value.inventarioBaseId);
    const inventarioComparadoId = Number(value.inventarioComparadoId);
    const zonaBaseId = value.zonaBaseId ? Number(value.zonaBaseId) : null;
    const zonaComparadaId = value.zonaComparadaId ? Number(value.zonaComparadaId) : null;

    if ((zonaBaseId && !zonaComparadaId) || (!zonaBaseId && zonaComparadaId)) {
      return res.status(400).json({
        ok: false,
        message: 'Si vas a exportar por zona, debes enviar zonaBaseId y zonaComparadaId.'
      });
    }

    const allowedGroupIds = await getAllowedGroupIds(req);

    const zonaPairs = await getZonaPairsParaExportacion({
      inventarioBaseId,
      inventarioComparadoId,
      zonaBaseId,
      zonaComparadaId,
      allowedGroupIds
    });

    if (!zonaPairs.length) {
      return res.status(400).json({
        ok: false,
        message: 'No se encontraron zonas equivalentes para exportar.'
      });
    }

    const workbook = new ExcelJS.Workbook();
    const usedSheetNames = new Set();

    const fechaActual = new Date();
    const fechaStr = fechaActual.toISOString().slice(0, 10);
    const mesActual = fechaActual.toLocaleString('es', { month: 'long' });
    const nombreEmpresa = 'TECNOCOMPUTER MELISSA SANDOVAL';
    const elaboradoPor = req.user?.nombre || 'Admin';

    const zonasExportadas = [];

    for (const pair of zonaPairs) {
      const dataZona = await buildComparisonData(
        req,
        inventarioBaseId,
        inventarioComparadoId,
        pair.zonaBase.id,
        pair.zonaComparada.id
      );

      zonasExportadas.push({
        pair,
        data: dataZona
      });
    }

    const todosRows = [];

    for (const zonaExportada of zonasExportadas) {
      const { pair, data } = zonaExportada;

      for (const row of data.comparacion || []) {
        todosRows.push({
          ...row,
          zonaBase: pair.zonaBase,
          zonaComparada: pair.zonaComparada
        });
      }
    }

    const diferenciasRows = todosRows.filter((row) => Number(row.diferencia || 0) !== 0);
    const coincidenRows = todosRows.filter((row) => Number(row.diferencia || 0) === 0);

    const { ConteoInicialDetalle } = require('../models');

    const skusUnicos = [...new Set(todosRows.map((row) => String(row.sku)).filter(Boolean))];

    let productosInfo = [];

    if (skusUnicos.length > 0) {
      productosInfo = await ConteoInicialDetalle.findAll({
        where: {
          inventarioId: {
            [Op.in]: [inventarioBaseId, inventarioComparadoId]
          },
          sku: {
            [Op.in]: skusUnicos
          }
        },
        attributes: [
          'sku',
          'descripcionSnapshot',
          'unidadMedida',
          'grupoNombre',
          'precioCoste'
        ]
      });
    }

    const productosMap = new Map();

    for (const producto of productosInfo) {
      const sku = String(producto.sku);

      if (!productosMap.has(sku)) {
        productosMap.set(sku, {
          descripcion: producto.descripcionSnapshot || 'Sin descripción',
          unidadMedida: producto.unidadMedida || 'Und.',

          // Este es el valor importado desde el Excel de conteo inicial.
          // En tu modelo no existe "destino"; el valor está guardado como grupoNombre.
          grupoNombre: producto.grupoNombre || 'SIN DESTINO',

          precioCoste: Number(producto.precioCoste || 0),
          valorUnitario: Number(producto.precioCoste || 0),
          vencimiento: '',
          lote: '',
          talla: '',
          color: ''
        });
      }
    }

    // ==================== RESUMEN ====================
    const resumenSheet = addWorksheetSafe(workbook, 'Resumen General', usedSheetNames);

    resumenSheet.columns = [
      { header: 'Concepto', key: 'concepto', width: 36 },
      { header: 'Valor', key: 'valor', width: 32 }
    ];

    styleHeaderRow(resumenSheet);

    const totalUnidadesAceptadas = todosRows.reduce((sum, row) => {
      return sum + getCantidadAceptadaExcel(cantidadesAceptadas, row);
    }, 0);

    const valorTotalInventario = todosRows.reduce((sum, row) => {
      const cantidadAceptada = getCantidadAceptadaExcel(cantidadesAceptadas, row);
      const producto = productosMap.get(String(row.sku)) || {};
      const precio = Number(producto.precioCoste || producto.valorUnitario || 0);
      return sum + cantidadAceptada * precio;
    }, 0);

    resumenSheet.addRows([
      { concepto: '📊 INFORMACIÓN GENERAL', valor: '' },
      { concepto: 'Fecha Exportación', valor: fechaActual.toLocaleString() },
      { concepto: 'Empresa', valor: nombreEmpresa },
      { concepto: 'Elaborado Por', valor: elaboradoPor },
      { concepto: '', valor: '' },
      { concepto: '📦 INVENTARIOS COMPARADOS', valor: '' },
      { concepto: 'Inventario Base ID', valor: inventarioBaseId },
      { concepto: 'Inventario Comparado ID', valor: inventarioComparadoId },
      { concepto: 'Modo Exportación', valor: zonaBaseId && zonaComparadaId ? 'Zona específica' : 'Todas las zonas' },
      { concepto: 'Total Zonas Exportadas', valor: zonasExportadas.length },
      { concepto: '', valor: '' },
      { concepto: '📈 ESTADÍSTICAS', valor: '' },
      { concepto: 'Total SKUs Comparados', valor: todosRows.length },
      { concepto: 'Total Coincidencias', valor: coincidenRows.length },
      { concepto: 'Total Diferencias', valor: diferenciasRows.length },
      { concepto: 'Total Diferencia Unidades', valor: diferenciasRows.reduce((sum, row) => sum + Math.abs(Number(row.diferencia || 0)), 0) },
      { concepto: '', valor: '' },
      { concepto: '💰 VALORES', valor: '' },
      { concepto: 'Total Unidades Aceptadas', valor: totalUnidadesAceptadas },
      { concepto: 'Valor Total Inventario', valor: valorTotalInventario },
      { concepto: '', valor: '' },
      { concepto: '📋 CONFIGURACIÓN', valor: '' },
      { concepto: 'Tipo Documento', valor: 'AI' },
      { concepto: 'Verificado', valor: '-1 (SI)' },
      { concepto: 'Anulado', valor: '0 (NO)' },
      { concepto: 'IVA', valor: '0' }
    ]);

    resumenSheet.getColumn('valor').numFmt = '#,##0';

    // ==================== ÍNDICE DE ZONAS ====================
    const zonasSheet = addWorksheetSafe(workbook, 'Zonas Exportadas', usedSheetNames);

    zonasSheet.columns = [
      { header: 'Zona Base ID', key: 'zonaBaseId', width: 14 },
      { header: 'Zona Base', key: 'zonaBaseNombre', width: 28 },
      { header: 'Zona Comparada ID', key: 'zonaComparadaId', width: 18 },
      { header: 'Zona Comparada', key: 'zonaComparadaNombre', width: 28 },
      { header: 'SKUs Comparados', key: 'total', width: 18 },
      { header: 'Diferencias', key: 'diferencias', width: 14 },
      { header: 'Coincidencias', key: 'coincidencias', width: 14 }
    ];

    styleHeaderRow(zonasSheet, 'FF0F766E');

    for (const zonaExportada of zonasExportadas) {
      const { pair, data } = zonaExportada;
      const total = data.comparacion?.length || 0;
      const diferencias = data.diferencias?.length || 0;

      zonasSheet.addRow({
        zonaBaseId: pair.zonaBase.id,
        zonaBaseNombre: pair.zonaBase.nombre,
        zonaComparadaId: pair.zonaComparada.id,
        zonaComparadaNombre: pair.zonaComparada.nombre,
        total,
        diferencias,
        coincidencias: Math.max(total - diferencias, 0)
      });
    }

    // ==================== INVENTARIO COMPLETO ====================
    const inventarioSheet = addWorksheetSafe(workbook, 'Inventario Completo', usedSheetNames);

    setupInventarioCompletoSheet(inventarioSheet);

    addInventarioCompletoRowsToSheet({
      sheet: inventarioSheet,
      rows: todosRows,
      cantidadesAceptadas,
      productosMap,
      nombreEmpresa,
      fechaStr,
      mesActual,
      elaboradoPor
    });

    // ==================== DETALLE DIFERENCIAS ====================
    const diferenciasSheet = addWorksheetSafe(workbook, 'Detalle Diferencias', usedSheetNames);

    setupComparisonSheet(diferenciasSheet);
    styleHeaderRow(diferenciasSheet, 'FFDC2626');

    addComparisonRowsToSheet(
      diferenciasSheet,
      diferenciasRows,
      cantidadesAceptadas,
      productosMap
    );

    // ==================== HOJAS POR ZONA ====================
    for (const zonaExportada of zonasExportadas) {
      const { pair, data } = zonaExportada;

      const sheetName =
        pair.zonaBase?.nombre ||
        pair.zonaComparada?.nombre ||
        `Zona ${pair.zonaBase?.id || ''}`;

      const zonaSheet = addWorksheetSafe(workbook, sheetName, usedSheetNames);

      setupInventarioCompletoSheet(zonaSheet);

      const rowsZona = (data.comparacion || []).map((row) => ({
        ...row,
        zonaBase: pair.zonaBase,
        zonaComparada: pair.zonaComparada
      }));

      addInventarioCompletoRowsToSheet({
        sheet: zonaSheet,
        rows: rowsZona,
        cantidadesAceptadas,
        productosMap,
        nombreEmpresa,
        fechaStr,
        mesActual,
        elaboradoPor,
      });
    }

    workbook.eachSheet((sheet) => {
      sheet.views = [{ state: 'frozen', ySplit: 1 }];

      sheet.eachRow((row) => {
        row.alignment = {
          vertical: 'middle',
          wrapText: true
        };
      });
    });

    const filename = zonaBaseId && zonaComparadaId
      ? `inventario_diferencias_${inventarioBaseId}_vs_${inventarioComparadoId}_zona_${zonaBaseId}_${fechaStr}.xlsx`
      : `inventario_diferencias_${inventarioBaseId}_vs_${inventarioComparadoId}_todas_zonas_${fechaStr}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(filename)}"`
    );

    await workbook.xlsx.write(res);
    res.end();

    console.log(
      `✅ Excel generado por zonas: ${zonasExportadas.length} zonas, ${todosRows.length} registros, ${diferenciasRows.length} diferencias`
    );
  } catch (error) {
    console.error('❌ Error en exportarComparacionExcel:', error);

    if (error.status) {
      return res.status(error.status).json({
        ok: false,
        message: error.message
      });
    }

    next(error);
  }
}

async function generarReconteoDesdeComparacion(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    console.log('🚨 ENDPOINT /diferencias/reconteo - FUNCIÓN CON DESTINO SELECCIONABLE');
    console.log('\n====== DEBUG generarReconteoDesdeComparacion BODY ======');
    console.log('Body recibido:', req.body);
    console.log('======================================================\n');

    const {
      inventarioBaseId,
      inventarioComparadoId,
      zonaBaseId,
      zonaComparadaId,
      zonaId,
      reconteoDestino = 'comparado',
      alcanceReconteo = 'pendientes'
    } = req.body;

    const inventarioBaseIdNum = Number(inventarioBaseId);
    const inventarioComparadoIdNum = Number(inventarioComparadoId);

    // Compatibilidad: si llega frontend viejo con solo zonaId, se usa para ambas zonas.
    const zonaBaseRaw = zonaBaseId ?? zonaId ?? null;
    const zonaComparadaRaw = zonaComparadaId ?? zonaId ?? null;

    const zonaBaseIdNum = zonaBaseRaw ? Number(zonaBaseRaw) : null;
    const zonaComparadaIdNum = zonaComparadaRaw ? Number(zonaComparadaRaw) : null;

    const destinoNormalizado = String(reconteoDestino || 'comparado').toLowerCase();
    const alcanceNormalizado = String(alcanceReconteo || 'pendientes').toLowerCase();

    console.log('🔥 generarReconteoDesdeComparacion - Parámetros:', {
      inventarioBaseId: inventarioBaseIdNum,
      inventarioComparadoId: inventarioComparadoIdNum,
      zonaBaseId: zonaBaseIdNum,
      zonaComparadaId: zonaComparadaIdNum,
      reconteoDestino: destinoNormalizado,
      alcanceReconteo: alcanceNormalizado
    });

    if (!inventarioBaseIdNum || !inventarioComparadoIdNum) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: 'Se requiere inventarioBaseId y inventarioComparadoId'
      });
    }

    if (inventarioBaseIdNum === inventarioComparadoIdNum) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: 'El inventario base y el inventario comparado deben ser distintos'
      });
    }

    if (!zonaBaseIdNum || !zonaComparadaIdNum) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: 'Para generar reconteo debes enviar zonaBaseId y zonaComparadaId.'
      });
    }

    if (!['base', 'comparado'].includes(destinoNormalizado)) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: 'reconteoDestino debe ser "base" o "comparado".'
      });
    }

    if (!['pendientes', 'inventario_base'].includes(alcanceNormalizado)) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: 'alcanceReconteo debe ser "pendientes" o "inventario_base".'
      });
    }

    const [zonaBase, zonaComparada] = await Promise.all([
      Zona.findByPk(zonaBaseIdNum, {
        attributes: ['id', 'nombre', 'codigo'],
        transaction
      }),
      Zona.findByPk(zonaComparadaIdNum, {
        attributes: ['id', 'nombre', 'codigo'],
        transaction
      })
    ]);

    if (!zonaBase || !zonaComparada) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: 'Una de las zonas seleccionadas no existe'
      });
    }

    if (!areEquivalentZones(zonaBase, zonaComparada)) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: `No se puede generar reconteo entre la zona "${zonaBase.nombre}" y "${zonaComparada.nombre}" porque no son equivalentes.`
      });
    }

    /*
      La comparación siempre se calcula así:
      base vs comparado.

      Pero el reconteo puede crearse en:
      - base
      - comparado
    */
    const reconteoEnBase = destinoNormalizado === 'base';

    const inventarioObjetivoId = reconteoEnBase
      ? inventarioBaseIdNum
      : inventarioComparadoIdNum;

    const zonaObjetivoId = reconteoEnBase
      ? zonaBaseIdNum
      : zonaComparadaIdNum;

    const inventarioReferenciaId = reconteoEnBase
      ? inventarioComparadoIdNum
      : inventarioBaseIdNum;

    const zonaReferenciaId = reconteoEnBase
      ? zonaComparadaIdNum
      : zonaBaseIdNum;

    const zonaObjetivo = reconteoEnBase ? zonaBase : zonaComparada;
    const zonaReferencia = reconteoEnBase ? zonaComparada : zonaBase;

    const allowedGroupIds = await getAllowedGroupIds(req);

    const comparisonRows = await getSkuComparisonRows(
      inventarioBaseIdNum,
      inventarioComparadoIdNum,
      allowedGroupIds,
      zonaBaseIdNum,
      zonaComparadaIdNum
    );

    const diferencias = comparisonRows.filter((row) => Number(row.diferencia || 0) !== 0);

    console.log(`📊 Diferencias encontradas: ${diferencias.length}`);

    if (diferencias.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: 'No se generó reconteo porque la comparación no encontró diferencias para las zonas enviadas.',
        debug: {
          inventarioBaseId: inventarioBaseIdNum,
          inventarioComparadoId: inventarioComparadoIdNum,
          zonaBaseId: zonaBaseIdNum,
          zonaComparadaId: zonaComparadaIdNum,
          reconteoDestino: destinoNormalizado,
          totalComparados: comparisonRows.length,
          alcanceReconteo: alcanceNormalizado
        }
      });
    }

    const ultimaRondaReferenciaCompleta = await RondaConteo.findOne({
      where: {
        inventarioId: inventarioReferenciaId,
        zonaId: zonaReferenciaId,
        tipoRonda: 'completa',
        estado: { [Op.in]: ['activa', 'pausada', 'cerrada'] }
      },
      order: [['numeroRonda', 'DESC']],
      transaction
    });

    if (!ultimaRondaReferenciaCompleta) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: `No existe una ronda completa cerrada para el inventario de referencia en la zona ${zonaReferencia.nombre}.`
      });
    }

    const ultimaRondaObjetivoCompleta = await RondaConteo.findOne({
      where: {
        inventarioId: inventarioObjetivoId,
        zonaId: zonaObjetivoId,
        tipoRonda: 'completa',
        estado: { [Op.in]: ['activa', 'pausada', 'cerrada'] }
      },
      order: [['numeroRonda', 'DESC']],
      transaction
    });

    if (!ultimaRondaObjetivoCompleta) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: `No existe una ronda completa cerrada para el inventario donde se hará el reconteo en la zona ${zonaObjetivo.nombre}.`
      });
    }

    const ultimaRondaObjetivo = await RondaConteo.findOne({
      where: {
        inventarioId: inventarioObjetivoId,
        zonaId: zonaObjetivoId
      },
      order: [['numeroRonda', 'DESC']],
      transaction
    });

    const nuevoNumeroRonda = Number(ultimaRondaObjetivo?.numeroRonda || 0) + 1;

    const nuevaRonda = await RondaConteo.create(
      {
        inventarioId: inventarioObjetivoId,
        zonaId: zonaObjetivoId,
        numeroRonda: nuevoNumeroRonda,
        tipoRonda: 'reconteo',
        alcanceReconteo: alcanceNormalizado,
        estado: 'activa',
        generadaDesdeRondaId: ultimaRondaObjetivoCompleta.id,
        observaciones: alcanceNormalizado === 'inventario_base'
          ? `Reconteo completo del inventario base. Generado desde comparación ${inventarioBaseIdNum} vs ${inventarioComparadoIdNum}. Destino: ${destinoNormalizado}`
          : `Reconteo solo de pendientes. Generado desde comparación ${inventarioBaseIdNum} vs ${inventarioComparadoIdNum}. Destino: ${destinoNormalizado}`
      },
      { transaction }
    );

    console.log(
      `✅ Ronda de reconteo creada: ID ${nuevaRonda.id}, Número ${nuevoNumeroRonda}, Inventario ${inventarioObjetivoId}, Zona ${zonaObjetivoId}, Destino ${destinoNormalizado}`
    );

    const {
      Grupo,
      AsignacionRonda,
      AsignacionConteo
    } = require('../models');

    /*
      asignaciones_ronda tiene unique por rondaId.
      Por eso se crea SOLO una asignación principal.
      La visibilidad para otros grupos debe manejarse desde getMisRondasParaEscaneo
      usando asignaciones_conteo para rondas tipo reconteo.
    */
    const asignacionConteoPrincipal = await AsignacionConteo.findOne({
      where: {
        inventarioId: inventarioObjetivoId,
        zonaId: zonaObjetivoId
      },
      order: [
        ['conteoTipo', 'ASC'],
        ['id', 'ASC']
      ],
      transaction
    });

    let grupoPrincipalAsignado = null;

    if (asignacionConteoPrincipal?.grupoId) {
      grupoPrincipalAsignado = await Grupo.findByPk(asignacionConteoPrincipal.grupoId, {
        transaction
      });
    }

    if (!grupoPrincipalAsignado) {
      grupoPrincipalAsignado = await Grupo.findOne({
        where: {
          inventarioId: inventarioObjetivoId
        },
        order: [['id', 'ASC']],
        transaction
      });
    }

    if (!grupoPrincipalAsignado) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: `No se encontró grupo para asignar la ronda en el inventario ${inventarioObjetivoId}.`
      });
    }

    const asignacionExistente = await AsignacionRonda.findOne({
      where: {
        rondaId: nuevaRonda.id
      },
      transaction
    });

    if (asignacionExistente) {
      await asignacionExistente.update(
        {
          grupoId: grupoPrincipalAsignado.id,
          estado: 'asignada'
        },
        { transaction }
      );
    } else {
      await AsignacionRonda.create(
        {
          rondaId: nuevaRonda.id,
          grupoId: grupoPrincipalAsignado.id,
          estado: 'asignada'
        },
        { transaction }
      );
    }

    console.log(
      `✅ Ronda ${nuevaRonda.id} asignada como principal al grupo ${grupoPrincipalAsignado.id} - ${grupoPrincipalAsignado.nombre}`
    );

    let creadas = 0;
    let actualizadas = 0;

    for (const diferencia of diferencias) {
      /*
        En getSkuComparisonRows:
        - cantidadBase = inventario base
        - cantidadComparada = inventario comparado
        - diferencia = comparado - base

        Si el reconteo se hace en comparado:
        - referencia = base
        - objetivo anterior = comparado

        Si el reconteo se hace en base:
        - referencia = comparado
        - objetivo anterior = base
      */
      const cantidadReferencia = reconteoEnBase
        ? Number(diferencia.cantidadComparada || 0)
        : Number(diferencia.cantidadBase || 0);

      const cantidadObjetivoAnterior = reconteoEnBase
        ? Number(diferencia.cantidadBase || 0)
        : Number(diferencia.cantidadComparada || 0);

      const diferenciaObjetivo = cantidadObjetivoAnterior - cantidadReferencia;

      const payloadDiscrepancia = {
        productoId: diferencia.productoId || null,
        descripcionSnapshot: diferencia.descripcion || 'Sin descripción',
        cantidadBase: cantidadReferencia,
        cantidadUltima: cantidadObjetivoAnterior,
        diferencia: diferenciaObjetivo,
        estado: 'pendiente_reconteo',
        rondaBaseId: ultimaRondaReferenciaCompleta.id,
        ultimaRondaId: ultimaRondaObjetivoCompleta.id,
        rondaReconteoId: nuevaRonda.id,
        proximaRondaNumero: nuevoNumeroRonda,
        cantidadFinal: null,
        criterioCierre: null,
        cerradoEn: null,
        cantidadRecontada: 0,
        reconteoCount: 0
      };

      const existente = await DiscrepanciaConteo.findOne({
        where: {
          inventarioId: inventarioObjetivoId,
          zonaId: zonaObjetivoId,
          sku: diferencia.sku
        },
        transaction
      });

      if (existente) {
        await existente.update(payloadDiscrepancia, { transaction });
        actualizadas += 1;
        console.log(`🔄 Actualizada discrepancia para SKU: ${diferencia.sku}`);
      } else {
        await DiscrepanciaConteo.create(
          {
            inventarioId: inventarioObjetivoId,
            zonaId: zonaObjetivoId,
            sku: diferencia.sku,
            ...payloadDiscrepancia
          },
          { transaction }
        );

        creadas += 1;
        console.log(`✅ Creada discrepancia para SKU: ${diferencia.sku}`);
      }
    }

    console.log(`📊 Resumen: ${creadas} creadas, ${actualizadas} actualizadas`);

    let pareja = null;

    try {
      pareja = await parejaService.crearOPareja(
        inventarioBaseIdNum,
        inventarioComparadoIdNum,
        zonaBaseIdNum
      );

      if (pareja) {
        await pareja.update(
          {
            estado: 'en_reconteo',
            rondasReconteoGeneradas: Number(pareja.rondasReconteoGeneradas || 0) + 1,
            fechaComparacion: new Date(),
            fechaCompletada: null
          },
          { transaction }
        );
      }
    } catch (parejaError) {
      console.error(
        '⚠️ No se pudo actualizar la pareja, pero el reconteo continuará:',
        parejaError.message
      );
    }

    await transaction.commit();

    return res.json({
      ok: true,
      message: `Ronda de reconteo generada exitosamente en inventario ${inventarioObjetivoId} con ${diferencias.length} SKUs pendientes`,
      data: {
        ronda: {
          id: nuevaRonda.id,
          numeroRonda: nuevaRonda.numeroRonda,
          tipoRonda: nuevaRonda.tipoRonda,
          estado: nuevaRonda.estado,
          inventarioId: nuevaRonda.inventarioId,
          zonaId: nuevaRonda.zonaId
        },
        reconteoDestino: destinoNormalizado,
        inventarioObjetivoId,
        zonaObjetivoId,
        inventarioReferenciaId,
        zonaReferenciaId,
        inventarioBaseId: inventarioBaseIdNum,
        inventarioComparadoId: inventarioComparadoIdNum,
        zonaBaseId: zonaBaseIdNum,
        zonaComparadaId: zonaComparadaIdNum,
        grupoId: grupoPrincipalAsignado.id,
        grupoIds: [grupoPrincipalAsignado.id],
        totalDiferencias: diferencias.length,
        discrepanciasCreadas: creadas,
        discrepanciasActualizadas: actualizadas,
        pareja: pareja
          ? {
            id: pareja.id,
            estado: pareja.estado,
            rondasGeneradas: pareja.rondasReconteoGeneradas
          }
          : null
      }
    });
  } catch (error) {
    try {
      if (!transaction.finished) {
        await transaction.rollback();
      }
    } catch (rollbackError) {
      console.error(
        '❌ Error haciendo rollback en generarReconteoDesdeComparacion:',
        rollbackError
      );
    }

    console.error('❌ Error en generarReconteoDesdeComparacion:', error);
    next(error);
  }
}


async function completarPareja(req, res, next) {
  try {
    const { parejaId } = req.params;

    const pareja = await ParejaInventario.findByPk(parejaId);

    if (!pareja) {
      return res.status(404).json({
        ok: false,
        message: 'Pareja de inventarios no encontrada'
      });
    }

    const discrepanciasPendientes = await DiscrepanciaConteo.count({
      where: {
        inventarioId: pareja.inventarioBaseId,
        zonaId: pareja.zonaId || null,
        estado: {
          [Op.in]: ['pendiente_reconteo', 'reconteo_en_proceso', 'pendiente']
        }
      }
    });

    if (discrepanciasPendientes > 0) {
      return res.status(400).json({
        ok: false,
        message: `No se puede completar la pareja. Aún hay ${discrepanciasPendientes} discrepancias pendientes.`
      });
    }

    await pareja.update({
      estado: 'completada',
      fechaCompletada: new Date()
    });

    res.json({
      ok: true,
      message: 'Pareja de inventarios marcada como completada',
      data: pareja
    });
  } catch (error) {
    next(error);
  }
}

async function obtenerDatosProductosDesdeSQLServer(skusUnicos) {
  if (!skusUnicos || skusUnicos.length === 0) return new Map();

  try {
    const { getSqlServerPool } = require('../config/sqlserver');

    if (process.env.SQLSERVER_ENABLED !== 'true') {
      console.log('⚠️ SQL Server deshabilitado, usando datos por defecto');
      return new Map();
    }

    const sqlPool = await getSqlServerPool();

    const skusList = skusUnicos.map(s => `'${s.replace(/'/g, "''")}'`).join(',');

    const query = `
      SELECT 
        i.[CódigoInventario] as sku,
        i.[Descripción] as descripcion,
        i.UnidadDeMedida,
        i.IdGrupoInventarioDos,
        g.Descripcion as grupoNombre,
        ISNULL((
          SELECT TOP 1 c.CostoPromedio 
          FROM CCA_M_Inventarios c 
          WHERE c.IdInventario = i.IdInventario 
            AND c.CostoPromedio > 0
          ORDER BY c.IdAsientoContable DESC
        ), 0) as valorUnitario,
        ISNULL((
          SELECT TOP 1 c.IdLote
          FROM CCA_M_Inventarios c 
          WHERE c.IdInventario = i.IdInventario 
          ORDER BY c.IdAsientoContable DESC
        ), '') as lote,
        ISNULL((
          SELECT TOP 1 c.Vencimiento
          FROM CCA_M_Inventarios c 
          WHERE c.IdInventario = i.IdInventario 
          ORDER BY c.IdAsientoContable DESC
        ), NULL) as vencimiento
      FROM Inventarios i
      LEFT JOIN [Inventarios - AgrupaciónDos] g ON g.IdGrupoInventarioDos = i.IdGrupoInventarioDos
      WHERE i.[CódigoInventario] IN (${skusList})
        AND i.Activo = -1
    `;

    console.log('📊 Consultando SQL Server para', skusUnicos.length, 'SKUs');
    const result = await sqlPool.request().query(query);

    const productosMap = new Map();
    for (const row of result.recordset) {
      productosMap.set(row.sku, {
        descripcion: row.descripcion || 'Sin descripción',
        unidadMedida: row.UnidadDeMedida || 'Und.',
        grupoNombre: row.grupoNombre || 'SIN GRUPO',
        valorUnitario: parseFloat(row.valorUnitario) || 0,
        lote: row.lote || '',
        vencimiento: row.vencimiento
      });
    }

    console.log(`✅ Datos SQL Server obtenidos: ${productosMap.size} productos`);
    return productosMap;

  } catch (error) {
    console.error('❌ Error consultando SQL Server:', error.message);
    return new Map();
  }
}

module.exports = {
  compareInventarios,
  exportarComparacionExcel,
  generarReconteoDesdeComparacion,
  completarPareja,
  obtenerDatosProductosDesdeSQLServer
};