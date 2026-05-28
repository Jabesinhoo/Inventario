const Joi = require('joi');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');

console.log('✅ Archivo etiqueta.controller.js cargado');

const etiquetaSchema = Joi.object({
  sku: Joi.string().trim().max(80).required()
}).unknown(true);

function normalizarSku(value) {
  return String(value || '').trim();
}

async function getEtiquetas(req, res, next) {
  try {
    const etiquetas = await sequelize.query(
      `
      SELECT
        id,
        sku,
        nombre,
        color,
        nota,
        activo,
        "createdAt",
        "updatedAt"
      FROM sku_etiquetas
      WHERE activo = true
      ORDER BY "updatedAt" DESC, id DESC
      `,
      { type: QueryTypes.SELECT }
    );

    return res.json({
      ok: true,
      data: etiquetas || []
    });
  } catch (error) {
    console.error('❌ Error en getEtiquetas:', {
      message: error.message,
      parent: error.parent?.message,
      original: error.original?.message
    });
    next(error);
  }
}

async function getEtiquetaPorSku(req, res, next) {
  try {
    const sku = normalizarSku(req.params.sku);

    console.log('🔎 getEtiquetaPorSku ejecutándose:', {
      params: req.params,
      sku
    });

    const etiquetas = await sequelize.query(
      `
      SELECT
        id,
        sku,
        nombre,
        color,
        nota,
        activo,
        "createdAt",
        "updatedAt"
      FROM sku_etiquetas
      WHERE TRIM(sku::text) = TRIM(:sku::text)
        AND activo = true
      ORDER BY "updatedAt" DESC, id DESC
      `,
      {
        replacements: { sku },
        type: QueryTypes.SELECT
      }
    );

    return res.json({
      ok: true,
      data: etiquetas || []
    });
  } catch (error) {
    console.error('❌ Error en getEtiquetaPorSku:', {
      message: error.message,
      parent: error.parent?.message,
      original: error.original?.message
    });
    next(error);
  }
}

async function upsertEtiqueta(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    console.log('🔥 upsertEtiqueta ejecutándose:', {
      body: req.body,
      user: req.user,
      headersAuth: Boolean(req.headers.authorization)
    });

    const { error, value } = etiquetaSchema.validate(req.body);

    if (error) {
      await transaction.rollback();
      console.error('❌ Validación etiqueta falló:', error.details);

      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const sku = normalizarSku(value.sku);

    if (!sku) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: 'sku es requerido'
      });
    }

    const existentes = await sequelize.query(
      `
      SELECT id
      FROM sku_etiquetas
      WHERE TRIM(sku::text) = TRIM(:sku::text)
        AND nombre = 'Muchos stickers'
      ORDER BY id DESC
      LIMIT 1
      `,
      {
        replacements: { sku },
        type: QueryTypes.SELECT,
        transaction
      }
    );

    let rows;

    if (existentes.length > 0) {
      rows = await sequelize.query(
        `
        UPDATE sku_etiquetas
        SET
          color = '#dc2626',
          nota = NULL,
          activo = true,
          "actualizadoPorId" = :usuarioId,
          "updatedAt" = NOW()
        WHERE id = :id
        RETURNING
          id,
          sku,
          nombre,
          color,
          nota,
          activo,
          "createdAt",
          "updatedAt"
        `,
        {
          replacements: {
            id: existentes[0].id,
            usuarioId: req.user?.id || null
          },
          type: QueryTypes.SELECT,
          transaction
        }
      );
    } else {
      rows = await sequelize.query(
        `
        INSERT INTO sku_etiquetas (
          sku,
          nombre,
          color,
          nota,
          activo,
          "creadoPorId",
          "actualizadoPorId",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          :sku,
          'Muchos stickers',
          '#dc2626',
          NULL,
          true,
          :usuarioId,
          :usuarioId,
          NOW(),
          NOW()
        )
        RETURNING
          id,
          sku,
          nombre,
          color,
          nota,
          activo,
          "createdAt",
          "updatedAt"
        `,
        {
          replacements: {
            sku,
            usuarioId: req.user?.id || null
          },
          type: QueryTypes.SELECT,
          transaction
        }
      );
    }

    await transaction.commit();

    return res.json({
      ok: true,
      data: rows[0],
      message: 'Etiqueta guardada correctamente'
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }

    console.error('❌ Error en upsertEtiqueta:', {
      message: error.message,
      parent: error.parent?.message,
      original: error.original?.message,
      stack: error.stack
    });

    next(error);
  }
}

async function deleteEtiqueta(req, res, next) {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({
        ok: false,
        message: 'id inválido'
      });
    }

    await sequelize.query(
      `
      UPDATE sku_etiquetas
      SET activo = false,
          "actualizadoPorId" = :usuarioId,
          "updatedAt" = NOW()
      WHERE id = :id
      `,
      {
        replacements: {
          id,
          usuarioId: req.user?.id || null
        },
        type: QueryTypes.UPDATE
      }
    );

    return res.json({
      ok: true,
      message: 'Etiqueta desactivada correctamente'
    });
  } catch (error) {
    console.error('❌ Error en deleteEtiqueta:', {
      message: error.message,
      parent: error.parent?.message,
      original: error.original?.message
    });
    next(error);
  }
}

module.exports = {
  getEtiquetas,
  getEtiquetaPorSku,
  upsertEtiqueta,
  deleteEtiqueta
};
