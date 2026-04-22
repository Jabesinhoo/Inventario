const Joi = require('joi');
const { Op } = require('sequelize');
const { Zona } = require('../models');

const createZonaSchema = Joi.object({
  nombre: Joi.string().max(120).required(),
  codigo: Joi.string().max(40).required(),
  activa: Joi.boolean().default(true)
});

const updateZonaSchema = Joi.object({
  nombre: Joi.string().max(120),
  codigo: Joi.string().max(40),
  activa: Joi.boolean()
}).min(1);

async function createZona(req, res, next) {
  try {
    const { error, value } = createZonaSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const nombre = value.nombre.trim();
    const codigo = value.codigo.trim();

    const nombreExistente = await Zona.findOne({ where: { nombre } });
    if (nombreExistente) {
      return res.status(400).json({
        ok: false,
        message: 'Ya existe una zona con ese nombre'
      });
    }

    const codigoExistente = await Zona.findOne({ where: { codigo } });
    if (codigoExistente) {
      return res.status(400).json({
        ok: false,
        message: 'Ya existe una zona con ese código'
      });
    }

    const zona = await Zona.create({
      nombre,
      codigo,
      activa: value.activa
    });

    res.status(201).json({
      ok: true,
      data: zona
    });
  } catch (error) {
    next(error);
  }
}

async function getZonas(req, res, next) {
  try {
    const zonas = await Zona.findAll({
      order: [['nombre', 'ASC']]
    });

    res.json({
      ok: true,
      data: zonas
    });
  } catch (error) {
    next(error);
  }
}

async function updateZona(req, res, next) {
  try {
    const { id } = req.params;
    const { error, value } = updateZonaSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const zona = await Zona.findByPk(id);

    if (!zona) {
      return res.status(404).json({
        ok: false,
        message: 'Zona no encontrada'
      });
    }

    const updateData = {};

    if (value.nombre !== undefined) updateData.nombre = value.nombre.trim();
    if (value.codigo !== undefined) updateData.codigo = value.codigo.trim();
    if (value.activa !== undefined) updateData.activa = value.activa;

    if (updateData.nombre) {
      const nombreExistente = await Zona.findOne({
        where: {
          nombre: updateData.nombre,
          id: { [Op.ne]: id }
        }
      });

      if (nombreExistente) {
        return res.status(400).json({
          ok: false,
          message: 'Ya existe otra zona con ese nombre'
        });
      }
    }

    if (updateData.codigo) {
      const codigoExistente = await Zona.findOne({
        where: {
          codigo: updateData.codigo,
          id: { [Op.ne]: id }
        }
      });

      if (codigoExistente) {
        return res.status(400).json({
          ok: false,
          message: 'Ya existe otra zona con ese código'
        });
      }
    }

    await zona.update(updateData);

    res.json({
      ok: true,
      data: zona,
      message: 'Zona actualizada correctamente'
    });
  } catch (error) {
    next(error);
  }
}

async function deleteZona(req, res, next) {
  try {
    const { id } = req.params;

    const zona = await Zona.findByPk(id);

    if (!zona) {
      return res.status(404).json({
        ok: false,
        message: 'Zona no encontrada'
      });
    }

    await zona.destroy();

    res.json({
      ok: true,
      message: 'Zona eliminada correctamente'
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createZona,
  getZonas,
  updateZona,
  deleteZona
};