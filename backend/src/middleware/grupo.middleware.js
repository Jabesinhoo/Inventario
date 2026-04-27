const { QueryTypes } = require('sequelize');
const { sequelize, AsignacionRonda } = require('../models');

async function buscarMembresiaDirecta(usuarioId, grupoId) {
  const rows = await sequelize.query(
    `
    SELECT "grupoId"
    FROM usuario_grupo
    WHERE "usuarioId" = :usuarioId
      AND "grupoId" = :grupoId
    LIMIT 1
    `,
    {
      replacements: {
        usuarioId: Number(usuarioId),
        grupoId: Number(grupoId)
      },
      type: QueryTypes.SELECT
    }
  );

  return rows[0] ? Number(rows[0].grupoId) : null;
}

async function buscarPrimerGrupoUsuario(usuarioId) {
  const rows = await sequelize.query(
    `
    SELECT "grupoId"
    FROM usuario_grupo
    WHERE "usuarioId" = :usuarioId
    ORDER BY "grupoId" ASC
    LIMIT 1
    `,
    {
      replacements: { usuarioId: Number(usuarioId) },
      type: QueryTypes.SELECT
    }
  );

  return rows[0] ? Number(rows[0].grupoId) : null;
}

async function resolverGrupoDesdeRonda(usuarioId, rondaId) {
  const asignaciones = await AsignacionRonda.findAll({
    where: { rondaId: Number(rondaId) }
  });

  if (!asignaciones.length) return null;

  const grupoIds = asignaciones.map((a) => Number(a.grupoId)).filter(Boolean);

  if (!grupoIds.length) return null;

  const rows = await sequelize.query(
    `
    SELECT "grupoId"
    FROM usuario_grupo
    WHERE "usuarioId" = :usuarioId
      AND "grupoId" IN (:grupoIds)
    LIMIT 1
    `,
    {
      replacements: {
        usuarioId: Number(usuarioId),
        grupoIds
      },
      type: QueryTypes.SELECT
    }
  );

  return rows[0] ? Number(rows[0].grupoId) : null;
}

async function injectGrupoId(req, res, next) {
  try {
    if (req.user?.rol === 'admin' || req.user?.rol === 'supervisor') {
      req.canViewAllGroups = true;
      req.grupoId = null;
      return next();
    }

    const usuarioId = req.user?.id;

    const grupoIdDirecto =
      req.body?.grupoId ||
      req.query?.grupoId ||
      req.params?.grupoId ||
      null;

    if (grupoIdDirecto) {
      const grupoId = await buscarMembresiaDirecta(usuarioId, grupoIdDirecto);

      if (grupoId) {
        req.grupoId = grupoId;
        req.canViewAllGroups = false;
        return next();
      }
    }

    const rondaId =
      req.body?.rondaId ||
      req.query?.rondaId ||
      req.params?.rondaId ||
      null;

    if (rondaId) {
      const grupoId = await resolverGrupoDesdeRonda(usuarioId, rondaId);

      if (grupoId) {
        req.grupoId = grupoId;
        req.canViewAllGroups = false;
        return next();
      }
    }

    const fallbackGrupoId = await buscarPrimerGrupoUsuario(usuarioId);

    if (fallbackGrupoId) {
      req.grupoId = fallbackGrupoId;
      req.canViewAllGroups = false;
      return next();
    }

    return res.status(403).json({
      ok: false,
      message: 'No fue posible identificar el grupo del usuario para esta ronda.'
    });
  } catch (error) {
    return next(error);
  }
}

function requiereGrupo(req, res, next) {
  if (!req.canViewAllGroups && !req.grupoId) {
    return res.status(403).json({
      ok: false,
      message: 'Se requiere pertenecer a un grupo para esta acción'
    });
  }

  return next();
}

module.exports = {
  injectGrupoId,
  requiereGrupo
};