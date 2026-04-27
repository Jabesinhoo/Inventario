const { Op } = require('sequelize');
const Joi = require('joi');
const {
  sequelize,
  Lectura,
  Inventario,
  Grupo,
  Zona,
  AsignacionConteo,
  RondaConteo,
  AsignacionRonda,
  DiscrepanciaConteo,
  ConteoInicialDetalle,
  Usuario
} = require('../models');

// ==================== SCHEMAS ====================

const scanSchema = Joi.object({
  inventarioId: Joi.number().integer().required(),
  conteoTipo: Joi.number().integer().min(1).required(),
  zonaId: Joi.number().integer().required(),
  grupoId: Joi.number().integer().required(),
  codigo: Joi.string().trim().required()
});

const scanRondaSchema = Joi.object({
  rondaId: Joi.number().integer().required(),
  grupoId: Joi.number().integer().required(),
  codigo: Joi.string().trim().required()
});

// ==================== HELPERS ====================

const CODIGOS_ZONA_BASE = new Set(['BOD', 'BP', 'EXH']);
const NOMBRES_ZONA_BASE = ['bodega principal', 'exhibicion', 'exhibición'];

function normalizarTexto(valor) {
  return String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function esZonaBase(infoZona) {
  const codigo = String(infoZona?.codigo || '').trim().toUpperCase();
  const nombre = normalizarTexto(infoZona?.nombre);

  if (CODIGOS_ZONA_BASE.has(codigo)) {
    return true;
  }

  return NOMBRES_ZONA_BASE.some((item) =>
    nombre.includes(normalizarTexto(item))
  );
}

async function findProductoLocal(inventarioId, zonaId, codigoLimpio, transaction) {
  const whereCodigo = {
    [Op.or]: [
      { codigoLeido: codigoLimpio },
      { sku: codigoLimpio }
    ]
  };

  const candidatos = await ConteoInicialDetalle.findAll({
    where: whereCodigo,
    transaction
  });

  if (!candidatos.length) return null;

  const tieneDescripcionReal = (item) => {
    const d = normalizarTexto(item.descripcionSnapshot);
    return d && d !== 'sin descripción' && d !== 'sin descripcion';
  };

  const score = (item) => {
    let puntos = 0;

    if (Number(item.inventarioId) === Number(inventarioId)) puntos += 100;
    if (Number(item.zonaId) === Number(zonaId)) puntos += 50;
    if (tieneDescripcionReal(item)) puntos += 25;
    if (normalizarTexto(item.codigoLeido) === normalizarTexto(codigoLimpio)) puntos += 10;

    return puntos;
  };

  candidatos.sort((a, b) => score(b) - score(a));

  return candidatos[0];
}

function validarCodigo(codigo) {
  const codigoLimpio = String(codigo || '').trim();

  if (codigoLimpio.length < 5 || codigoLimpio.length > 7) {
    return {
      ok: false,
      codigoLimpio,
      message: 'Código inválido. Debe tener entre 5 y 7 dígitos.'
    };
  }

  return {
    ok: true,
    codigoLimpio
  };
}

function obtenerCantidadEsperadaDetalle(detalle) {
  const cantidadTotal = Number(detalle?.cantidadTotal || 0);
  const cantidadBodega = Number(detalle?.cantidadBodega || 0);
  const cantidadExhibicion = Number(detalle?.cantidadExhibicion || 0);

  return cantidadTotal || cantidadBodega || cantidadExhibicion || 0;
}

async function obtenerAlertaZonaPorSku({ inventarioId, sku, zonaActualId, transaction }) {
  if (!inventarioId || !sku || !zonaActualId) return null;

  const detalles = await ConteoInicialDetalle.findAll({
    where: {
      inventarioId,
      sku
    },
    transaction
  });

  if (!detalles.length) {
    return null;
  }

  const acumuladoPorZona = new Map();

  for (const item of detalles) {
    const zonaId = Number(item.zonaId);
    const cantidad = obtenerCantidadEsperadaDetalle(item);

    if (!acumuladoPorZona.has(zonaId)) {
      acumuladoPorZona.set(zonaId, {
        zonaId,
        cantidadEsperada: 0
      });
    }

    acumuladoPorZona.get(zonaId).cantidadEsperada += cantidad;
  }

  const zonas = Array.from(acumuladoPorZona.values());

  if (!zonas.length) {
    return null;
  }

  const zonasInfo = await Zona.findAll({
    where: {
      id: {
        [Op.in]: zonas.map((z) => z.zonaId)
      }
    },
    attributes: ['id', 'nombre', 'codigo'],
    transaction
  });

  const zonaInfoMap = new Map(
    zonasInfo.map((z) => [
      Number(z.id),
      {
        id: z.id,
        nombre: z.nombre,
        codigo: z.codigo
      }
    ])
  );

  const zonasOperativas = zonas.filter((z) => {
    const info = zonaInfoMap.get(Number(z.zonaId));
    return !esZonaBase(info);
  });

  if (!zonasOperativas.length) {
    return null;
  }

  const zonaActual = zonasOperativas.find(
    (z) => Number(z.zonaId) === Number(zonaActualId)
  ) || {
    zonaId: Number(zonaActualId),
    cantidadEsperada: 0
  };

  const zonaTop = [...zonasOperativas].sort(
    (a, b) => Number(b.cantidadEsperada || 0) - Number(a.cantidadEsperada || 0)
  )[0];

  if (!zonaTop) {
    return null;
  }

  if (Number(zonaTop.zonaId) === Number(zonaActualId)) {
    return null;
  }

  if (Number(zonaTop.cantidadEsperada || 0) <= Number(zonaActual.cantidadEsperada || 0)) {
    return null;
  }

  const zonaActualInfo = zonaInfoMap.get(Number(zonaActualId)) || null;
  const zonaSugeridaInfo = zonaInfoMap.get(Number(zonaTop.zonaId)) || null;

  if (!zonaSugeridaInfo) {
    return null;
  }

  return {
    mostrar: true,
    zonaActual: {
      id: zonaActualInfo?.id || Number(zonaActualId),
      nombre: zonaActualInfo?.nombre || 'Zona actual',
      codigo: zonaActualInfo?.codigo || null,
      cantidadEsperada: Number(zonaActual.cantidadEsperada || 0)
    },
    zonaSugerida: {
      id: zonaSugeridaInfo.id,
      nombre: zonaSugeridaInfo.nombre,
      codigo: zonaSugeridaInfo.codigo,
      cantidadEsperada: Number(zonaTop.cantidadEsperada || 0)
    }
  };
}

// ==================== SCAN LEGACY (con conteoTipo) ====================

async function scanLectura(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    const { error, value } = scanSchema.validate(req.body);

    if (error) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const validacionCodigo = validarCodigo(value.codigo);
    if (!validacionCodigo.ok) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: validacionCodigo.message
      });
    }

    const { codigoLimpio } = validacionCodigo;

    if (!req.canViewAllGroups && Number(value.grupoId) !== Number(req.grupoId)) {
      await transaction.rollback();
      return res.status(403).json({
        ok: false,
        message: 'No puedes registrar lecturas en otro grupo'
      });
    }

    const [inventario, grupo, zona, asignacion] = await Promise.all([
      Inventario.findByPk(value.inventarioId, { transaction }),
      Grupo.findByPk(value.grupoId, { transaction }),
      Zona.findByPk(value.zonaId, { transaction }),
      AsignacionConteo.findOne({
        where: {
          inventarioId: value.inventarioId,
          conteoTipo: value.conteoTipo,
          grupoId: value.grupoId,
          zonaId: value.zonaId
        },
        transaction
      })
    ]);

    if (!inventario) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: 'Inventario no encontrado'
      });
    }

    if (!grupo) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: 'Grupo no encontrado'
      });
    }

    if (!zona) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: 'Zona no encontrada'
      });
    }

    if (!asignacion) {
      await transaction.rollback();
      return res.status(403).json({
        ok: false,
        message: 'Ese grupo no está asignado a esa zona para ese conteo'
      });
    }

    const productoLocal = await findProductoLocal(
      value.inventarioId,
      value.zonaId,
      codigoLimpio,
      transaction
    );

    if (!productoLocal) {
      const lectura = await Lectura.create(
        {
          inventarioId: value.inventarioId,
          conteoTipo: value.conteoTipo,
          rondaId: null,
          zonaId: value.zonaId,
          grupoId: value.grupoId,
          usuarioId: req.user.id,
          productoId: null,
          sku: null,
          codigoLeido: codigoLimpio,
          descripcionSnapshot: null,
          cantidad: 1,
          estado: 'no_reconocida'
        },
        { transaction }
      );

      await transaction.commit();

      return res.status(200).json({
        ok: true,
        warning: true,
        message: 'Código no reconocido, lectura guardada para revisión',
        data: {
          lecturaId: lectura.id,
          codigo: codigoLimpio,
          estado: lectura.estado
        }
      });
    }

    const skuFinal = productoLocal.sku || codigoLimpio;
    const descripcionFinal = productoLocal.descripcionSnapshot || 'Sin descripción';
    const productoIdFinal = productoLocal.productoId || null;

    const lectura = await Lectura.create(
      {
        inventarioId: value.inventarioId,
        conteoTipo: value.conteoTipo,
        rondaId: null,
        zonaId: value.zonaId,
        grupoId: value.grupoId,
        usuarioId: req.user.id,
        productoId: productoIdFinal,
        sku: skuFinal,
        codigoLeido: codigoLimpio,
        descripcionSnapshot: descripcionFinal,
        cantidad: 1,
        estado: 'valida'
      },
      { transaction }
    );

    const alertaZona = await obtenerAlertaZonaPorSku({
      inventarioId: value.inventarioId,
      sku: skuFinal,
      zonaActualId: value.zonaId,
      transaction
    });

    const acumuladoSku = await Lectura.sum('cantidad', {
      where: {
        inventarioId: value.inventarioId,
        conteoTipo: value.conteoTipo,
        zonaId: value.zonaId,
        grupoId: value.grupoId,
        sku: skuFinal,
        estado: 'valida'
      },
      transaction
    });

    await transaction.commit();

    return res.status(201).json({
      ok: true,
      warning: Boolean(alertaZona?.mostrar),
      message: alertaZona?.mostrar
        ? 'Lectura registrada con alerta de zona'
        : 'Lectura registrada correctamente',
      data: {
        lecturaId: lectura.id,
        producto: {
          id: productoIdFinal,
          sku: skuFinal,
          codigoBarra: productoLocal.codigoLeido || codigoLimpio,
          descripcion: descripcionFinal,
          source: 'postgres'
        },
        acumuladoSku: Number(acumuladoSku || 0),
        alertaZona: alertaZona || null
      }
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
}

// ==================== SCAN POR RONDA (NUEVO FLUJO) ====================

async function scanLecturaRonda(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    const { error, value } = scanRondaSchema.validate(req.body);

    if (error) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: error.details[0].message
      });
    }

    const validacionCodigo = validarCodigo(value.codigo);
    if (!validacionCodigo.ok) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: validacionCodigo.message
      });
    }

    const { codigoLimpio } = validacionCodigo;

    if (!req.canViewAllGroups && Number(value.grupoId) !== Number(req.grupoId)) {
      await transaction.rollback();
      return res.status(403).json({
        ok: false,
        message: 'No puedes registrar lecturas en otro grupo'
      });
    }

    const ronda = await RondaConteo.findByPk(value.rondaId, {
      include: [{ model: Zona, as: 'zona', attributes: ['id', 'nombre', 'codigo'] }],
      transaction
    });

    if (!ronda) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: 'Ronda no encontrada'
      });
    }

    if (ronda.estado === 'pausada') {
      await transaction.rollback();
      return res.status(403).json({
        ok: false,
        message: 'La ronda está pausada. Reanúdala para continuar escaneando.'
      });
    }

    if (ronda.estado === 'cerrada') {
      await transaction.rollback();
      return res.status(403).json({
        ok: false,
        message: 'La ronda ya está cerrada. No se pueden registrar más lecturas.'
      });
    }

    if (ronda.estado !== 'activa') {
      await transaction.rollback();
      return res.status(403).json({
        ok: false,
        message: 'La ronda debe estar activa para registrar lecturas.'
      });
    }

    const grupo = await Grupo.findByPk(value.grupoId, { transaction });

    if (!grupo) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: 'Grupo no encontrado'
      });
    }

    const asignacionRonda = await AsignacionRonda.findOne({
      where: {
        rondaId: ronda.id,
        grupoId: grupo.id
      },
      transaction
    });

    if (!asignacionRonda) {
      await transaction.rollback();
      return res.status(403).json({
        ok: false,
        message: 'Ese grupo no está asignado a esta ronda'
      });
    }

    const productoLocal = await findProductoLocal(
      ronda.inventarioId,
      ronda.zonaId,
      codigoLimpio,
      transaction
    );

    if (!productoLocal) {
      if (ronda.tipoRonda === 'reconteo') {
        await transaction.rollback();
        return res.status(400).json({
          ok: false,
          message: 'En una ronda de reconteo solo se permiten productos reconocidos y pendientes'
        });
      }

      const lectura = await Lectura.create(
        {
          inventarioId: ronda.inventarioId,
          conteoTipo: ronda.numeroRonda,
          rondaId: ronda.id,
          zonaId: ronda.zonaId,
          grupoId: grupo.id,
          usuarioId: req.user.id,
          productoId: null,
          sku: null,
          codigoLeido: codigoLimpio,
          descripcionSnapshot: null,
          cantidad: 1,
          estado: 'no_reconocida'
        },
        { transaction }
      );

      await transaction.commit();

      return res.status(200).json({
        ok: true,
        warning: true,
        message: 'Código no reconocido, lectura guardada para revisión',
        data: {
          lecturaId: lectura.id,
          codigo: codigoLimpio,
          estado: lectura.estado
        }
      });
    }

    const skuFinal = productoLocal.sku || codigoLimpio;
    const descripcionFinal = productoLocal.descripcionSnapshot || 'Sin descripción';
    const productoIdFinal = productoLocal.productoId || null;

    if (ronda.tipoRonda === 'reconteo') {
      const pendiente = await DiscrepanciaConteo.findOne({
        where: {
          inventarioId: ronda.inventarioId,
          zonaId: ronda.zonaId,
          sku: skuFinal,
          proximaRondaNumero: ronda.numeroRonda,
          estado: {
            [Op.in]: ['pendiente_reconteo', 'reconteo_en_proceso']
          }
        },
        transaction
      });

      if (!pendiente) {
        await transaction.rollback();
        return res.status(403).json({
          ok: false,
          message: 'Ese SKU no está pendiente para esta ronda de reconteo'
        });
      }

      if (pendiente.estado === 'pendiente_reconteo') {
        await pendiente.update({ estado: 'reconteo_en_proceso' }, { transaction });
      }
    }

    const lectura = await Lectura.create(
      {
        inventarioId: ronda.inventarioId,
        conteoTipo: ronda.numeroRonda,
        rondaId: ronda.id,
        zonaId: ronda.zonaId,
        grupoId: grupo.id,
        usuarioId: req.user.id,
        productoId: productoIdFinal,
        sku: skuFinal,
        codigoLeido: codigoLimpio,
        descripcionSnapshot: descripcionFinal,
        cantidad: 1,
        estado: 'valida'
      },
      { transaction }
    );

    const alertaZona = await obtenerAlertaZonaPorSku({
      inventarioId: ronda.inventarioId,
      sku: skuFinal,
      zonaActualId: ronda.zonaId,
      transaction
    });

    const acumuladoSku = await Lectura.sum('cantidad', {
      where: {
        rondaId: ronda.id,
        sku: skuFinal,
        estado: 'valida'
      },
      transaction
    });

    await ronda.update({ updatedAt: new Date() }, { transaction });

    await transaction.commit();

    return res.status(201).json({
      ok: true,
      warning: Boolean(alertaZona?.mostrar),
      message: alertaZona?.mostrar
        ? 'Lectura registrada con alerta de zona'
        : 'Lectura registrada correctamente',
      data: {
        lecturaId: lectura.id,
        ronda: {
          id: ronda.id,
          numeroRonda: ronda.numeroRonda,
          tipoRonda: ronda.tipoRonda,
          estado: ronda.estado
        },
        producto: {
          id: productoIdFinal,
          sku: skuFinal,
          codigoBarra: productoLocal.codigoLeido || codigoLimpio,
          descripcion: descripcionFinal,
          source: 'postgres'
        },
        acumuladoSku: Number(acumuladoSku || 0),
        alertaZona: alertaZona || null
      }
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
}

// ==================== ANULAR LECTURA ====================

async function anularLectura(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    const lectura = await Lectura.findByPk(req.params.id, { transaction });

    if (!lectura) {
      await transaction.rollback();
      return res.status(404).json({
        ok: false,
        message: 'Lectura no encontrada'
      });
    }

    if (!req.canViewAllGroups && Number(lectura.grupoId) !== Number(req.grupoId)) {
      await transaction.rollback();
      return res.status(403).json({
        ok: false,
        message: 'No puedes anular una lectura de otro grupo'
      });
    }

    if (lectura.estado === 'anulada') {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: 'Esta lectura ya estaba anulada'
      });
    }

    await lectura.update({ estado: 'anulada' }, { transaction });

    await transaction.commit();

    res.json({
      ok: true,
      message: 'Lectura anulada correctamente',
      data: {
        lecturaId: lectura.id,
        sku: lectura.sku,
        codigoLeido: lectura.codigoLeido
      }
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
}

async function getResumenLecturas(req, res, next) {
  try {
    const { inventarioId, conteoTipo, zonaId, grupoId, rondaId } = req.query;

    const where = {
      estado: 'valida'
    };

    if (inventarioId) where.inventarioId = inventarioId;
    if (conteoTipo) where.conteoTipo = conteoTipo;
    if (zonaId) where.zonaId = zonaId;
    if (rondaId) where.rondaId = rondaId;

    if (!req.canViewAllGroups && req.grupoId) {
      where.grupoId = req.grupoId;
    } else if (grupoId && req.canViewAllGroups) {
      where.grupoId = grupoId;
    }

    const resumen = await Lectura.findAll({
      where,
      attributes: [
        'sku',
        [sequelize.fn('MAX', sequelize.col('descripcionSnapshot')), 'descripcionSnapshot'],
        [sequelize.fn('SUM', sequelize.col('cantidad')), 'cantidadTotal']
      ],
      group: ['sku'],
      order: [[sequelize.literal('"cantidadTotal"'), 'DESC']]
    });

    res.json({
      ok: true,
      data: resumen
    });
  } catch (error) {
    next(error);
  }
}

// ==================== HISTORIAL DE LECTURAS ====================

async function getHistorialLecturas(req, res, next) {
  try {
    const { inventarioId, conteoTipo, zonaId, grupoId, rondaId, limit = 200 } = req.query;

    const where = {};

    if (inventarioId) where.inventarioId = inventarioId;
    if (conteoTipo) where.conteoTipo = conteoTipo;
    if (zonaId) where.zonaId = zonaId;
    if (rondaId) where.rondaId = rondaId;

    if (!req.canViewAllGroups && req.grupoId) {
      where.grupoId = req.grupoId;
    } else if (grupoId && req.canViewAllGroups) {
      where.grupoId = grupoId;
    }

    const lecturas = await Lectura.findAll({
      where,
      order: [['fechaHora', 'DESC']],
      limit: parseInt(limit, 10),
      include: [
        { model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] },
        { model: Zona, as: 'zona', attributes: ['id', 'nombre'] }
      ]
    });

    res.json({
      ok: true,
      data: lecturas
    });
  } catch (error) {
    next(error);
  }
}

