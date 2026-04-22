const { Usuario, Grupo, AsignacionRonda, RondaConteo, Op } = require('../models');

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function getRequestedGroupId(req) {
  return (
    toNumberOrNull(req.body?.grupoId) ??
    toNumberOrNull(req.query?.grupoId) ??
    toNumberOrNull(req.params?.grupoId)
  );
}

function getRequestedRondaId(req) {
  const directRondaId =
    toNumberOrNull(req.body?.rondaId) ??
    toNumberOrNull(req.query?.rondaId) ??
    toNumberOrNull(req.params?.rondaId);

  if (directRondaId) return directRondaId;

  // En rutas /rondas/:id/... el :id sí representa rondaId
  if (req.baseUrl?.includes('/rondas')) {
    return toNumberOrNull(req.params?.id);
  }

  return null;
}

async function getUsuarioConGrupos(userId) {
  return Usuario.findByPk(userId, {
    include: [
      {
        model: Grupo,
        as: 'grupos',
        attributes: ['id', 'nombre', 'inventarioId'],
        through: { attributes: [] }
      }
    ]
  });
}

async function getActiveRoundForGroup(grupoId) {
  return RondaConteo.findOne({
    where: { estado: 'activa' },
    include: [
      {
        model: AsignacionRonda,
        as: 'asignacion',
        required: true,
        where: { grupoId },
        include: [
          {
            model: Grupo,
            as: 'grupo',
            attributes: ['id', 'nombre', 'inventarioId']
          }
        ]
      }
    ],
    order: [['updatedAt', 'DESC']]
  });
}

async function resolveGroupFromRonda(rondaId, allowedGroupIds) {
  const asignacion = await AsignacionRonda.findOne({
    where: {
      rondaId,
      grupoId: {
        [Op.in]: allowedGroupIds
      }
    },
    include: [
      {
        model: RondaConteo,
        as: 'ronda',
        attributes: [
          'id',
          'inventarioId',
          'zonaId',
          'numeroRonda',
          'tipoRonda',
          'estado',
          'tiempoInicio',
          'tiempoFin',
          'totalEscaneos'
        ]
      },
      {
        model: Grupo,
        as: 'grupo',
        attributes: ['id', 'nombre', 'inventarioId']
      }
    ]
  });

  return asignacion;
}

async function injectGrupoId(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        message: 'Usuario no autenticado'
      });
    }

    if (req.user.rol === 'admin' || req.user.rol === 'supervisor') {
      req.canViewAllGroups = true;
      req.grupoId = null;
      req.gruposUsuario = [];
      req.rondaActiva = null;
      return next();
    }

    const usuario = await getUsuarioConGrupos(req.user.id);

    if (!usuario || !usuario.activo) {
      return res.status(403).json({
        ok: false,
        message: 'Usuario no válido o inactivo'
      });
    }

    const grupos = usuario.grupos || [];

    if (grupos.length === 0) {
      return res.status(403).json({
        ok: false,
        message: 'No tienes grupos asignados. Contacta al administrador.'
      });
    }

    const allowedGroupIds = grupos.map((g) => Number(g.id));
    const requestedGroupId = getRequestedGroupId(req);
    const requestedRondaId = getRequestedRondaId(req);

    let resolvedGroupId = null;
    let resolvedRonda = null;

    if (requestedGroupId) {
      if (!allowedGroupIds.includes(Number(requestedGroupId))) {
        return res.status(403).json({
          ok: false,
          message: 'No puedes operar con un grupo que no te pertenece'
        });
      }

      resolvedGroupId = Number(requestedGroupId);
      resolvedRonda = await getActiveRoundForGroup(resolvedGroupId);
    } else if (requestedRondaId) {
      const asignacion = await resolveGroupFromRonda(requestedRondaId, allowedGroupIds);

      if (!asignacion) {
        return res.status(403).json({
          ok: false,
          message: 'No tienes acceso a esa ronda'
        });
      }

      resolvedGroupId = Number(asignacion.grupoId);
      resolvedRonda = asignacion.ronda || null;
    } else if (grupos.length === 1) {
      resolvedGroupId = Number(grupos[0].id);
      resolvedRonda = await getActiveRoundForGroup(resolvedGroupId);
    } else {
      // Si tiene varios grupos, intentamos resolver por una ronda activa
      const rondasActivas = await RondaConteo.findAll({
        where: { estado: 'activa' },
        include: [
          {
            model: AsignacionRonda,
            as: 'asignacion',
            required: true,
            where: {
              grupoId: {
                [Op.in]: allowedGroupIds
              }
            },
            include: [
              {
                model: Grupo,
                as: 'grupo',
                attributes: ['id', 'nombre', 'inventarioId']
              }
            ]
          }
        ],
        order: [['updatedAt', 'DESC']]
      });

      if (rondasActivas.length === 1) {
        resolvedRonda = rondasActivas[0];
        resolvedGroupId = Number(rondasActivas[0].asignacion?.grupoId);
      } else {
        return res.status(400).json({
          ok: false,
          message: 'Debes indicar el grupo o la ronda para identificar tu contexto de trabajo'
        });
      }
    }

    req.canViewAllGroups = false;
    req.grupoId = resolvedGroupId;
    req.gruposUsuario = grupos.map((g) => ({
      id: g.id,
      nombre: g.nombre,
      inventarioId: g.inventarioId
    }));
    req.rondaActiva = resolvedRonda || null;

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

  next();
}

module.exports = {
  injectGrupoId,
  requiereGrupo
};