const { QueryTypes } = require('sequelize');
const { sequelize, Grupo, Zona, Lectura, RondaConteo, DiscrepanciaConteo } = require('../models');

// Estadísticas por zona
async function getEstadisticasZona(req, res, next) {
  try {
    const { zonaId, inventarioId } = req.query;
    
    const stats = await sequelize.query(`
      SELECT 
        z.nombre,
        COUNT(DISTINCT l.id) as total_escaneos,
        COUNT(DISTINCT l.sku) as productos_distintos,
        COALESCE(SUM(l.cantidad), 0) as total_unidades,
        COUNT(DISTINCT l."usuarioId") as personas_que_contaron,
        EXTRACT(EPOCH FROM (MAX(l."fechaHora") - MIN(l."fechaHora"))) / 3600 as horas_invertidas,
        COUNT(DISTINCT l."rondaId") as reconteos_requeridos
      FROM zonas z
      LEFT JOIN lecturas l ON l."zonaId" = z.id AND l.estado = 'valida'
      WHERE z.id = :zonaId
        AND l."inventarioId" = :inventarioId
      GROUP BY z.id, z.nombre
    `, {
      replacements: { zonaId, inventarioId },
      type: QueryTypes.SELECT
    });
    
    const rendimiento = stats[0]?.horas_invertidas > 0 
      ? Math.round(stats[0].total_unidades / stats[0].horas_invertidas)
      : 0;
    
    res.json({
      ok: true,
      data: {
        ...stats[0],
        rendimiento_por_hora: rendimiento
      }
    });
  } catch (error) {
    next(error);
  }
}

// ==================== ESTADÍSTICAS POR GRUPO ====================

