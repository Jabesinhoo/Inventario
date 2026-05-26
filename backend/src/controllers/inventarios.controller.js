const Joi = require('joi');
const { Op } = require('sequelize');
const { Inventario } = require('../models');

const createInventarioSchema = Joi.object({
  nombre: Joi.string().trim().max(150).required(),
  fecha: Joi.date().required(),
  estado: Joi.string().trim().max(30).default('borrador'),
  requiereConteo3: Joi.boolean().default(false),
  inventarioBaseId: Joi.number().integer().allow(null, '')
});

const updateInventarioSchema = Joi.object({
  nombre: Joi.string().trim().max(150),
  fecha: Joi.date(),
  estado: Joi.string().trim().max(30),
  requiereConteo3: Joi.boolean(),
  inventarioBaseId: Joi.number().integer().allow(null, '')
}).min(1);

function normalizarNullableNumero(value) {
  if (value === '' || value === null || typeof value === 'undefined') return null;

  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

async function validarInventarioBase({ inventarioBaseId, inventarioActualId = null }) {
  if (!inventarioBaseId) return null;

  if (
    inventarioActualId &&
    Number(inventarioBaseId) === Number(inventarioActualId)
  ) {
    return {
      status: 400,
      message: 'Un inventario no puede ser base de sí mismo'
    };
  }

  const inventarioBase = await Inventario.findByPk(inventarioBaseId);

  if (!inventarioBase) {
    return {
      status: 404,
      message: 'Inventario base no encontrado'
    };
  }

  return null;
}

async function createInventario(req, res, next) {
  try {
    const { error, value } = createInventarioSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const nombre = value.nombre.trim();
    const inventarioBaseId = normalizarNullableNumero(value.inventarioBaseId);

    const existe = await Inventario.findOne({
      where: {
        nombre,
        fecha: value.fecha
      }
    });

    if (existe) {
      return res.status(400).json({
        ok: false,
        message: 'Ya existe un inventario con ese nombre y fecha'
      });
    }

    const errorBase = await validarInventarioBase({ inventarioBaseId });

    if (errorBase) {
      return res.status(errorBase.status).json({
        ok: false,
        message: errorBase.message
      });
    }

    const inventario = await Inventario.create({
      nombre,
      fecha: value.fecha,
      estado: value.estado || 'borrador',
      requiereConteo3: Boolean(value.requiereConteo3),
      inventarioBaseId
    });

    const inventarioConBase = await Inventario.findByPk(inventario.id, {
      include: [
        {
          model: Inventario,
          as: 'inventarioBase',
          attributes: ['id', 'nombre', 'fecha', 'estado'],
          required: false
        }
      ]
    });

    return res.status(201).json({
      ok: true,
      data: inventarioConBase || inventario,
      message: 'Inventario creado correctamente'
    });
  } catch (error) {
    next(error);
  }
}

async function getInventarios(req, res, next) {
  try {
    const inventarios = await Inventario.findAll({
      include: [
        {
          model: Inventario,
          as: 'inventarioBase',
          attributes: ['id', 'nombre', 'fecha', 'estado'],
          required: false
        }
      ],
      order: [
        ['fecha', 'DESC'],
        ['id', 'DESC']
      ]
    });

    return res.json({
      ok: true,
      data: inventarios
    });
  } catch (error) {
    next(error);
  }
}

async function updateInventario(req, res, next) {
  try {
    const { id } = req.params;
    const { error, value } = updateInventarioSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const inventario = await Inventario.findByPk(id);

    if (!inventario) {
      return res.status(404).json({
        ok: false,
        message: 'Inventario no encontrado'
      });
    }

    const updateData = {};

    if (value.nombre !== undefined) {
      updateData.nombre = value.nombre.trim();
    }

    if (value.fecha !== undefined) {
      updateData.fecha = value.fecha;
    }

    if (value.estado !== undefined) {
      updateData.estado = value.estado;
    }

    if (value.requiereConteo3 !== undefined) {
      updateData.requiereConteo3 = Boolean(value.requiereConteo3);
    }

    if (value.inventarioBaseId !== undefined) {
      const inventarioBaseId = normalizarNullableNumero(value.inventarioBaseId);

      const errorBase = await validarInventarioBase({
        inventarioBaseId,
        inventarioActualId: id
      });

      if (errorBase) {
        return res.status(errorBase.status).json({
          ok: false,
          message: errorBase.message
        });
      }

      updateData.inventarioBaseId = inventarioBaseId;
    }

    const nombreFinal = updateData.nombre ?? inventario.nombre;
    const fechaFinal = updateData.fecha ?? inventario.fecha;

    const duplicado = await Inventario.findOne({
      where: {
        nombre: nombreFinal,
        fecha: fechaFinal,
        id: { [Op.ne]: Number(id) }
      }
    });

    if (duplicado) {
      return res.status(400).json({
        ok: false,
        message: 'Ya existe otro inventario con ese nombre y fecha'
      });
    }

    await inventario.update(updateData);

    const inventarioActualizado = await Inventario.findByPk(id, {
      include: [
        {
          model: Inventario,
          as: 'inventarioBase',
          attributes: ['id', 'nombre', 'fecha', 'estado'],
          required: false
        }
      ]
    });

    return res.json({
      ok: true,
      data: inventarioActualizado || inventario,
      message: 'Inventario actualizado correctamente'
    });
  } catch (error) {
    next(error);
  }
}

async function deleteInventario(req, res, next) {
  try {
    const { id } = req.params;

    const inventario = await Inventario.findByPk(id);

    if (!inventario) {
      return res.status(404).json({
        ok: false,
        message: 'Inventario no encontrado'
      });
    }

    const derivados = await Inventario.count({
      where: {
        inventarioBaseId: Number(id)
      }
    });

    if (derivados > 0) {
      return res.status(400).json({
        ok: false,
        message:
          'No puedes eliminar este inventario porque otros inventarios lo usan como inventario base.'
      });
    }

    await inventario.destroy();

    return res.json({
      ok: true,
      message: 'Inventario eliminado correctamente'
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createInventario,
  getInventarios,
  updateInventario,
  deleteInventario
};