const Joi = require('joi');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { Usuario, Rol } = require('../models');

const createUsuarioSchema = Joi.object({
  nombre: Joi.string().trim().max(120).required(),
  email: Joi.string().trim().email().required(),
  password: Joi.string().min(4).max(100).required(),
  rolId: Joi.number().integer().required(),
  activo: Joi.boolean().default(true)
});

const updateUsuarioSchema = Joi.object({
  nombre: Joi.string().trim().max(120).required(),
  email: Joi.string().trim().email().required(),
  password: Joi.string().min(4).max(100).allow('', null),
  rolId: Joi.number().integer().required(),
  activo: Joi.boolean().required()
});

const updateEstadoSchema = Joi.object({
  activo: Joi.boolean().required()
});

async function getUsuarios(req, res, next) {
  try {
    const usuarios = await Usuario.findAll({
      include: [
        {
          model: Rol,
          as: 'rol',
          attributes: ['id', 'nombre']
        }
      ],
      attributes: { exclude: ['password'] },
      order: [['nombre', 'ASC']]
    });

    res.json({
      ok: true,
      data: usuarios
    });
  } catch (error) {
    next(error);
  }
}

async function getRoles(req, res, next) {
  try {
    const roles = await Rol.findAll({
      order: [['nombre', 'ASC']]
    });

    res.json({
      ok: true,
      data: roles
    });
  } catch (error) {
    next(error);
  }
}

async function createUsuario(req, res, next) {
  try {
    const { error, value } = createUsuarioSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const email = value.email.trim().toLowerCase();

    const usuarioExistente = await Usuario.findOne({
      where: {
        email: { [Op.iLike]: email }
      }
    });

    if (usuarioExistente) {
      return res.status(400).json({
        ok: false,
        message: 'Ya existe un usuario con ese correo'
      });
    }

    const rol = await Rol.findByPk(value.rolId);
    if (!rol) {
      return res.status(404).json({
        ok: false,
        message: 'Rol no encontrado'
      });
    }

    const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
    const passwordHash = await bcrypt.hash(value.password, rounds);

    const usuario = await Usuario.create({
      nombre: value.nombre.trim(),
      email,
      password: passwordHash,
      rolId: value.rolId,
      activo: value.activo
    });

    const usuarioCreado = await Usuario.findByPk(usuario.id, {
      include: [
        {
          model: Rol,
          as: 'rol',
          attributes: ['id', 'nombre']
        }
      ],
      attributes: { exclude: ['password'] }
    });

    res.status(201).json({
      ok: true,
      message: 'Usuario creado correctamente',
      data: usuarioCreado
    });
  } catch (error) {
    next(error);
  }
}

async function updateUsuario(req, res, next) {
  try {
    const { id } = req.params;
    const { error, value } = updateUsuarioSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const usuario = await Usuario.findByPk(id);

    if (!usuario) {
      return res.status(404).json({
        ok: false,
        message: 'Usuario no encontrado'
      });
    }

    const email = value.email.trim().toLowerCase();

    const usuarioExistente = await Usuario.findOne({
      where: {
        id: { [Op.ne]: id },
        email: { [Op.iLike]: email }
      }
    });

    if (usuarioExistente) {
      return res.status(400).json({
        ok: false,
        message: 'Ya existe otro usuario con ese correo'
      });
    }

    const rol = await Rol.findByPk(value.rolId);
    if (!rol) {
      return res.status(404).json({
        ok: false,
        message: 'Rol no encontrado'
      });
    }

    const dataToUpdate = {
      nombre: value.nombre.trim(),
      email,
      rolId: value.rolId,
      activo: value.activo
    };

    if (value.password && String(value.password).trim()) {
      const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
      dataToUpdate.password = await bcrypt.hash(value.password, rounds);
    }

    await usuario.update(dataToUpdate);

    const usuarioActualizado = await Usuario.findByPk(usuario.id, {
      include: [
        {
          model: Rol,
          as: 'rol',
          attributes: ['id', 'nombre']
        }
      ],
      attributes: { exclude: ['password'] }
    });

    res.json({
      ok: true,
      message: 'Usuario actualizado correctamente',
      data: usuarioActualizado
    });
  } catch (error) {
    next(error);
  }
}

async function updateEstadoUsuario(req, res, next) {
  try {
    const { id } = req.params;
    const { error, value } = updateEstadoSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const usuario = await Usuario.findByPk(id);

    if (!usuario) {
      return res.status(404).json({
        ok: false,
        message: 'Usuario no encontrado'
      });
    }

    if (Number(req.user.id) === Number(usuario.id) && value.activo === false) {
      return res.status(400).json({
        ok: false,
        message: 'No puedes desactivar tu propio usuario'
      });
    }

    await usuario.update({ activo: value.activo });

    res.json({
      ok: true,
      message: value.activo
        ? 'Usuario activado correctamente'
        : 'Usuario desactivado correctamente'
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getUsuarios,
  getRoles,
  createUsuario,
  updateUsuario,
  updateEstadoUsuario
};