const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');

function getEstadoZona(diff, umbral) {
  if (diff === 0) return 'coincide';
  if (diff <= umbral) return 'diferencia menor';
  return 'requiere tercer conteo';
}

async function getDashboard(req, res, next) {
  try {
    const fecha = req.query.fecha || null;
    const umbral = Number(req.query.umbral || 5);

    const dateFilterSql = fecha ? `AND DATE(l."fechaHora") = :fecha` : '';
    const dateAsignSql = fecha ? `AND i."fecha" = :fecha` : '';
    const replacements = fecha ? { fecha, umbral } : { umbral };

    const resumenGeneral = await sequelize.query(
      `
      SELECT
        (SELECT COUNT(*)::int FROM zonas z) AS "totalZonas",
        (SELECT COUNT(*)::int FROM grupos g
          ${fecha ? 'JOIN inventarios i ON i.id = g."inventarioId" WHERE i."fecha" = :fecha' : ''}
        ) AS "totalGrupos",
        (SELECT COUNT(*)::int FROM asignaciones_conteo a
          ${fecha ? 'JOIN inventarios i ON i.id = a."inventarioId" WHERE i."fecha" = :fecha' : ''}
        ) AS "totalAsignaciones",
        (
          SELECT COALESCE(SUM(l.cantidad), 0)::int
          FROM lecturas l
          WHERE l.estado = 'valida'
          ${dateFilterSql}
        ) AS "totalEscaneos"
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    const conteos = await sequelize.query(
      `
      SELECT
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 1 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo1",
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 2 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo2"
      FROM lecturas l
      WHERE l.estado = 'valida'
      ${dateFilterSql}
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    const porZona = await sequelize.query(
      `
      SELECT
        z.id,
        z.nombre,
        z.codigo,
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 1 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo1",
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 2 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo2"
      FROM zonas z
      LEFT JOIN lecturas l
        ON l."zonaId" = z.id
        AND l.estado = 'valida'
        ${dateFilterSql}
      GROUP BY z.id, z.nombre, z.codigo
      ORDER BY z.nombre ASC
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    const porGrupo = await sequelize.query(
      `
      SELECT
        g.id,
        g.nombre,
        COALESCE(SUM(l.cantidad), 0)::int AS "totalEscaneos",
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 1 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo1",
        COALESCE(SUM(CASE WHEN l."conteoTipo" = 2 THEN l.cantidad ELSE 0 END), 0)::int AS "conteo2",
        CASE
          WHEN COALESCE(SUM(l.cantidad), 0) = 0 THEN NULL
          ELSE ROUND(
            EXTRACT(EPOCH FROM (MAX(l."fechaHora") - MIN(l."fechaHora"))) / NULLIF(SUM(l.cantidad), 0),
            2
          )
        END AS "segundosPorProducto"
      FROM grupos g
      LEFT JOIN lecturas l
        ON l."grupoId" = g.id
        AND l.estado = 'valida'
        ${dateFilterSql}
      ${fecha ? 'JOIN inventarios i ON i.id = g."inventarioId" AND i."fecha" = :fecha' : ''}
      GROUP BY g.id, g.nombre
      ORDER BY "totalEscaneos" DESC, g.nombre ASC
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    const asignacionesPorFecha = await sequelize.query(
      `
      SELECT
        i."fecha",
        g.nombre AS "grupo",
        z.nombre AS "zona",
        a."conteoTipo"
      FROM asignaciones_conteo a
      JOIN inventarios i ON i.id = a."inventarioId"
      JOIN grupos g ON g.id = a."grupoId"
      JOIN zonas z ON z.id = a."zonaId"
      WHERE 1 = 1
      ${dateAsignSql}
      ORDER BY i."fecha" DESC, a."conteoTipo" ASC, g.nombre ASC
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    const gruposSinCompletar = await sequelize.query(
      `
      SELECT
        g.id,
        g.nombre
      FROM asignaciones_conteo a
      JOIN grupos g ON g.id = a."grupoId"
      JOIN inventarios i ON i.id = a."inventarioId"
      LEFT JOIN lecturas l
        ON l."grupoId" = a."grupoId"
        AND l."zonaId" = a."zonaId"
        AND l."conteoTipo" = a."conteoTipo"
        AND l.estado = 'valida'
        ${fecha ? 'AND DATE(l."fechaHora") = :fecha' : ''}
      WHERE 1 = 1
      ${dateAsignSql}
      GROUP BY g.id, g.nombre, a.id
      HAVING COALESCE(SUM(l.cantidad), 0) = 0
      ORDER BY g.nombre ASC
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    const fechasSinConteo2 = await sequelize.query(
      `
      SELECT DISTINCT i."fecha"
      FROM inventarios i
      JOIN asignaciones_conteo a1
        ON a1."inventarioId" = i.id
        AND a1."conteoTipo" = 1
      LEFT JOIN asignaciones_conteo a2
        ON a2."inventarioId" = i.id
        AND a2."conteoTipo" = 2
      WHERE a2.id IS NULL
      ${fecha ? 'AND i."fecha" = :fecha' : ''}
      ORDER BY i."fecha" DESC
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    const evolucionPorDia = await sequelize.query(
      `
      SELECT
        DATE(l."fechaHora") AS "fecha",
        COALESCE(SUM(l.cantidad), 0)::int AS "total"
      FROM lecturas l
      WHERE l.estado = 'valida'
      GROUP BY DATE(l."fechaHora")
      ORDER BY DATE(l."fechaHora") ASC
      `,
      { type: QueryTypes.SELECT }
    );

    const general = resumenGeneral[0];
    const conteoBase = conteos[0];
    const diferenciaGlobal = Math.abs(Number(conteoBase.conteo1) - Number(conteoBase.conteo2));
    const precision =
      Number(conteoBase.conteo1) > 0
        ? Number((1 - diferenciaGlobal / Number(conteoBase.conteo1)) * 100).toFixed(2)
        : 0;

    const zonasProcesadas = porZona.map((z) => {
      const diferencia = Math.abs(Number(z.conteo1) - Number(z.conteo2));
      return {
        ...z,
        diferencia,
        estado: getEstadoZona(diferencia, umbral)
      };
    });

    const gruposProcesados = porGrupo.map((g) => ({
      ...g,
      diferencia: Math.abs(Number(g.conteo1) - Number(g.conteo2))
    }));

    const grupoMasProductivo = [...gruposProcesados].sort((a, b) => b.totalEscaneos - a.totalEscaneos)[0] || null;
    const grupoMenorDiferencia = [...gruposProcesados].sort((a, b) => a.diferencia - b.diferencia)[0] || null;
    const grupoMasRapido = [...gruposProcesados]
      .filter((g) => g.segundosPorProducto !== null)
      .sort((a, b) => Number(a.segundosPorProducto) - Number(b.segundosPorProducto))[0] || null;

    res.json({
      ok: true,
      data: {
        filtro: { fecha, umbral },
        resumenGeneral: general,
        conteos: {
          conteo1: Number(conteoBase.conteo1),
          conteo2: Number(conteoBase.conteo2),
          diferenciaGlobal,
          precisionPorcentaje: Number(precision)
        },
        porZona: zonasProcesadas,
        porGrupo: {
          ranking: gruposProcesados,
          grupoMasProductivo,
          grupoMenorDiferencia,
          grupoMasRapido
        },
        porFecha: {
          asignaciones: asignacionesPorFecha
        },
        alertas: {
          zonasRequierenTercerConteo: zonasProcesadas.filter((z) => z.estado === 'requiere tercer conteo'),
          gruposSinCompletar,
          fechasSinConteo2
        },
        graficos: {
          evolucionPorDia,
          distribucionPorZona: zonasProcesadas.map((z) => ({
            zona: z.nombre,
            total: Number(z.conteo1) + Number(z.conteo2)
          })),
          comparacionPorZona: zonasProcesadas.map((z) => ({
            zona: z.nombre,
            conteo1: Number(z.conteo1),
            conteo2: Number(z.conteo2)
          }))
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getDashboard
};