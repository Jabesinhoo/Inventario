const bcrypt = require('bcryptjs');
const Joi = require('joi');
const { Usuario, Rol, sequelize } = require('../models');

const createUsuarioSchema = Joi.object({
    nombre: Joi.string().max(120).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    rolId: Joi.number().integer().required(),
    activo: Joi.boolean().default(true)
});

const updateUsuarioSchema = Joi.object({
    nombre: Joi.string().max(120),
    email: Joi.string().email(),
    password: Joi.string().min(6),
    rolId: Joi.number().integer(),
    activo: Joi.boolean()
});

async function getUsuarios(req, res, next) {
    try {
        const usuarios = await Usuario.findAll({
            include: [{ model: Rol, as: 'rol', attributes: ['id', 'nombre'] }],
            attributes: { exclude: ['passwordHash'] },
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

async function getUsuario(req, res, next) {
    try {
        const { id } = req.params;

        const usuario = await Usuario.findByPk(id, {
            include: [{ model: Rol, as: 'rol', attributes: ['id', 'nombre'] }],
            attributes: { exclude: ['passwordHash'] }
        });

        if (!usuario) {
            return res.status(404).json({
                ok: false,
                message: 'Usuario no encontrado'
            });
        }

        res.json({
            ok: true,
            data: usuario
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

        const existe = await Usuario.findOne({ where: { email: value.email } });
        if (existe) {
            return res.status(400).json({
                ok: false,
                message: 'El email ya está registrado'
            });
        }

        const passwordHash = await bcrypt.hash(value.password, 10);

        const usuario = await Usuario.create({
            nombre: value.nombre,
            email: value.email,
            passwordHash,
            rolId: value.rolId,
            activo: value.activo
        });

        res.status(201).json({
            ok: true,
            data: {
                id: usuario.id,
                nombre: usuario.nombre,
                email: usuario.email,
                rolId: usuario.rolId,
                activo: usuario.activo
            }
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

        const updateData = {};
        if (value.nombre !== undefined) updateData.nombre = value.nombre;
        if (value.email !== undefined) updateData.email = value.email;
        if (value.rolId !== undefined) updateData.rolId = value.rolId;
        if (value.activo !== undefined) updateData.activo = value.activo;

        if (value.password) {
            updateData.passwordHash = await bcrypt.hash(value.password, 10);
        }

        await usuario.update(updateData);

        res.json({
            ok: true,
            message: 'Usuario actualizado correctamente'
        });
    } catch (error) {
        next(error);
    }
}

async function deleteUsuario(req, res, next) {
    try {
        const { id } = req.params;

        const usuario = await Usuario.findByPk(id);
        if (!usuario) {
            return res.status(404).json({
                ok: false,
                message: 'Usuario no encontrado'
            });
        }

        await usuario.destroy();

        res.json({
            ok: true,
            message: 'Usuario eliminado correctamente'
        });
    } catch (error) {
        next(error);
    }
}

async function asignarGrupo(req, res, next) {
    try {
        const { usuarioId, grupoId } = req.body;

        const usuario = await Usuario.findByPk(usuarioId);
        if (!usuario) {
            return res.status(404).json({
                ok: false,
                message: 'Usuario no encontrado'
            });
        }

        // 🔒 VALIDACIÓN: Si ya pertenece a otro grupo, no permitir
        if (grupoId && usuario.grupoId && usuario.grupoId !== grupoId) {
            return res.status(400).json({
                ok: false,
                message: `El usuario ya pertenece al grupo "${usuario.grupo?.nombre || usuario.grupoId}". Debe ser removido primero.`
            });
        }

        await usuario.update({ grupoId: grupoId || null });

        res.json({
            ok: true,
            message: grupoId ? 'Usuario asignado al grupo' : 'Usuario removido del grupo'
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getUsuarios,
    getUsuario,
    createUsuario,
    updateUsuario,
    deleteUsuario,
    asignarGrupo
};