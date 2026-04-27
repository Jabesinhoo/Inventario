const bcrypt = require('bcryptjs');
const Joi = require('joi');
const { Op } = require('sequelize');
const { Usuario, Rol } = require('../models');
const { generateToken } = require('../utils/jwt');

const loginSchema = Joi.object({
  identificador: Joi.string().trim().required(),
  password: Joi.string().min(4).required()
});

async function login(req, res, next) {
  try {
    const { error, value } = loginSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const identificador = value.identificador.trim();

    const usuario = await Usuario.findOne({
      where: {
        [Op.or]: [
          { email: { [Op.iLike]: identificador.toLowerCase() } },
          { nombre: { [Op.iLike]: identificador } }
        ]
      },
      include: [{ model: Rol, as: 'rol', attributes: ['id', 'nombre'] }]
    });

    if (!usuario) {
      return res.status(401).json({
        ok: false,
        message: 'Credenciales inválidas'
      });
    }

    if (!usuario.activo) {
      return res.status(403).json({
        ok: false,
        message: 'Usuario inactivo'
      });
    }

    const isValidPassword = await bcrypt.compare(
      value.password,
      usuario.passwordHash
    );

    if (!isValidPassword) {
      return res.status(401).json({
        ok: false,
        message: 'Credenciales inválidas'
      });
    }

    const token = generateToken({
      id: usuario.id,
      email: usuario.email
    });

    return res.json({
      ok: true,
      token,
      user: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol?.nombre || null
      }
    });
  } catch (error) {
    next(error);
  }
}

async function me(req, res) {
  return res.json({
    ok: true,
    user: req.user
  });
}

module.exports = {
  login,
  me
};