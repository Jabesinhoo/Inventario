const { sequelize, AsignacionRonda, RondaConteo } = require('../models');
const { QueryTypes } = require('sequelize');

async function injectGrupoId(req, res, next) {
  try {
    if (req.user.rol === 'admin' || req.user.rol === 'supervisor') {
      req.canViewAllGroups = true;
      req.grupoId = null;
      req.rondaActiva = null;
      return next();
    }

    const grupoSolicitado =
      req.body?.grupoId ||
      req.query?.grupoId ||
      req.params?.grupoId ||
      null;

    if (grupoSolicitado) {
      const pertenece = await sequelize.query(
        `
        SELECT 1
        FROM usuario_grupo
        WHERE "usuarioId" = :usuarioId
          AND "grupoId" = :grupoId
        LIMIT 1
        `,
        {
          replacements: {
            usuarioId: req.user.id,
            grupoId: Number(grupoSolicitado)
          },
          type: QueryTypes.SELECT
        }
      );

      if (pertenece.length === 0) {
        return res.status(403).json({
          ok: false,
          message: 'No puedes operar con un grupo que no te pertenece'
        });
      }

      req.grupoId = Number(grupoSolicitado);
      req.canViewAllGroups = false;

      const rondaActiva = await RondaConteo.findOne({
        where: { estado: 'activa' },
        include: [
          {
            model: AsignacionRonda,
            as: 'asignacion',
            where: { grupoId: req.grupoId },
            required: true
          }
        ],
        order: [['updatedAt', 'DESC']]
      });

      req.rondaActiva = rondaActiva || null;
      return next();
    }

    const gruposActivos = await sequelize.query(
      `
      SELECT
        ug."grupoId",
        ar."rondaId"
      FROM usuario_grupo ug
      JOIN asignaciones_ronda ar
        ON ar."grupoId" = ug."grupoId"
      JOIN rondas_conteo r
        ON r.id = ar."rondaId"
      WHERE ug."usuarioId" = :usuarioId
        AND r.estado = 'activa'
      ORDER BY r."updatedAt" DESC
      `,
      {
        replacements: { usuarioId: req.user.id },
        type: QueryTypes.SELECT
      }
    );

    if (gruposActivos.length === 1) {
      req.grupoId = Number(gruposActivos[0].grupoId);
      req.canViewAllGroups = false;

      const rondaActiva = await RondaConteo.findByPk(gruposActivos[0].rondaId, {
        include: [
          {
            model: AsignacionRonda,
            as: 'asignacion',
            required: true
          }
        ]
      });

      req.rondaActiva = rondaActiva || null;
      return next();
    }

    const gruposUsuario = await sequelize.query(
      `
      SELECT ug."grupoId"
      FROM usuario_grupo ug
      WHERE ug."usuarioId" = :usuarioId
      ORDER BY ug."fechaAsignacion" DESC NULLS LAST, ug."grupoId" ASC
      `,
      {
        replacements: { usuarioId: req.user.id },
        type: QueryTypes.SELECT
      }
    );

    if (gruposUsuario.length === 1) {
      req.grupoId = Number(gruposUsuario[0].grupoId);
      req.canViewAllGroups = false;
      req.rondaActiva = null;
      return next();
    }

    return res.status(400).json({
      ok: false,
      message: 'No fue posible identificar el grupo del usuario. Revisa su asignación.'
    });
  } catch (error) {
    next(error);
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