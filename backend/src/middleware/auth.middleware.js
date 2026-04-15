const { verifyToken } = require('../utils/jwt');
const { Usuario, Rol } = require('../models');

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        ok: false,
        message: 'Token no proporcionado'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    const usuario = await Usuario.findByPk(decoded.id, {
      include: [{ model: Rol, as: 'rol', attributes: ['id', 'nombre'] }]
    });

    if (!usuario || !usuario.activo) {
      return res.status(401).json({
        ok: false,
        message: 'Usuario no válido o inactivo'
      });
    }

    req.user = {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol?.nombre || null
    };

    next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      message: 'Token inválido o expirado'
    });
  }
}

module.exports = authMiddleware;