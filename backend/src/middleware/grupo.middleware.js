const { Op } = require('sequelize');
const { UsuarioGrupo, AsignacionRonda } = require('../models');

async function resolverGrupoDesdeSolicitud(req) {
  const userId = req.user.id;

  const grupoIdDirecto =
    req.body?.grupoId ||
    req.query?.grupoId ||
    req.params?.grupoId ||
    null;

  if (grupoIdDirecto) {
    const membresia = await UsuarioGrupo.findOne({
      where: {
        usuarioId: userId,
        grupoId: Number(grupoIdDirecto)
      }
    });

    if (membresia) {
      return Number(membresia.grupoId);
    }
  }

  const rondaId =
    req.body?.rondaId ||
    req.query?.rondaId ||
    req.params?.rondaId ||
    null;

  if (rondaId) {
    const asignaciones = await AsignacionRonda.findAll({
      where: {
        rondaId: Number(rondaId)
      }
    });

    if (asignaciones.length) {
      const grupoIds = asignaciones.map((a) => Number(a.grupoId));

      const membresia = await UsuarioGrupo.findOne({
        where: {
          usuarioId: userId,
          grupoId: {
            [Op.in]: grupoIds
          }
        }
      });

      if (membresia) {
        return Number(membresia.grupoId);
      }
    }
  }

  return null;
}

async function injectGrupoId(req, res, next) {
  try {
    if (req.user?.rol === 'admin' || req.user?.rol === 'supervisor') {
      req.canViewAllGroups = true;
      req.grupoId = null;
      return next();
    }

    const grupoId = await resolverGrupoDesdeSolicitud(req);

    if (!grupoId) {
      return res.status(403).json({
        ok: false,
        message: 'No fue posible identificar el grupo del usuario para esta ronda.'
      });
    }

    req.grupoId = Number(grupoId);
    req.canViewAllGroups = false;

    return next();
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