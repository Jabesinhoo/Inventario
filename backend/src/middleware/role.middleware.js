function allowRoles(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.user || !rolesPermitidos.includes(req.user.rol)) {
      return res.status(403).json({
        ok: false,
        message: 'No tienes permisos para realizar esta acción'
      });
    }

    next();
  };
}

module.exports = allowRoles;