// ==================== ESTADÍSTICAS POR GRUPO/RONDA ====================

async function getEstadisticasGrupo(req, res, next) {
  try {
    const { rondaId, grupoId } = req.query;

    if (!rondaId || !grupoId) {
      return res.status(400).json({
        ok: false,
        message: 'rondaId y grupoId son requeridos'
      });
    }

    if (!req.canViewAllGroups && Number(grupoId) !== Number(req.grupoId)) {
      return res.status(403).json({
        ok: false,
        message: 'No puedes ver estadísticas de otro grupo'
      });
    }

    const lecturas = await Lectura.findAll({
      where: {
        rondaId,
        grupoId,
        estado: 'valida'
      }
    });

    const totalEscaneos = lecturas.reduce((sum, l) => sum + Number(l.cantidad || 0), 0);
    const productosUnicos = new Set(lecturas.map((l) => l.sku).filter(Boolean)).size;

    const primeraLectura = await Lectura.findOne({
      where: { rondaId, grupoId, estado: 'valida' },
      order: [['fechaHora', 'ASC']]
    });

    const ultimaLectura = await Lectura.findOne({
      where: { rondaId, grupoId, estado: 'valida' },
      order: [['fechaHora', 'DESC']]
    });

    let tiempoTotal = null;
    if (primeraLectura && ultimaLectura) {
      tiempoTotal = Math.round((ultimaLectura.fechaHora - primeraLectura.fechaHora) / 1000);
    }

    res.json({
      ok: true,
      data: {
        totalEscaneos,
        productosUnicos,
        tiempoSegundos: tiempoTotal,
        tiempoFormateado: tiempoTotal
          ? `${Math.floor(tiempoTotal / 60)}m ${tiempoTotal % 60}s`
          : null,
        primeraLectura: primeraLectura?.fechaHora || null,
        ultimaLectura: ultimaLectura?.fechaHora || null
      }
    });
  } catch (error) {
    next(error);
  }
}

