const Joi = require('joi');
const ExcelJS = require('exceljs');
const { QueryTypes } = require('sequelize');
const { sequelize, Zona, Inventario, RondaConteo, DiscrepanciaConteo } = require('../models');

const compareSchema = Joi.object({
  inventarioBaseId: Joi.number().integer().required(),
  inventarioComparadoId: Joi.number().integer().required(),
  zonaBaseId: Joi.number().integer().allow(null, ''),
  zonaComparadaId: Joi.number().integer().allow(null, '')
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
  const filterBase = buildLecturasFilterSql({
    groupIds: allowedGroupIds,
    zonaId: zonaBaseId,
    alias: 'l',
    groupParam: 'allowedGroupIds',
    zonaParam: 'zonaBaseId'
  });

  const filterComparado = buildLecturasFilterSql({
    groupIds: allowedGroupIds,
    zonaId: zonaComparadaId,
    alias: 'l',
    groupParam: 'allowedGroupIds',
    zonaParam: 'zonaComparadaId'
  });

  const baseRows = await sequelize.query(
    `
    WITH ultima_ronda_base AS (
      SELECT id, "numeroRonda"
      FROM rondas_conteo
      WHERE "inventarioId" = :inventarioBaseId
        AND "tipoRonda" = 'completa'
        ${zonaBaseId ? 'AND "zonaId" = :zonaBaseId' : ''}
      ORDER BY "numeroRonda" DESC
      LIMIT 1
    )
    SELECT
      l.sku AS "sku",
      MAX(l."descripcionSnapshot") AS "descripcion",
      COALESCE(SUM(l.cantidad), 0)::int AS "cantidad"
    FROM lecturas l
    INNER JOIN ultima_ronda_base ur ON ur.id = l."rondaId"
    WHERE l."inventarioId" = :inventarioBaseId
      AND l.estado = 'valida'
      AND l.sku IS NOT NULL
      ${filterBase}
    GROUP BY l.sku
    ORDER BY l.sku ASC
    `,
    {
      replacements: {
        inventarioBaseId,
        allowedGroupIds,
        zonaBaseId: zonaBaseId || null
      },
      type: QueryTypes.SELECT
    }
  );

  const comparadoRows = await sequelize.query(
    `
    WITH ultima_ronda_comparado AS (
      SELECT id, "numeroRonda"
      FROM rondas_conteo
      WHERE "inventarioId" = :inventarioComparadoId
        AND "tipoRonda" = 'completa'
        ${zonaComparadaId ? 'AND "zonaId" = :zonaComparadaId' : ''}
      ORDER BY "numeroRonda" DESC
      LIMIT 1
    )
    SELECT
      l.sku AS "sku",
      MAX(l."descripcionSnapshot") AS "descripcion",
      COALESCE(SUM(l.cantidad), 0)::int AS "cantidad"
    FROM lecturas l
    INNER JOIN ultima_ronda_comparado ur ON ur.id = l."rondaId"
    WHERE l."inventarioId" = :inventarioComparadoId
      AND l.estado = 'valida'
      AND l.sku IS NOT NULL
      ${filterComparado}
    GROUP BY l.sku
    ORDER BY l.sku ASC
    `,
    {
      replacements: {
        inventarioComparadoId,
        allowedGroupIds,
        zonaComparadaId: zonaComparadaId || null
      },
      type: QueryTypes.SELECT
    }
  );

  const baseMap = new Map();
  const comparadoMap = new Map();

  for (const row of baseRows) {
    baseMap.set(row.sku, {
      sku: row.sku,
      descripcion: row.descripcion || 'Sin descripción',
      cantidad: Number(row.cantidad || 0)
    });
  }

  for (const row of comparadoRows) {
    comparadoMap.set(row.sku, {
      sku: row.sku,
      descripcion: row.descripcion || 'Sin descripción',
      cantidad: Number(row.cantidad || 0)
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
      descripcion: base?.descripcion || comparado?.descripcion || 'Sin descripción',
      cantidadBase,
      cantidadComparada,
      diferencia,
      estado: diferencia === 0 ? 'coincide' : 'difiere'
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
      FROM rondas_conteo
      WHERE "inventarioId" = :inventarioId
        AND "tipoRonda" = 'completa'
        ${zonaId ? 'AND "zonaId" = :zonaId' : ''}
      ORDER BY "numeroRonda" DESC
      LIMIT 1
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
    {
      replacements: {
        inventarioId,
        allowedGroupIds,
        zonaId: zonaId || null
      },
      type: QueryTypes.SELECT
    }
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
      FROM rondas_conteo
      WHERE "inventarioId" = :inventarioId
        AND "tipoRonda" = 'completa'
        ${zonaId ? 'AND "zonaId" = :zonaId' : ''}
      ORDER BY "numeroRonda" DESC
      LIMIT 1
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
    {
      replacements: {
        inventarioId,
        allowedGroupIds,
        zonaId: zonaId || null
      },
      type: QueryTypes.SELECT
    }
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
      FROM rondas_conteo
      WHERE "inventarioId" = :inventarioId
        AND "tipoRonda" = 'completa'
        ${zonaId ? 'AND "zonaId" = :zonaId' : ''}
      ORDER BY "numeroRonda" DESC
      LIMIT 1
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
    {
      replacements: {
        inventarioId,
        allowedGroupIds,
        zonaId: zonaId || null
      },
      type: QueryTypes.SELECT
    }
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
    comparacion: comparisonRows,  // ← ESTA ES LA LÍNEA CLAVE
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

    res.json({
      ok: true,
      data
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

async function exportarComparacionExcel(req, res, next) {
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

    const workbook = new ExcelJS.Workbook();

    const resumenSheet = workbook.addWorksheet('Resumen');
    const coincidenSheet = workbook.addWorksheet('Coinciden');
    const diferenciasSheet = workbook.addWorksheet('Difieren');
    const gruposBaseSheet = workbook.addWorksheet('Grupos Base');
    const gruposComparadoSheet = workbook.addWorksheet('Grupos Comparado');
    const zonasBaseSheet = workbook.addWorksheet('Zonas Base');
    const zonasComparadoSheet = workbook.addWorksheet('Zonas Comparado');
    const miembrosBaseSheet = workbook.addWorksheet('Miembros Base');
    const miembrosComparadoSheet = workbook.addWorksheet('Miembros Comparado');

    resumenSheet.columns = [
      { header: 'Concepto', key: 'concepto', width: 35 },
      { header: 'Valor', key: 'valor', width: 25 }
    ];

    coincidenSheet.columns = [
      { header: 'SKU', key: 'sku', width: 20 },
      { header: 'Descripción', key: 'descripcion', width: 60 },
      { header: 'Cantidad Base', key: 'cantidadBase', width: 18 },
      { header: 'Cantidad Comparada', key: 'cantidadComparada', width: 20 }
    ];

    diferenciasSheet.columns = [
      { header: 'SKU', key: 'sku', width: 20 },
      { header: 'Descripción', key: 'descripcion', width: 60 },
      { header: 'Cantidad Base', key: 'cantidadBase', width: 18 },
      { header: 'Cantidad Comparada', key: 'cantidadComparada', width: 20 },
      { header: 'Diferencia', key: 'diferencia', width: 15 }
    ];

    gruposBaseSheet.columns = [
      { header: 'Grupo', key: 'nombre', width: 30 },
      { header: 'Zona', key: 'zona', width: 25 },
      { header: 'Total Escaneos', key: 'totalEscaneos', width: 18 },
      { header: 'Productos Únicos', key: 'productosUnicos', width: 18 }
    ];

    gruposComparadoSheet.columns = [...gruposBaseSheet.columns];

    zonasBaseSheet.columns = [
      { header: 'Zona', key: 'nombre', width: 30 },
      { header: 'Código', key: 'codigo', width: 15 },
      { header: 'Total Escaneos', key: 'totalEscaneos', width: 18 },
      { header: 'Productos Únicos', key: 'productosUnicos', width: 18 }
    ];

    zonasComparadoSheet.columns = [...zonasBaseSheet.columns];

    miembrosBaseSheet.columns = [
      { header: 'Miembro', key: 'nombre', width: 30 },
      { header: 'Email', key: 'email', width: 35 },
      { header: 'Grupo', key: 'grupo', width: 25 },
      { header: 'Zona', key: 'zona', width: 25 },
      { header: 'Total Escaneos', key: 'totalEscaneos', width: 18 },
      { header: 'Productos Únicos', key: 'productosUnicos', width: 18 }
    ];

    miembrosComparadoSheet.columns = [...miembrosBaseSheet.columns];

    resumenSheet.addRows([
      { concepto: 'Inventario Base', valor: data.resumen.inventarioBaseId },
      { concepto: 'Inventario Comparado', valor: data.resumen.inventarioComparadoId },
      { concepto: 'Zona Base', valor: data.filtros.zonaBase?.nombre || 'Todas' },
      { concepto: 'Zona Comparada', valor: data.filtros.zonaComparada?.nombre || 'Todas' },
      { concepto: 'Total Comparados', valor: data.resumen.totalItemsComparados },
      { concepto: 'Total Coinciden', valor: data.coinciden.length },
      { concepto: 'Total Difieren', valor: data.diferencias.length }
    ]);

    coincidenSheet.addRows(data.coinciden);
    diferenciasSheet.addRows(data.diferencias);

    gruposBaseSheet.addRows(data.totales.base.grupos);
    gruposComparadoSheet.addRows(data.totales.comparado.grupos);

    zonasBaseSheet.addRows(data.totales.base.zonas);
    zonasComparadoSheet.addRows(data.totales.comparado.zonas);

    miembrosBaseSheet.addRows(data.totales.base.miembros);
    miembrosComparadoSheet.addRows(data.totales.comparado.miembros);

    [
      resumenSheet,
      coincidenSheet,
      diferenciasSheet,
      gruposBaseSheet,
      gruposComparadoSheet,
      zonasBaseSheet,
      zonasComparadoSheet,
      miembrosBaseSheet,
      miembrosComparadoSheet
    ].forEach((sheet) => {
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=diferencias_${value.inventarioBaseId}_vs_${value.inventarioComparadoId}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
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

async function generarReconteoDesdeComparacion(req, res, next) {
  try {
    const { inventarioBaseId, inventarioComparadoId, zonaId } = req.body;

    if (!inventarioBaseId || !inventarioComparadoId) {
      return res.status(400).json({
        ok: false,
        message: 'Se requiere inventarioBaseId y inventarioComparadoId'
      });
    }

    const [inventarioBase, inventarioComparado] = await Promise.all([
      Inventario.findByPk(inventarioBaseId),
      Inventario.findByPk(inventarioComparadoId)
    ]);

    if (!inventarioBase || !inventarioComparado) {
      return res.status(404).json({
        ok: false,
        message: 'Uno de los inventarios no existe'
      });
    }

    const allowedGroupIds = await getAllowedGroupIds(req);
    
    const comparisonRows = await getSkuComparisonRows(
      inventarioBaseId,
      inventarioComparadoId,
      allowedGroupIds,
      zonaId || null,
      zonaId || null
    );

    const diferencias = comparisonRows.filter(row => row.estado === 'difiere');

    if (diferencias.length === 0) {
      return res.status(400).json({
        ok: false,
        message: 'No hay diferencias entre los inventarios para generar un reconteo'
      });
    }

    const zona = zonaId ? await Zona.findByPk(zonaId) : null;
    
    const lastRonda = await RondaConteo.findOne({
      where: {
        inventarioId: inventarioBaseId,
        zonaId: zonaId || null
      },
      order: [['numeroRonda', 'DESC']],
      attributes: ['numeroRonda']
    });

    const nextRondaNumero = (lastRonda?.numeroRonda || 0) + 1;

    const nuevaRonda = await RondaConteo.create({
      inventarioId: inventarioBaseId,
      zonaId: zonaId || null,
      numeroRonda: nextRondaNumero,
      tipoRonda: 'reconteo',
      estado: 'pendiente'
    });

    for (const diferencia of diferencias) {
      await DiscrepanciaConteo.upsert({
        inventarioId: inventarioBaseId,
        sku: diferencia.sku,
        zonaId: zonaId || null,
        cantidadRonda1: diferencia.cantidadBase,
        cantidadUltima: diferencia.cantidadComparada,
        cantidadFinal: null,
        estado: 'pendiente',
        rondaReconteoId: nuevaRonda.id
      });
    }

    res.json({
      ok: true,
      message: `Ronda de reconteo generada exitosamente con ${diferencias.length} SKUs para corregir`,
      data: {
        ronda: nuevaRonda,
        inventarioObjetivoId: inventarioBaseId,
        totalDiferencias: diferencias.length
      }
    });
  } catch (error) {
    console.error('Error en generarReconteoDesdeComparacion:', error);
    next(error);
  }
}

module.exports = {
  compareInventarios,
  exportarComparacionExcel,
  generarReconteoDesdeComparacion
};