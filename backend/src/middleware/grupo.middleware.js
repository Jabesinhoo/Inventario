const { UsuarioGrupo, AsignacionRonda } = require('../models');

async function resolverGrupoDesdeSolicitud(req) {
  const userId = req.user.id;

  const grupoIdDirecto =
    req.body?.grupoId ||
    req.query?.grupoId ||
    null;

  if (grupoIdDirecto) {
    const membresia = await UsuarioGrupo.findOne({
      where: {
        usuarioId: userId,
        grupoId: grupoIdDirecto
      }
    });

    if (membresia) {
      return Number(grupoIdDirecto);
    }
  }

  const rondaId =
    req.body?.rondaId ||
    req.query?.rondaId ||
    null;

  if (rondaId) {
    const asignaciones = await AsignacionRonda.findAll({
      where: { rondaId }
    });

    if (!asignaciones.length) return null;

    const grupoIds = asignaciones.map((a) => Number(a.grupoId));

    const membresia = await UsuarioGrupo.findOne({
      where: {
        usuarioId: userId,
        grupoId: grupoIds
      }
    });

    if (membresia) {
      return Number(membresia.grupoId);
    }
  }

  return null;
}

async function injectGrupoId(req, res, next) {
  try {
    if (req.user.rol === 'admin' || req.user.rol === 'supervisor') {
      req.canViewAllGroups = true;
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

    next();
  } catch (error) {
    next(error);
  }
}

function requiereGrupo(req, res, next) {
  if (!req.grupoId && !req.canViewAllGroups) {
    return res.status(403).json({
      ok: false,
      message: 'Se requiere pertenecer a un grupo para esta acción'
    });
  }
  next();
}

module.exports = {
  injectGrupoId,
  requiereGrupo
};