// ==================== EXPORTACIÓN DE RESULTADOS POR GRUPO ====================

async function exportarResultadosGrupo(req, res, next) {
  try {
    const { rondaId, grupoId } = req.query;

    if (!rondaId || !grupoId) {
      return res.status(400).json({
        ok: false,
        message: 'rondaId y grupoId son requeridos'
      });
    }

    if (!req.canViewAllGroups && Number(grupoId) !== Number(req.grupoId)) {
      return res.status(403).json({
        ok: false,
        message: 'No puedes exportar resultados de otro grupo'
      });
    }

    const resumen = await Lectura.findAll({
      where: {
        rondaId,
        grupoId,
        estado: 'valida'
      },
      attributes: [
        'sku',
        'descripcionSnapshot',
        [sequelize.fn('SUM', sequelize.col('cantidad')), 'cantidadTotal']
      ],
      group: ['sku', 'descripcionSnapshot'],
      order: [[sequelize.literal('"cantidadTotal"'), 'DESC']]
    });

    const grupoInfo = await Grupo.findByPk(grupoId);
    const rondaInfo = await RondaConteo.findByPk(rondaId, {
      include: [{ model: Zona, as: 'zona' }]
    });

    res.json({
      ok: true,
      data: {
        grupo: {
          id: grupoInfo?.id,
          nombre: grupoInfo?.nombre
        },
        ronda: {
          id: rondaInfo?.id,
          numeroRonda: rondaInfo?.numeroRonda,
          tipoRonda: rondaInfo?.tipoRonda,
          zona: rondaInfo?.zona?.nombre || null
        },
        resultados: resumen.map((item) => ({
          sku: item.sku,
          descripcion: item.descripcionSnapshot,
          cantidadTotal: parseInt(item.dataValues.cantidadTotal, 10)
        })),
        totalProductos: resumen.length,
        totalUnidades: resumen.reduce(
          (sum, item) => sum + parseInt(item.dataValues.cantidadTotal, 10),
          0
        )
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  scanLectura,
  scanLecturaRonda,
  anularLectura,
  getResumenLecturas,
  getHistorialLecturas,
  getEstadisticasGrupo,
  exportarResultadosGrupo
};