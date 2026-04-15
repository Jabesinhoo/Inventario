const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');

async function getInicialVsConteo1(req, res, next) {
  try {
    const inventarioId = Number(req.query.inventarioId);

    if (!inventarioId) {
      return res.status(400).json({
        ok: false,
        message: 'inventarioId es requerido'
      });
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
          l.sku,
          MAX(l."descripcionSnapshot") AS "descripcionSnapshot",
          SUM(l.cantidad)::int AS cantidad
        FROM lecturas l
        WHERE l."inventarioId" = :inventarioId
          AND l."conteoTipo" = 1
          AND l.estado = 'valida'
        GROUP BY l."zonaId", l.sku
      )
      SELECT
        COALESCE(c0."zonaId", c1."zonaId") AS "zonaId",
        z.nombre AS zona,
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
      ORDER BY zona ASC, sku ASC
      `,
      {
        replacements: { inventarioId },
        type: QueryTypes.SELECT
      }
    );

    res.json({
      ok: true,
      data: rows
    });
  } catch (error) {
    next(error);
  }
}

async function getConteo1VsConteo2(req, res, next) {
  try {
    const inventarioId = Number(req.query.inventarioId);

    if (!inventarioId) {
      return res.status(400).json({
        ok: false,
        message: 'inventarioId es requerido'
      });
    }

    const rows = await sequelize.query(
      `
      WITH c1 AS (
        SELECT
          l."zonaId",
          l.sku,
          MAX(l."descripcionSnapshot") AS "descripcionSnapshot",
          SUM(l.cantidad)::int AS cantidad
        FROM lecturas l
        WHERE l."inventarioId" = :inventarioId
          AND l."conteoTipo" = 1
          AND l.estado = 'valida'
        GROUP BY l."zonaId", l.sku
      ),
      c2 AS (
        SELECT
          l."zonaId",
          l.sku,
          MAX(l."descripcionSnapshot") AS "descripcionSnapshot",
          SUM(l.cantidad)::int AS cantidad
        FROM lecturas l
        WHERE l."inventarioId" = :inventarioId
          AND l."conteoTipo" = 2
          AND l.estado = 'valida'
        GROUP BY l."zonaId", l.sku
      )
      SELECT
        COALESCE(c1."zonaId", c2."zonaId") AS "zonaId",
        z.nombre AS zona,
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
      ORDER BY zona ASC, sku ASC
      `,
      {
        replacements: { inventarioId },
        type: QueryTypes.SELECT
      }
    );

    res.json({
      ok: true,
      data: rows
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getInicialVsConteo1,
  getConteo1VsConteo2
};