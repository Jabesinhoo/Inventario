const { Usuario } = require('../models');

async function injectGrupoId(req, res, next) {
  try {
    // Admin y supervisor ven todo
    if (req.user.rol === 'admin' || req.user.rol === 'supervisor') {
      req.canViewAllGroups = true;
      return next();
    }

    // Contadores: solo ven su grupo
    const usuario = await Usuario.findByPk(req.user.id);
    
    if (!usuario || !usuario.grupoId) {
      return res.status(403).json({
        ok: false,
        message: 'No tienes un grupo asignado. Contacta al administrador.'
      });
    }

    req.grupoId = usuario.grupoId;
    req.canViewAllGroups = false;
    
    // También obtener la ronda activa del grupo
    const rondaActiva = await RondaConteo.findOne({
      include: [{
        model: AsignacionRonda,
        as: 'asignacion',
        where: { grupoId: usuario.grupoId },
        required: true
      }],
      where: { estado: 'activa' }
    });
    
    req.rondaActiva = rondaActiva;
    
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