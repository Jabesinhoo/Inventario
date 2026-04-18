const { QueryTypes } = require('sequelize');
const { sequelize, DiscrepanciaConteo, Zona, Grupo } = require('../models');

async function getInicialVsConteo1(req, res, next) {
  try {
    const inventarioId = Number(req.query.inventarioId);
    const grupoId = req.query.grupoId ? Number(req.query.grupoId) : null;

    if (!inventarioId) {
      return res.status(400).json({ ok: false, message: 'inventarioId es requerido' });
    }

    // 🔒 AISLAMIENTO: si no es admin/supervisor, solo ve su grupo
    let grupoFiltro = grupoId;
    if (!req.canViewAllGroups && req.grupoId) {
      grupoFiltro = req.grupoId;
    }

    let grupoCondition = '';
    let replacements = { inventarioId };

    if (grupoFiltro) {
      grupoCondition = 'AND l."grupoId" = :grupoId';
      replacements.grupoId = grupoFiltro;
    }

    const rows = await sequelize.query(
      `
      WITH c0 AS (
        SELECT
          cid."zonaId",
          cid.sku,
          cid."descripcionSnapshot",
          SUM(cid.cantidad)::int AS cantidad
        FROM conteo_inicial_detalle cid
        WHERE cid."inventarioId" = :inventarioId
        GROUP BY cid."zonaId", cid.sku, cid."descripcionSnapshot"
      ),
      c1 AS (
        SELECT
          l."zonaId",
          l."grupoId",
          l.sku,
          MAX(l."descripcionSnapshot") AS "descripcionSnapshot",
          SUM(l.cantidad)::int AS cantidad
        FROM lecturas l
        WHERE l."inventarioId" = :inventarioId
          AND l."conteoTipo" = 1
          AND l.estado = 'valida'
          ${grupoCondition}
        GROUP BY l."zonaId", l."grupoId", l.sku
      )
      SELECT
        COALESCE(c0."zonaId", c1."zonaId") AS "zonaId",
        z.nombre AS zona,
        c1."grupoId",
        g.nombre AS grupo,
        COALESCE(c0.sku, c1.sku) AS sku,
        COALESCE(c0."descripcionSnapshot", c1."descripcionSnapshot") AS descripcion,
        COALESCE(c0.cantidad, 0) AS inicial,
        COALESCE(c1.cantidad, 0) AS conteo1,
        ABS(COALESCE(c0.cantidad, 0) - COALESCE(c1.cantidad, 0)) AS diferencia
      FROM c0
      FULL OUTER JOIN c1
        ON c0."zonaId" = c1."zonaId"
        AND c0.sku = c1.sku
      LEFT JOIN zonas z
        ON z.id = COALESCE(c0."zonaId", c1."zonaId")
      LEFT JOIN grupos g
        ON g.id = c1."grupoId"
      ORDER BY zona ASC, sku ASC
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    res.json({ ok: true, data: rows });
  } catch (error) {
    next(error);
  }
}

async function getConteo1VsConteo2(req, res, next) {
  try {
    const inventarioId = Number(req.query.inventarioId);
    const grupoId = req.query.grupoId ? Number(req.query.grupoId) : null;

    if (!inventarioId) {
      return res.status(400).json({ ok: false, message: 'inventarioId es requerido' });
    }

    // 🔒 AISLAMIENTO: si no es admin/supervisor, solo ve su grupo
    let grupoFiltro = grupoId;
    if (!req.canViewAllGroups && req.grupoId) {
      grupoFiltro = req.grupoId;
    }

    let grupoCondition = '';
    let replacements = { inventarioId };

    if (grupoFiltro) {
      grupoCondition = 'AND l."grupoId" = :grupoId';
      replacements.grupoId = grupoFiltro;
    }

    const rows = await sequelize.query(
      `
      WITH c1 AS (
        SELECT
          l."zonaId",
          l."grupoId",
          l.sku,
          MAX(l."descripcionSnapshot") AS "descripcionSnapshot",
          SUM(l.cantidad)::int AS cantidad
        FROM lecturas l
        WHERE l."inventarioId" = :inventarioId
          AND l."conteoTipo" = 1
          AND l.estado = 'valida'
          ${grupoCondition}
        GROUP BY l."zonaId", l."grupoId", l.sku
      ),
      c2 AS (
        SELECT
          l."zonaId",
          l."grupoId",
          l.sku,
          MAX(l."descripcionSnapshot") AS "descripcionSnapshot",
          SUM(l.cantidad)::int AS cantidad
        FROM lecturas l
        WHERE l."inventarioId" = :inventarioId
          AND l."conteoTipo" = 2
          AND l.estado = 'valida'
          ${grupoCondition}
        GROUP BY l."zonaId", l."grupoId", l.sku
      )
      SELECT
        COALESCE(c1."zonaId", c2."zonaId") AS "zonaId",
        z.nombre AS zona,
        COALESCE(c1."grupoId", c2."grupoId") AS "grupoId",
        g.nombre AS grupo,
        COALESCE(c1.sku, c2.sku) AS sku,
        COALESCE(c1."descripcionSnapshot", c2."descripcionSnapshot") AS descripcion,
        COALESCE(c1.cantidad, 0) AS conteo1,
        COALESCE(c2.cantidad, 0) AS conteo2,
        ABS(COALESCE(c1.cantidad, 0) - COALESCE(c2.cantidad, 0)) AS diferencia
      FROM c1
      FULL OUTER JOIN c2
        ON c1."zonaId" = c2."zonaId"
        AND c1.sku = c2.sku
      LEFT JOIN zonas z
        ON z.id = COALESCE(c1."zonaId", c2."zonaId")
      LEFT JOIN grupos g
        ON g.id = COALESCE(c1."grupoId", c2."grupoId")
      ORDER BY zona ASC, sku ASC
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    res.json({ ok: true, data: rows });
  } catch (error) {
    next(error);
  }
}

async function getDiscrepanciasPorGrupo(req, res, next) {
  try {
    const { inventarioId, grupoId, zonaId, estado } = req.query;

    if (!inventarioId) {
      return res.status(400).json({ ok: false, message: 'inventarioId es requerido' });
    }

    let where = { inventarioId };
    
    // 🔒 AISLAMIENTO
    let grupoFiltro = grupoId;
    if (!req.canViewAllGroups && req.grupoId) {
      grupoFiltro = req.grupoId;
    }
    
    if (grupoFiltro) where.grupoId = grupoFiltro;
    if (zonaId) where.zonaId = zonaId;
    if (estado) where.estado = estado;

    const discrepancias = await DiscrepanciaConteo.findAll({
      where,
      include: [
        { model: Zona, as: 'zona', attributes: ['id', 'nombre', 'codigo'] },
        { model: Grupo, as: 'grupo', attributes: ['id', 'nombre'] }
      ],
      order: [['diferencia', 'DESC']]
    });

    const resumen = {
      totalDiscrepancias: discrepancias.length,
      totalDiferenciaUnidades: discrepancias.reduce((sum, d) => sum + (d.diferencia || 0), 0),
      porEstado: {},
      porZona: {},
      porGrupo: {}
    };

    for (const d of discrepancias) {
      const estadoKey = d.estado || 'sin_estado';
      resumen.porEstado[estadoKey] = (resumen.porEstado[estadoKey] || 0) + 1;
      
      const zonaKey = d.zona?.nombre || 'sin_zona';
      resumen.porZona[zonaKey] = (resumen.porZona[zonaKey] || 0) + (d.diferencia || 0);
      
      const grupoKey = d.grupo?.nombre || 'sin_grupo';
      resumen.porGrupo[grupoKey] = (resumen.porGrupo[grupoKey] || 0) + (d.diferencia || 0);
    }

    res.json({
      ok: true,
      data: {
        discrepancias,
        resumen
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getInicialVsConteo1,
  getConteo1VsConteo2,
  getDiscrepanciasPorGrupo
};