async function getEstadisticasGrupoDetallado(req, res, next) {
  try {
    const { inventarioId, grupoId } = req.query;

    if (!inventarioId) {
      return res.status(400).json({ ok: false, message: 'inventarioId es requerido' });
    }

    // 🔒 AISLAMIENTO
    let grupoFiltro = grupoId;
    if (!req.canViewAllGroups && req.grupoId) {
      grupoFiltro = req.grupoId;
    }

    const whereGrupo = grupoFiltro ? { id: grupoFiltro } : {};

    const grupos = await Grupo.findAll({
      where: { ...whereGrupo, inventarioId },
      attributes: ['id', 'nombre', 'color'],
      include: [{ model: Usuario, as: 'lider', attributes: ['nombre'], required: false }]
    });

    const resultados = [];

    for (const grupo of grupos) {
      // Total unidades contadas
      const totalUnidades = await Lectura.sum('cantidad', {
        where: { inventarioId, grupoId: grupo.id, estado: 'valida' }
      });

      // Diferencia total (de discrepancias)
      const diferenciaTotal = await DiscrepanciaConteo.sum('diferencia', {
        where: { inventarioId, grupoId: grupo.id }
      });

      // Tiempo de conteo (desde primera hasta última lectura)
      const tiempos = await Lectura.findOne({
        where: { inventarioId, grupoId: grupo.id, estado: 'valida' },
        attributes: [
          [sequelize.fn('MIN', sequelize.col('fechaHora')), 'inicio'],
          [sequelize.fn('MAX', sequelize.col('fechaHora')), 'fin']
        ]
      });

      let tiempoSegundos = null;
      if (tiempos?.dataValues.inicio && tiempos?.dataValues.fin) {
        tiempoSegundos = Math.round((new Date(tiempos.dataValues.fin) - new Date(tiempos.dataValues.inicio)) / 1000);
      }

      // Productos distintos
      const productosDistintos = await Lectura.count({
        where: { inventarioId, grupoId: grupo.id, estado: 'valida', sku: { [Op.ne]: null } },
        distinct: true,
        col: 'sku'
      });

      resultados.push({
        grupoId: grupo.id,
        grupo: grupo.nombre,
        lider: grupo.lider?.nombre || 'Sin líder',
        color: grupo.color,
        totalUnidades: totalUnidades || 0,
        diferenciaTotal: diferenciaTotal || 0,
        productosDistintos: productosDistintos || 0,
        tiempoSegundos,
        tiempoFormateado: formatSegundos(tiempoSegundos),
        rendimientoPorHora: tiempoSegundos > 0 ? Math.round(((totalUnidades || 0) / tiempoSegundos) * 3600) : 0
      });
    }

    // Rankings
    const grupoMasProductivo = [...resultados].sort((a, b) => b.totalUnidades - a.totalUnidades)[0] || null;
    const grupoMayorDiferencia = [...resultados].sort((a, b) => b.diferenciaTotal - a.diferenciaTotal)[0] || null;
    const grupoMasRapido = [...resultados]
      .filter(g => g.tiempoSegundos > 0 && g.totalUnidades > 0)
      .sort((a, b) => a.tiempoSegundos - b.tiempoSegundos)[0] || null;

    res.json({
      ok: true,
      data: {
        grupos: resultados,
        rankings: {
          grupoMasProductivo,
          grupoMayorDiferencia,
          grupoMasRapido
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

// ==================== ESTADÍSTICAS GENERALES ====================

async function getEstadisticasGenerales(req, res, next) {
  try {
    const { inventarioId } = req.query;

    const totalEscaneos = await Lectura.sum('cantidad', {
      where: { inventarioId, estado: 'valida' }
    });

    const usuariosActivos = await Lectura.count({
      where: { inventarioId, estado: 'valida' },
      distinct: true,
      col: 'usuarioId'
    });

    const zonasActivas = await Lectura.count({
      where: { inventarioId, estado: 'valida' },
      distinct: true,
      col: 'zonaId'
    });

    const usuarioMasEscaneo = await Lectura.findAll({
      where: { inventarioId, estado: 'valida' },
      attributes: [
        'usuarioId',
        [sequelize.fn('SUM', sequelize.col('cantidad')), 'total']
      ],
      group: ['usuarioId'],
      order: [[sequelize.literal('total'), 'DESC']],
      limit: 1,
      include: [{ model: Usuario, as: 'usuario', attributes: ['nombre'] }]
    });

    const zonaMasEscaneos = await Lectura.findAll({
      where: { inventarioId, estado: 'valida' },
      attributes: [
        'zonaId',
        [sequelize.fn('SUM', sequelize.col('cantidad')), 'total']
      ],
      group: ['zonaId'],
      order: [[sequelize.literal('total'), 'DESC']],
      limit: 1,
      include: [{ model: Zona, as: 'zona', attributes: ['nombre'] }]
    });

    const tiempoEntreEscaneos = await sequelize.query(
      `
      SELECT AVG(EXTRACT(EPOCH FROM (l2."fechaHora" - l1."fechaHora")))::int AS "promedio"
      FROM lecturas l1
      JOIN lecturas l2 ON l2.id = (
        SELECT id FROM lecturas l3 
        WHERE l3."inventarioId" = l1."inventarioId"
          AND l3."fechaHora" > l1."fechaHora"
          AND l3.estado = 'valida'
        ORDER BY l3."fechaHora" ASC 
        LIMIT 1
      )
      WHERE l1."inventarioId" = :inventarioId AND l1.estado = 'valida'
      `,
      { replacements: { inventarioId }, type: QueryTypes.SELECT }
    );

    res.json({
      ok: true,
      data: {
        totalEscaneos: totalEscaneos || 0,
        usuariosActivos: usuariosActivos || 0,
        zonasActivas: zonasActivas || 0,
        usuarioMasEscaneo: usuarioMasEscaneo[0]?.usuario?.nombre || 'N/A',
        zonaMasEscaneos: zonaMasEscaneos[0]?.zona?.nombre || 'N/A',
        tiempoPromedioEntreEscaneos: tiempoEntreEscaneos[0]?.promedio || 0
      }
    });
  } catch (error) {
    next(error);
  }
}

function formatSegundos(segundos) {
  if (!segundos) return null;
  const minutos = Math.floor(segundos / 60);
  const segs = segundos % 60;
  if (minutos > 0) return `${minutos}m ${segs}s`;
  return `${segs}s`;
}

module.exports = {
  getEstadisticasZona,
  getEstadisticasGrupoDetallado,
  getEstadisticasGenerales
};