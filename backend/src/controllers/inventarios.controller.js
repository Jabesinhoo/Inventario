const Joi = require('joi');
const { Inventario } = require('../models');

const createInventarioSchema = Joi.object({
  nombre: Joi.string().max(150).required(),
  fecha: Joi.date().required(),
  estado: Joi.string().max(30).default('borrador'),
  requiereConteo3: Joi.boolean().default(false)
});

const updateInventarioSchema = Joi.object({
  nombre: Joi.string().max(150),
  fecha: Joi.date(),
  estado: Joi.string().max(30),
  requiereConteo3: Joi.boolean()
}).min(1);

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

    const inventario = await Inventario.create({
      nombre,
      fecha: value.fecha,
      estado: value.estado,
      requiereConteo3: value.requiereConteo3
    });

    res.status(201).json({
      ok: true,
      data: inventario
    });
  } catch (error) {
    next(error);
  }
}

async function getInventarios(req, res, next) {
  try {
    const inventarios = await Inventario.findAll({
      order: [['fecha', 'DESC']]
    });

    res.json({
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

    if (value.nombre !== undefined) updateData.nombre = value.nombre.trim();
    if (value.fecha !== undefined) updateData.fecha = value.fecha;
    if (value.estado !== undefined) updateData.estado = value.estado;
    if (value.requiereConteo3 !== undefined) updateData.requiereConteo3 = value.requiereConteo3;

    const nombreFinal = updateData.nombre ?? inventario.nombre;
    const fechaFinal = updateData.fecha ?? inventario.fecha;

    const duplicado = await Inventario.findOne({
      where: {
        nombre: nombreFinal,
        fecha: fechaFinal,
        id: { [require('sequelize').Op.ne]: id }
      }
    });

    if (duplicado) {
      return res.status(400).json({
        ok: false,
        message: 'Ya existe otro inventario con ese nombre y fecha'
      });
    }

    await inventario.update(updateData);

    res.json({
      ok: true,
      data: inventario,
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

    await inventario.destroy();

    res.json({
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