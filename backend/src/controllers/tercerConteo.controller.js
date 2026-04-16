const { QueryTypes } = require('sequelize');
const { sequelize, Inventario } = require('../models');

async function getResumenTercerConteo(req, res, next) {
  try {
    const inventarioId = Number(req.query.inventarioId);
    const umbral = Number(req.query.umbral || 5);

    if (!inventarioId) {
      return res.status(400).json({
        ok: false,
        message: 'inventarioId es requerido'
      });
    }

    const detalle = await sequelize.query(
      `
      WITH c1 AS (
        SELECT
          l."zonaId",
          l.sku,
          MAX(l."descripcionSnapshot") AS descripcion,
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
          MAX(l."descripcionSnapshot") AS descripcion,
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
        z.codigo AS "zonaCodigo",
        COALESCE(c1.sku, c2.sku) AS sku,
        COALESCE(c1.descripcion, c2.descripcion) AS descripcion,
        COALESCE(c1.cantidad, 0) AS "conteo1",
        COALESCE(c2.cantidad, 0) AS "conteo2",
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

    const zonasMap = new Map();

    for (const row of detalle) {
      const key = String(row.zonaId);

      if (!zonasMap.has(key)) {
        zonasMap.set(key, {
          zonaId: row.zonaId,
          zona: row.zona,
          zonaCodigo: row.zonaCodigo,
          diferenciaTotal: 0,
          skusConDiferencia: [],
          requiereTercerConteo: false
        });
      }

      const current = zonasMap.get(key);
      const diff = Number(row.diferencia || 0);

      current.diferenciaTotal += diff;

      if (diff > 0) {
        current.skusConDiferencia.push({
          sku: row.sku,
          descripcion: row.descripcion,
          conteo1: Number(row.conteo1),
          conteo2: Number(row.conteo2),
          diferencia: diff
        });
      }
    }

    const zonas = Array.from(zonasMap.values()).map((zona) => {
      zona.requiereTercerConteo = zona.diferenciaTotal > umbral;
      return zona;
    });

    const requiereConteo3 = zonas.some((z) => z.requiereTercerConteo);

    await Inventario.update(
      { requiereConteo3 },
      { where: { id: inventarioId } }
    );

    res.json({
      ok: true,
      data: {
        inventarioId,
        umbral,
        requiereConteo3,
        totalZonasEvaluadas: zonas.length,
        zonasRequierenConteo3: zonas.filter((z) => z.requiereTercerConteo),
        zonas
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getResumenTercerConteo
};