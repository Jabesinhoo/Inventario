const { Op, QueryTypes } = require('sequelize');
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
  Usuario,
  ParejaInventario
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

function buildWherePendienteReconteo(ronda, sku = null) {
  const and = [
    { inventarioId: ronda.inventarioId },
    { zonaId: ronda.zonaId },
    { diferencia: { [Op.ne]: 0 } },
    {
      [Op.or]: [
        { proximaRondaNumero: ronda.numeroRonda },
        { proximaRondaNumero: null }
      ]
    },
    {
      [Op.or]: [
        {
          estado: {
            [Op.in]: ['pendiente_reconteo', 'reconteo_en_proceso', 'pendiente']
          }
        },
        { estado: null }
      ]
    }
  ];

  if (sku) {
    and.push({ sku });
  }

  return {
    [Op.and]: and
  };
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

  const normalizar = (v) => String(v || '').trim().toLowerCase();
  const tieneDescripcionReal = (item) => {
    const d = normalizar(item.descripcionSnapshot);
    return d && d !== 'sin descripción' && d !== 'sin descripcion';
  };

  const score = (item) => {
    let puntos = 0;

    if (Number(item.inventarioId) === Number(inventarioId)) puntos += 100;
    if (Number(item.zonaId) === Number(zonaId)) puntos += 50;
    if (tieneDescripcionReal(item)) puntos += 25;
    if (normalizar(item.codigoLeido) === normalizar(codigoLimpio)) puntos += 10;

    return puntos;
  };

  candidatos.sort((a, b) => score(b) - score(a));

  return candidatos[0];
}

function validarCodigo(codigo) {
  const codigoLimpio = String(codigo || '').trim();

  if (codigoLimpio.length < 5 || codigoLimpio.length > 6) {
    return {
      ok: false,
      codigoLimpio,
      message: 'Código inválido. Debe tener entre 5 y 6 dígitos.'
    };
  }

  return {
    ok: true,
    codigoLimpio
  };
}

async function calcularTotalReconteo(rondaId, sku, transaction) {
  const total = await Lectura.sum('cantidad', {
    where: {
      rondaId,
      sku,
      estado: 'valida'
    },
    transaction
  });

  return Number(total || 0);
}


async function validarProductoEnOtraZona(inventarioId, sku, zonaIdActual, grupoIdActual, transaction) {
  // Esta es una implementación básica, ajústala según tu lógica
  const result = await sequelize.query(
    `
    SELECT 
      l."zonaId",
      z.nombre as "zonaNombre",
      z.codigo as "zonaCodigo",
      l."grupoId",
      g.nombre as "grupoNombre",
      COALESCE(SUM(l.cantidad), 0) as "cantidadTotalEnOtraZona"
    FROM lecturas l
    INNER JOIN zonas z ON z.id = l."zonaId"
    INNER JOIN grupos g ON g.id = l."grupoId"
    INNER JOIN rondas_conteo r ON r.id = l."rondaId"
    WHERE r."inventarioId" = :inventarioId
      AND l.sku = :sku
      AND l.estado = 'valida'
      AND l."zonaId" != :zonaIdActual
      AND l."grupoId" != :grupoIdActual
    GROUP BY l."zonaId", z.nombre, z.codigo, l."grupoId", g.nombre
    ORDER BY "cantidadTotalEnOtraZona" DESC
    LIMIT 1
    `,
    {
      replacements: { inventarioId, sku, zonaIdActual, grupoIdActual },
      type: QueryTypes.SELECT,
      transaction
    }
  );

  if (!result || result.length === 0) return null;

  const row = result[0];
  return {
    zonaId: row.zonaId,
    zonaNombre: row.zonaNombre,
    zonaCodigo: row.zonaCodigo,
    grupoId: row.grupoId,
    grupoNombre: row.grupoNombre,
    cantidadTotalEnOtraZona: Number(row.cantidadTotalEnOtraZona || 0)
  };
}


async function registrarWarningLog(data, transaction = null) {
  try {
    const options = {
      replacements: data,
      type: QueryTypes.INSERT
    };

    if (transaction) {
      options.transaction = transaction;
    }

    const result = await sequelize.query(
      `
      INSERT INTO warning_logs (
        tipo, ronda_id, sku,
        zona_actual_id, zona_actual_nombre,
        grupo_actual_id, grupo_actual_nombre, cantidad_actual,
        zona_otra_id, zona_otra_nombre,
        grupo_otro_id, grupo_otro_nombre, cantidad_otra_zona,
        usuario_id, usuario_nombre, creado_en
      ) VALUES (
        :tipo, :rondaId, :sku,
        :zonaActualId, :zonaActualNombre,
        :grupoActualId, :grupoActualNombre, :cantidadActual,
        :zonaOtraId, :zonaOtraNombre,
        :grupoOtroId, :grupoOtroNombre, :cantidadOtraZona,
        :usuarioId, :usuarioNombre, NOW()
      )
      RETURNING id
      `,
      options
    );

    console.log('✅ Warning log registrado:', { id: result[0], sku: data.sku });
    return result[0];
  } catch (error) {
    console.error('❌ Error registrando warning log:', error.message);
    return null;
  }
}

async function getInventarioBaseParaValidacion(inventarioId, transaction) {
  const inventario = await Inventario.findByPk(inventarioId, {
    attributes: ['id', 'inventarioBaseId'],
    transaction
  });

  if (!inventario) {
    return {
      ok: false,
      message: 'Inventario no encontrado'
    };
  }

  return {
    ok: true,
    inventarioBaseId: Number(inventario.inventarioBaseId || inventario.id)
  };
}


async function buscarProductoEnInventarioBase(inventarioBaseId, codigoLimpio, transaction) {
  return sequelize.query(
    `
    SELECT
      c.id,
      c."inventarioId",
      c."zonaId",
      c."productoId",
      c.sku,
      c."codigoLeido",
      c."descripcionSnapshot",
      c."cantidadTotal",
      c."cantidadBodega",
      c."cantidadExhibicion",
      z.nombre AS "zonaNombre",
      z.codigo AS "zonaCodigo"
    FROM conteo_inicial_detalle c
    LEFT JOIN zonas z
      ON z.id = c."zonaId"
    WHERE c."inventarioId" = :inventarioBaseId
      AND (
        c.sku = :codigoLimpio
        OR c."codigoLeido" = :codigoLimpio
      )
    ORDER BY c."cantidadTotal" DESC, c.id ASC
    `,
    {
      replacements: { inventarioBaseId, codigoLimpio },
      type: QueryTypes.SELECT,
      transaction
    }
  );
}

async function buscarProductosPermitidosEnInventarioBase({
  inventarioBaseId,
  codigoLimpio,
  transaction
}) {
  return sequelize.query(
    `
    WITH productos_base AS (
      -- Productos importados/sincronizados en conteo inicial
      SELECT
        c.sku,
        c."codigoLeido",
        c."descripcionSnapshot",
        c."zonaId",
        COALESCE(c."productoId", c.id) AS "productoId",
        COALESCE(c."cantidadTotal", 0)::int AS cantidad
      FROM conteo_inicial_detalle c
      WHERE c."inventarioId" = :inventarioBaseId
        AND (
          c.sku = :codigoLimpio
          OR c."codigoLeido" = :codigoLimpio
        )

      UNION ALL

      -- Productos registrados por escaneo en el inventario base
      SELECT
        l.sku,
        l."codigoLeido",
        MAX(NULLIF(l."descripcionSnapshot", 'Sin descripción')) AS "descripcionSnapshot",
        l."zonaId",
        MAX(l."productoId") AS "productoId",
        COALESCE(SUM(l.cantidad), 0)::int AS cantidad
      FROM lecturas l
      WHERE l."inventarioId" = :inventarioBaseId
        AND l.estado = 'valida'
        AND (
          l.sku = :codigoLimpio
          OR l."codigoLeido" = :codigoLimpio
        )
      GROUP BY l.sku, l."codigoLeido", l."zonaId"
    )
    SELECT
      COALESCE(pb.sku, pb."codigoLeido") AS sku,
      MAX(pb."codigoLeido") AS "codigoLeido",
      MAX(pb."descripcionSnapshot") AS "descripcionSnapshot",
      pb."zonaId",
      MAX(pb."productoId") AS "productoId",
      COALESCE(SUM(pb.cantidad), 0)::int AS "cantidadTotal",
      z.nombre AS "zonaNombre",
      z.codigo AS "zonaCodigo"
    FROM productos_base pb
    LEFT JOIN zonas z
      ON z.id = pb."zonaId"
    GROUP BY
      COALESCE(pb.sku, pb."codigoLeido"),
      pb."zonaId",
      z.nombre,
      z.codigo
    ORDER BY "cantidadTotal" DESC, pb."zonaId" ASC
    `,
    {
      replacements: { inventarioBaseId, codigoLimpio },
      type: QueryTypes.SELECT,
      transaction
    }
  );
}

async function validarProductoContraInventarioBase({
  ronda,
  codigoLimpio,
  transaction
}) {
  const inventario = await Inventario.findByPk(ronda.inventarioId, {
    attributes: ['id', 'inventarioBaseId'],
    transaction
  });

  if (!inventario) {
    return {
      ok: false,
      status: 404,
      code: 'INVENTARIO_NO_ENCONTRADO',
      message: 'Inventario no encontrado',
      data: {
        sku: codigoLimpio
      }
    };
  }

  const inventarioActualId = Number(inventario.id);
  const inventarioBaseId = inventario.inventarioBaseId
    ? Number(inventario.inventarioBaseId)
    : null;

  // CASO 1:
  // Si inventarioBaseId es NULL, este inventario ES la base.
  // No debe validar contra inventario anterior.
  // Debe dejar escanear.
  if (!inventarioBaseId) {
    const productoLocal = await findProductoLocal(
      inventarioActualId,
      ronda.zonaId,
      codigoLimpio,
      transaction
    );

    return {
      ok: true,
      inventarioBaseId: inventarioActualId,
      esInventarioBasePrimario: true,
      producto: {
        id: productoLocal?.id || null,
        productoId: productoLocal?.productoId || null,
        sku: productoLocal?.sku || codigoLimpio,
        codigoLeido: productoLocal?.codigoLeido || codigoLimpio,
        descripcionSnapshot:
          productoLocal?.descripcionSnapshot ||
          productoLocal?.descripcion ||
          `Producto ${codigoLimpio}`,
        zonaId: productoLocal?.zonaId || ronda.zonaId,
        cantidadTotal: Number(productoLocal?.cantidadTotal || 0),
        libre: !productoLocal
      }
    };
  }

  // CASO 2:
  // Este inventario NO es base. Debe validar contra su inventarioBaseId.
  // La base puede venir de conteo_inicial_detalle o de lecturas del inventario base.
  const productosBase = await buscarProductosPermitidosEnInventarioBase({
    inventarioBaseId,
    codigoLimpio,
    transaction
  });

  if (!productosBase.length) {
    return {
      ok: false,
      status: 409,
      code: 'PRODUCTO_NO_PERTENECE_INVENTARIO_BASE',
      message: `El código ${codigoLimpio} no existe en el inventario base asignado. No se registró la lectura.`,
      data: {
        sku: codigoLimpio,
        inventarioBaseId,
        inventarioActualId
      }
    };
  }

  const productoMismaZona = productosBase.find(
    (item) => Number(item.zonaId) === Number(ronda.zonaId)
  );

  const productoOtraZonaMayor = productosBase
    .filter((item) => Number(item.zonaId) !== Number(ronda.zonaId))
    .sort(
      (a, b) =>
        Number(b.cantidadTotal || 0) - Number(a.cantidadTotal || 0)
    )[0];

  // Si en la base el producto existe, pero no en esta zona, bloquear.
  if (!productoMismaZona && productoOtraZonaMayor) {
    return {
      ok: false,
      status: 409,
      code: 'PRODUCTO_EN_OTRA_ZONA',
      message: `El producto ${productoOtraZonaMayor.sku || codigoLimpio} pertenece a la zona "${productoOtraZonaMayor.zonaNombre || 'N/A'}" en el inventario base. No se registró la lectura en esta zona.`,
      data: {
        sku: productoOtraZonaMayor.sku || codigoLimpio,
        origen: 'inventario_base',
        inventarioBaseId,
        inventarioActualId,
        zona: {
          id: productoOtraZonaMayor.zonaId,
          nombre: productoOtraZonaMayor.zonaNombre || 'N/A',
          codigo: productoOtraZonaMayor.zonaCodigo || ''
        },
        grupo: {
          id: null,
          nombre: 'Zona del inventario base'
        },
        cantidadEnOtraZona: Number(productoOtraZonaMayor.cantidadTotal || 0)
      }
    };
  }

  // Si existe en esta zona, pero otra zona tiene más cantidad, bloquear.
  // Esta es tu regla: si el código aparece en dos zonas, mostrar modal de la zona con más cantidad.
  if (
    productoMismaZona &&
    productoOtraZonaMayor &&
    Number(productoOtraZonaMayor.cantidadTotal || 0) >
    Number(productoMismaZona.cantidadTotal || 0)
  ) {
    return {
      ok: false,
      status: 409,
      code: 'PRODUCTO_EN_OTRA_ZONA',
      message: `El producto ${productoOtraZonaMayor.sku || codigoLimpio} tiene más cantidad en la zona "${productoOtraZonaMayor.zonaNombre || 'N/A'}" del inventario base. No se registró la lectura en esta zona.`,
      data: {
        sku: productoOtraZonaMayor.sku || codigoLimpio,
        origen: 'inventario_base',
        inventarioBaseId,
        inventarioActualId,
        zona: {
          id: productoOtraZonaMayor.zonaId,
          nombre: productoOtraZonaMayor.zonaNombre || 'N/A',
          codigo: productoOtraZonaMayor.zonaCodigo || ''
        },
        grupo: {
          id: null,
          nombre: 'Zona del inventario base'
        },
        cantidadEnOtraZona: Number(productoOtraZonaMayor.cantidadTotal || 0),
        cantidadEnZonaActual: Number(productoMismaZona.cantidadTotal || 0)
      }
    };
  }

  const productoPermitido = productoMismaZona || productosBase[0];

  return {
    ok: true,
    inventarioBaseId,
    esInventarioBasePrimario: false,
    producto: {
      id: null,
      productoId: productoPermitido.productoId || null,
      sku: productoPermitido.sku || codigoLimpio,
      codigoLeido: productoPermitido.codigoLeido || codigoLimpio,
      descripcionSnapshot:
        productoPermitido.descripcionSnapshot ||
        `Producto ${codigoLimpio}`,
      zonaId: productoPermitido.zonaId,
      cantidadTotal: Number(productoPermitido.cantidadTotal || 0)
    }
  };
}

async function responderBloqueoProducto({
  res,
  transaction,
  ronda,
  grupo,
  req,
  payload
}) {
  if (transaction && !transaction.finished) {
    await transaction.rollback();
  }

  // Registrar warning fuera de la transacción principal para que el rollback no lo borre.
  if (payload.code === 'PRODUCTO_EN_OTRA_ZONA') {
    await registrarWarningLog(
      {
        tipo: payload.data?.origen === 'inventario_base'
          ? 'producto_zona_inventario_base'
          : 'producto_en_otra_zona',
        rondaId: ronda.id,
        sku: payload.data?.sku,
        zonaActualId: ronda.zonaId,
        zonaActualNombre: ronda.zona?.nombre || 'N/A',
        grupoActualId: grupo?.id || null,
        grupoActualNombre: grupo?.nombre || 'N/A',
        cantidadActual: 0,
        zonaOtraId: payload.data?.zona?.id || null,
        zonaOtraNombre: payload.data?.zona?.nombre || 'N/A',
        grupoOtroId: payload.data?.grupo?.id || null,
        grupoOtroNombre: payload.data?.grupo?.nombre || 'N/A',
        cantidadOtraZona: Number(payload.data?.cantidadEnOtraZona || 0),
        usuarioId: req.user.id,
        usuarioNombre: req.user.nombre || 'N/A'
      },
      null
    );
  }

  return res.status(payload.status || 409).json({
    ok: false,
    code: payload.code,
    message: payload.message,
    data: payload.data
  });
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
      return res.status(404).json({ ok: false, message: 'Inventario no encontrado' });
    }

    if (!grupo) {
      await transaction.rollback();
      return res.status(404).json({ ok: false, message: 'Grupo no encontrado' });
    }

    if (!zona) {
      await transaction.rollback();
      return res.status(404).json({ ok: false, message: 'Zona no encontrada' });
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
        data: { lecturaId: lectura.id, codigo: codigoLimpio, estado: lectura.estado }
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
      message: 'Lectura registrada correctamente',
      data: {
        lecturaId: lectura.id,
        producto: {
          id: productoIdFinal,
          sku: skuFinal,
          codigoBarra: productoLocal.codigoLeido || codigoLimpio,
          descripcion: descripcionFinal,
          source: 'postgres'
        },
        acumuladoSku: Number(acumuladoSku || 0)
      }
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
}

// ==================== SCAN POR RONDA (PRINCIPAL) ====================

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
      return res.status(404).json({ ok: false, message: 'Ronda no encontrada' });
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
      return res.status(404).json({ ok: false, message: 'Grupo no encontrado' });
    }

    const asignacionRonda = await AsignacionRonda.findOne({
      where: { rondaId: ronda.id, grupoId: grupo.id },
      transaction
    });

    if (!asignacionRonda) {
      await transaction.rollback();
      return res.status(403).json({
        ok: false,
        message: 'Ese grupo no está asignado a esta ronda'
      });
    }

    const validacionBase = await validarProductoContraInventarioBase({
      ronda,
      codigoLimpio,
      transaction
    });

    if (!validacionBase || validacionBase.ok !== true) {
      const payload = validacionBase || {
        status: 500,
        code: 'VALIDACION_BASE_SIN_RESPUESTA',
        message: 'La validación del inventario base no devolvió respuesta.',
        data: {
          sku: codigoLimpio,
          inventarioActualId: ronda.inventarioId
        }
      };

      return responderBloqueoProductoEnOtraZona({
        res,
        transaction,
        ronda,
        grupo,
        req,
        payload
      });
    }

    const productoLocal = validacionBase.producto;

    const skuFinal = productoLocal.sku || codigoLimpio;
    const descripcionFinal = productoLocal.descripcionSnapshot || 'Sin descripción';
    const productoIdFinal = productoLocal.productoId || null;

    let pendiente = null;
    let esReconteo = false;
    let esEscaneoOpcional = false;

    if (ronda.tipoRonda === 'reconteo') {
      esReconteo = true;

      // Buscar discrepancia pendiente
      pendiente = await DiscrepanciaConteo.findOne({
        where: {
          inventarioId: ronda.inventarioId,
          zonaId: ronda.zonaId,
          sku: skuFinal,
          rondaReconteoId: ronda.id
        },
        transaction
      });

      if (!pendiente) {
        pendiente = await DiscrepanciaConteo.findOne({
          where: {
            inventarioId: ronda.inventarioId,
            zonaId: ronda.zonaId,
            sku: skuFinal,
            diferencia: { [Op.ne]: 0 },
            estado: { [Op.in]: ['pendiente_reconteo', 'pendiente', 'reconteo_en_proceso', null] }
          },
          transaction
        });

        if (pendiente) {
          await pendiente.update({ rondaReconteoId: ronda.id }, { transaction });
        }
      }

      // Si NO hay pendiente, es un escaneo opcional (no obligatorio)
      if (!pendiente) {
        esEscaneoOpcional = true;
        console.log(`⚠️ SKU ${skuFinal} no está en lista de pendientes, se permite escaneo opcional`);
      } else {
        // Actualizar estado del pendiente
        if (pendiente.estado === 'pendiente_reconteo' || pendiente.estado === 'pendiente') {
          await pendiente.update(
            {
              estado: 'reconteo_en_proceso',
              reconteoCount: (pendiente.reconteoCount || 0) + 1,
              proximaRondaNumero: pendiente.proximaRondaNumero || ronda.numeroRonda
            },
            { transaction }
          );
        }
      }
    }

    // VALIDACIÓN DE PRODUCTO EN OTRA ZONA (SOLO PARA RONDAS COMPLETAS)
    if (ronda.tipoRonda !== 'reconteo') {
      const otraZonaData = await validarProductoEnOtraZona(
        ronda.inventarioId,
        skuFinal,
        ronda.zonaId,
        grupo.id,
        transaction
      );

      if (otraZonaData && otraZonaData.cantidadTotalEnOtraZona > 0) {
        const cantidadActualEnEstaZona = await Lectura.sum('cantidad', {
          where: {
            rondaId: ronda.id,
            sku: skuFinal,
            grupoId: grupo.id,
            estado: 'valida'
          },
          transaction
        });

        const nuevaCantidad = (cantidadActualEnEstaZona || 0) + 1;
        const cantidadEnOtraZona = otraZonaData.cantidadTotalEnOtraZona;

        if (cantidadEnOtraZona > nuevaCantidad) {
          return responderBloqueoProducto({
            res,
            transaction,
            ronda,
            grupo,
            req,
            payload: {
              ok: false,
              status: 409,
              code: 'PRODUCTO_EN_OTRA_ZONA',
              message: `El producto ${skuFinal} ya fue escaneado en la zona "${otraZonaData.zonaNombre}" con ${cantidadEnOtraZona} unidades. No se permite escanear en esta zona.`,
              data: {
                sku: skuFinal,
                origen: 'lecturas_actuales',
                zona: {
                  id: otraZonaData.zonaId,
                  nombre: otraZonaData.zonaNombre,
                  codigo: otraZonaData.zonaCodigo
                },
                grupo: {
                  id: otraZonaData.grupoId,
                  nombre: otraZonaData.grupoNombre
                },
                cantidadEnOtraZona
              }
            }
          });
        }
      }
    }

    // Crear la lectura
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

    const cantidadTotalReconteo = await Lectura.sum('cantidad', {
      where: {
        rondaId: ronda.id,
        sku: skuFinal,
        estado: 'valida'
      },
      transaction
    });

    if (esReconteo && pendiente) {
      const nuevaDiferencia = Math.abs(
        Number(pendiente.cantidadBase || 0) - Number(cantidadTotalReconteo || 0)
      );

      await pendiente.update(
        {
          cantidadUltima: cantidadTotalReconteo,
          cantidadRecontada: cantidadTotalReconteo,
          diferencia: nuevaDiferencia,
          ultimaRondaId: ronda.id
        },
        { transaction }
      );

      if (nuevaDiferencia === 0 && pendiente.cantidadBase > 0) {
        await pendiente.update(
          {
            estado: 'resuelta',
            cantidadFinal: cantidadTotalReconteo,
            criterioCierre: `reconteo_completado_ronda_${ronda.numeroRonda}`,
            cerradoEn: new Date()
          },
          { transaction }
        );
      }
    }

    const totalEscaneosRonda = await Lectura.sum('cantidad', {
      where: {
        rondaId: ronda.id,
        estado: 'valida'
      },
      transaction
    });

    await ronda.update(
      {
        updatedAt: new Date(),
        totalEscaneos: Number(totalEscaneosRonda || 0)
      },
      { transaction }
    );

    await transaction.commit();

    const responseData = {
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
      acumuladoSku: cantidadTotalReconteo
    };

    if (esReconteo && pendiente) {
      responseData.discrepancia = {
        id: pendiente.id,
        cantidadBase: Number(pendiente.cantidadBase || 0),
        cantidadReconteo: cantidadTotalReconteo,
        diferencia: Math.abs(
          Number(pendiente.cantidadBase || 0) - Number(cantidadTotalReconteo || 0)
        ),
        reconteoCount: Number(pendiente.reconteoCount || 0),
        estado: pendiente.estado
      };
    }

    // Mensaje personalizado para escaneo opcional en reconteo
    let mensaje = 'Lectura registrada correctamente';
    if (esReconteo) {
      if (esEscaneoOpcional) {
        mensaje = ` Producto ${skuFinal} escaneado (opcional). No estaba en la lista de pendientes.`;
      } else {
        mensaje = ` Reconteo registrado. Total para SKU ${skuFinal}: ${cantidadTotalReconteo}`;
      }
    }

    return res.status(201).json({
      ok: true,
      message: mensaje,
      warning: esEscaneoOpcional,
      data: responseData
    });
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    console.error('❌ Error en scanLecturaRonda:', error);
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
      return res.status(404).json({ ok: false, message: 'Lectura no encontrada' });
    }

    if (lectura.estado === 'anulada') {
      await transaction.rollback();
      return res.status(400).json({ ok: false, message: 'Esta lectura ya estaba anulada' });
    }

    const rolUsuario = String(req.user?.rol || '').toLowerCase();
    const puedeGestionarTodo = Boolean(req.canViewAllGroups) || ['admin', 'supervisor'].includes(rolUsuario);

    let puedeAnular = puedeGestionarTodo;

    if (!puedeAnular && Number(lectura.usuarioId) === Number(req.user.id)) {
      puedeAnular = true;
    }

    if (!puedeAnular) {
      const gruposUsuario = await sequelize.query(
        `SELECT DISTINCT ug."grupoId" FROM usuario_grupo ug WHERE ug."usuarioId" = :usuarioId`,
        { replacements: { usuarioId: req.user.id }, type: QueryTypes.SELECT, transaction }
      );

      const grupoIds = gruposUsuario.map((row) => Number(row.grupoId)).filter(Boolean);

      if (grupoIds.includes(Number(lectura.grupoId))) {
        puedeAnular = true;
      }

      if (!puedeAnular && lectura.rondaId) {
        const rondaLectura = await RondaConteo.findByPk(lectura.rondaId, { transaction });

        if (rondaLectura?.tipoRonda === 'reconteo') {
          const accesoPorZona = await AsignacionConteo.findOne({
            where: {
              inventarioId: rondaLectura.inventarioId,
              zonaId: rondaLectura.zonaId,
              grupoId: { [Op.in]: grupoIds }
            },
            transaction
          });

          if (accesoPorZona) puedeAnular = true;
        }
      }
    }

    if (!puedeAnular) {
      await transaction.rollback();
      return res.status(403).json({ ok: false, message: 'No puedes anular esta lectura' });
    }

    const ronda = lectura.rondaId ? await RondaConteo.findByPk(lectura.rondaId, { transaction }) : null;

    await lectura.update({ estado: 'anulada' }, { transaction });

    if (ronda && ronda.tipoRonda === 'reconteo' && lectura.sku) {
      const nuevaCantidad = await calcularTotalReconteo(ronda.id, lectura.sku, transaction);

      const discrepancia = await DiscrepanciaConteo.findOne({
        where: {
          inventarioId: ronda.inventarioId,
          zonaId: ronda.zonaId,
          sku: lectura.sku,
          rondaReconteoId: ronda.id
        },
        transaction
      });

      if (discrepancia) {
        const nuevaDiferencia = Math.abs(
          Number(discrepancia.cantidadBase || 0) - Number(nuevaCantidad || 0)
        );

        let nuevoEstado = 'pendiente_reconteo';
        let cantidadFinal = null;
        let criterioCierre = null;
        let cerradoEn = null;

        if (Number(nuevaCantidad || 0) > 0) {
          nuevoEstado = nuevaDiferencia === 0 ? 'resuelta' : 'reconteo_en_proceso';
          if (nuevoEstado === 'resuelta') {
            cantidadFinal = Number(nuevaCantidad || 0);
            criterioCierre = `reconteo_completado_ronda_${ronda.numeroRonda}`;
            cerradoEn = new Date();
          }
        }

        await discrepancia.update(
          {
            cantidadUltima: Number(nuevaCantidad || 0),
            cantidadRecontada: Number(nuevaCantidad || 0),
            diferencia: nuevaDiferencia,
            estado: nuevoEstado,
            cantidadFinal,
            criterioCierre,
            cerradoEn,
            ultimaRondaId: ronda.id
          },
          { transaction }
        );
      }
    }

    if (ronda) {
      const totalEscaneosRonda = await Lectura.sum('cantidad', {
        where: { rondaId: ronda.id, estado: 'valida' },
        transaction
      });

      await ronda.update(
        { totalEscaneos: Number(totalEscaneosRonda || 0), updatedAt: new Date() },
        { transaction }
      );
    }

    await transaction.commit();

    return res.json({
      ok: true,
      message: 'Lectura anulada correctamente',
      data: { lecturaId: lectura.id, sku: lectura.sku, codigoLeido: lectura.codigoLeido, rondaId: lectura.rondaId }
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
}

// ==================== RESUMEN Y CONSULTAS ====================

async function getResumenLecturas(req, res, next) {
  try {
    const { inventarioId, conteoTipo, zonaId, grupoId, rondaId } = req.query;

    if (rondaId) {
      const where = { estado: 'valida', rondaId };
      if (inventarioId) where.inventarioId = inventarioId;
      if (conteoTipo) where.conteoTipo = conteoTipo;
      if (zonaId) where.zonaId = zonaId;
      if (!req.canViewAllGroups && req.grupoId) where.grupoId = req.grupoId;
      else if (grupoId && req.canViewAllGroups) where.grupoId = grupoId;

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

      return res.json({ ok: true, data: resumen });
    }

    const replacements = {};
    const conditions = [`l.estado = 'valida'`];

    if (inventarioId) {
      conditions.push(`l."inventarioId" = :inventarioId`);
      replacements.inventarioId = inventarioId;
    }
    if (conteoTipo) {
      conditions.push(`l."conteoTipo" = :conteoTipo`);
      replacements.conteoTipo = conteoTipo;
    }
    if (zonaId) {
      conditions.push(`l."zonaId" = :zonaId`);
      replacements.zonaId = zonaId;
    }
    if (!req.canViewAllGroups && req.grupoId) {
      conditions.push(`l."grupoId" = :grupoId`);
      replacements.grupoId = req.grupoId;
    } else if (grupoId && req.canViewAllGroups) {
      conditions.push(`l."grupoId" = :grupoId`);
      replacements.grupoId = grupoId;
    }

    conditions.push(`(l."rondaId" IS NULL OR r."tipoRonda" != 'reconteo')`);

    const whereClause = conditions.join(' AND ');

    // 🔥 MODIFICADO: Unir con conteo_inicial_detalle para obtener la descripción real
    const resumen = await sequelize.query(
      `
      SELECT 
        l.sku,
        COALESCE(c."descripcionSnapshot", MAX(l."descripcionSnapshot")) AS "descripcionSnapshot",
        COALESCE(SUM(l.cantidad), 0)::int AS "cantidadTotal"
      FROM lecturas l
      LEFT JOIN rondas_conteo r ON r.id = l."rondaId"
      LEFT JOIN conteo_inicial_detalle c ON c.sku = l.sku AND c."inventarioId" = l."inventarioId"
      WHERE ${whereClause}
        AND l.sku IS NOT NULL
      GROUP BY l.sku, c."descripcionSnapshot"
      ORDER BY "cantidadTotal" DESC
      `,
      { replacements, type: QueryTypes.SELECT }
    );

    return res.json({ ok: true, data: resumen });
  } catch (error) {
    next(error);
  }
}

async function eliminarLecturaPorSku(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    const { rondaId, sku } = req.params;

    if (!rondaId || !sku) {
      return res.status(400).json({
        ok: false,
        message: 'rondaId y sku son requeridos'
      });
    }

    // Verificar permisos
    if (!req.canViewAllGroups && req.grupoId) {
      const lectura = await Lectura.findOne({
        where: { rondaId, sku, estado: 'valida' },
        transaction
      });

      if (lectura && lectura.grupoId !== req.grupoId) {
        await transaction.rollback();
        return res.status(403).json({
          ok: false,
          message: 'No tienes permiso para eliminar lecturas de otro grupo'
        });
      }
    }

    // Eliminar todas las lecturas de ese SKU en la ronda
    const eliminadas = await Lectura.destroy({
      where: {
        rondaId,
        sku,
        estado: 'valida'
      },
      transaction
    });

    // Actualizar total de escaneos de la ronda
    const totalEscaneosRonda = await Lectura.sum('cantidad', {
      where: {
        rondaId,
        estado: 'valida'
      },
      transaction
    });

    await RondaConteo.update(
      { totalEscaneos: Number(totalEscaneosRonda || 0) },
      { where: { id: rondaId }, transaction }
    );

    // Si es reconteo, actualizar la discrepancia
    const ronda = await RondaConteo.findByPk(rondaId, { transaction });
    if (ronda && ronda.tipoRonda === 'reconteo') {
      const nuevaCantidad = await Lectura.sum('cantidad', {
        where: { rondaId, sku, estado: 'valida' },
        transaction
      });

      const discrepancia = await DiscrepanciaConteo.findOne({
        where: {
          inventarioId: ronda.inventarioId,
          sku,
          zonaId: ronda.zonaId || null,
          rondaReconteoId: ronda.id
        },
        transaction
      });

      if (discrepancia) {
        const nuevaDiferencia = Math.abs(
          Number(discrepancia.cantidadBase || 0) - Number(nuevaCantidad || 0)
        );

        let nuevoEstado = 'pendiente_reconteo';
        if (nuevaCantidad > 0) {
          nuevoEstado = nuevaDiferencia === 0 ? 'resuelta' : 'reconteo_en_proceso';
        }

        await discrepancia.update({
          cantidadRecontada: nuevaCantidad || 0,
          cantidadUltima: nuevaCantidad || 0,
          diferencia: nuevaDiferencia,
          estado: nuevoEstado,
          cantidadFinal: nuevaDiferencia === 0 ? nuevaCantidad : null,
          cerradoEn: nuevaDiferencia === 0 ? new Date() : null
        }, { transaction });
      }
    }

    await transaction.commit();

    res.json({
      ok: true,
      message: `Se eliminaron ${eliminadas} lectura(s) del producto ${sku}`,
      data: { eliminadas, sku }
    });

  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    console.error('❌ Error en eliminarLecturaPorSku:', error);
    next(error);
  }
}


async function getHistorialLecturas(req, res, next) {
  try {
    const { inventarioId, conteoTipo, zonaId, grupoId, rondaId, limit = 200 } = req.query;

    const where = {};
    if (inventarioId) where.inventarioId = inventarioId;
    if (conteoTipo) where.conteoTipo = conteoTipo;
    if (zonaId) where.zonaId = zonaId;
    if (rondaId) where.rondaId = rondaId;
    if (!req.canViewAllGroups && req.grupoId) where.grupoId = req.grupoId;
    else if (grupoId && req.canViewAllGroups) where.grupoId = grupoId;

    const lecturas = await Lectura.findAll({
      where,
      order: [['fechaHora', 'DESC']],
      limit: parseInt(limit, 10),
      include: [
        { model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] },
        { model: Zona, as: 'zona', attributes: ['id', 'nombre'] }
      ]
    });

    res.json({ ok: true, data: lecturas });
  } catch (error) {
    next(error);
  }
}

async function getEstadisticasGrupo(req, res, next) {
  try {
    const { rondaId, grupoId } = req.query;

    if (!rondaId || !grupoId) {
      return res.status(400).json({ ok: false, message: 'rondaId y grupoId son requeridos' });
    }

    if (!req.canViewAllGroups && Number(grupoId) !== Number(req.grupoId)) {
      return res.status(403).json({ ok: false, message: 'No puedes ver estadísticas de otro grupo' });
    }

    const lecturas = await Lectura.findAll({
      where: { rondaId, grupoId, estado: 'valida' }
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
        tiempoFormateado: tiempoTotal ? `${Math.floor(tiempoTotal / 60)}m ${tiempoTotal % 60}s` : null,
        primeraLectura: primeraLectura?.fechaHora || null,
        ultimaLectura: ultimaLectura?.fechaHora || null
      }
    });
  } catch (error) {
    next(error);
  }
}

async function exportarResultadosGrupo(req, res, next) {
  try {
    const { rondaId, grupoId } = req.query;

    if (!rondaId || !grupoId) {
      return res.status(400).json({ ok: false, message: 'rondaId y grupoId son requeridos' });
    }

    if (!req.canViewAllGroups && Number(grupoId) !== Number(req.grupoId)) {
      return res.status(403).json({ ok: false, message: 'No puedes exportar resultados de otro grupo' });
    }

    const resumen = await Lectura.findAll({
      where: { rondaId, grupoId, estado: 'valida' },
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
        grupo: { id: grupoInfo?.id, nombre: grupoInfo?.nombre },
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
        totalUnidades: resumen.reduce((sum, item) => sum + parseInt(item.dataValues.cantidadTotal, 10), 0)
      }
    });
  } catch (error) {
    next(error);
  }
}

async function agregarLecturaManual(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    const { rondaId, sku, cantidad, grupoId } = req.body;
    const usuarioId = req.user.id;

    console.log('🔥 agregarLecturaManual - Datos:', { rondaId, sku, cantidad, grupoId, usuarioId });

    // Validaciones básicas
    if (!rondaId || !sku || !cantidad || cantidad <= 0) {
      await transaction.rollback();
      return res.status(400).json({ ok: false, message: 'rondaId, sku y cantidad > 0 son requeridos' });
    }

    // Validar cantidad máxima (100,000 unidades)
    if (cantidad > 100000) {
      await transaction.rollback();
      return res.status(400).json({ ok: false, message: 'La cantidad total no puede superar las 100,000 unidades' });
    }

    // Verificar que la ronda existe y está activa
    const ronda = await RondaConteo.findByPk(rondaId, {
      include: [{ model: Zona, as: 'zona', attributes: ['id', 'nombre'] }],
      transaction
    });

    if (!ronda) {
      await transaction.rollback();
      return res.status(404).json({ ok: false, message: 'Ronda de conteo no encontrada' });
    }

    if (ronda.estado !== 'activa') {
      await transaction.rollback();
      return res.status(400).json({ ok: false, message: 'La ronda no está activa' });
    }

    // Obtener el grupo del usuario si no se proporcionó
    let grupoIdFinal = grupoId;
    if (!grupoIdFinal) {
      const grupoUsuario = await sequelize.query(
        `SELECT ug."grupoId" FROM usuario_grupo ug WHERE ug."usuarioId" = :usuarioId LIMIT 1`,
        { replacements: { usuarioId }, type: QueryTypes.SELECT, transaction }
      );
      if (grupoUsuario.length === 0) {
        await transaction.rollback();
        return res.status(403).json({ ok: false, message: 'No tienes un grupo asignado' });
      }
      grupoIdFinal = grupoUsuario[0].grupoId;
    }

    // Verificar asignación a la ronda
    const asignacionRonda = await AsignacionRonda.findOne({
      where: { rondaId: ronda.id, grupoId: grupoIdFinal },
      transaction
    });

    if (!asignacionRonda) {
      await transaction.rollback();
      return res.status(403).json({ ok: false, message: 'Tu grupo no está asignado a esta ronda' });
    }

    const grupo = await Grupo.findByPk(grupoIdFinal, { transaction });

    const validacionBase = await validarProductoContraInventarioBase({
      ronda,
      codigoLimpio: String(sku || '').trim(),
      transaction
    });

    if (!validacionBase.ok) {
      return responderBloqueoProducto({
        res,
        transaction,
        ronda,
        grupo,
        req,
        payload: validacionBase
      });
    }

    // BUSCAR PRODUCTO para obtener su descripción real
    let productoInfo = null;
    let lecturaPrevia = null;
    let descripcionSnapshot = 'Sin descripción';
    let fuenteDescripcion = 'manual';

    // 1. Usar producto validado contra inventario base.
    productoInfo = validacionBase.product;

    if (productoInfo && productoInfo.descripcionSnapshot) {
      descripcionSnapshot = productoInfo.descripcionSnapshot;
      fuenteDescripcion = 'inventario_base';
      console.log(`✅ SKU ${sku} encontrado en inventario base: ${descripcionSnapshot}`);
    } else {
      // 2. Buscar en lecturas previas del mismo inventario
      lecturaPrevia = await Lectura.findOne({
        where: {
          inventarioId: ronda.inventarioId,
          sku: sku,
          estado: 'valida'
        },
        attributes: ['descripcionSnapshot'],
        order: [['fechaHora', 'DESC']],
        transaction
      });

      if (lecturaPrevia && lecturaPrevia.descripcionSnapshot) {
        descripcionSnapshot = lecturaPrevia.descripcionSnapshot;
        fuenteDescripcion = 'lecturas_previas';
        console.log(`✅ SKU ${sku} encontrado en lecturas previas: ${descripcionSnapshot}`);
      } else {
        // 3. No existe en ningún lado, usar descripción genérica
        descripcionSnapshot = `Producto ${sku} (agregado manualmente)`;
        fuenteDescripcion = 'manual';
        console.log(`🆕 SKU ${sku} no encontrado, descripción genérica: ${descripcionSnapshot}`);
      }
    }

    // Validación de producto en otra zona también para entrada manual.
    if (ronda.tipoRonda !== 'reconteo') {
      const otraZonaData = await validarProductoEnOtraZona(
        ronda.inventarioId,
        validacionBase.product.sku || sku,
        ronda.zonaId,
        grupoIdFinal,
        transaction
      );

      if (otraZonaData && otraZonaData.cantidadTotalEnOtraZona > 0) {
        const cantidadActualEnEstaZona = await Lectura.sum('cantidad', {
          where: {
            rondaId: ronda.id,
            sku: validacionBase.product.sku || sku,
            grupoId: grupoIdFinal,
            estado: 'valida'
          },
          transaction
        });

        const nuevaCantidad = Number(cantidadActualEnEstaZona || 0) + Number(cantidad || 0);
        const cantidadEnOtraZona = Number(otraZonaData.cantidadTotalEnOtraZona || 0);

        if (cantidadEnOtraZona > nuevaCantidad) {
          return responderBloqueoProducto({
            res,
            transaction,
            ronda,
            grupo,
            req,
            payload: {
              ok: false,
              status: 409,
              code: 'PRODUCTO_EN_OTRA_ZONA',
              message: `El producto ${validacionBase.product.sku || sku} ya fue escaneado en la zona "${otraZonaData.zonaNombre}" con ${cantidadEnOtraZona} unidades. No se permite agregarlo manualmente en esta zona.`,
              data: {
                sku: validacionBase.product.sku || sku,
                origen: 'lecturas_actuales',
                zona: {
                  id: otraZonaData.zonaId,
                  nombre: otraZonaData.zonaNombre,
                  codigo: otraZonaData.zonaCodigo
                },
                grupo: {
                  id: otraZonaData.grupoId,
                  nombre: otraZonaData.grupoNombre
                },
                cantidadEnOtraZona
              }
            }
          });
        }
      }
    }

    // Crear la lectura
    const lectura = await Lectura.create({
      rondaId: ronda.id,
      inventarioId: ronda.inventarioId,
      conteoTipo: ronda.numeroRonda,
      usuarioId,
      grupoId: grupoIdFinal,
      zonaId: grupo?.zonaId || ronda.zonaId,
      sku: sku,
      cantidad: cantidad,
      estado: 'valida',
      esManual: true,
      codigoLeido: sku,
      descripcionSnapshot: descripcionSnapshot
    }, { transaction });

    console.log('✅ Lectura manual creada:', lectura.id);

    // Calcular total acumulado del SKU en esta ronda
    const totalAcumulado = await Lectura.sum('cantidad', {
      where: {
        rondaId: ronda.id,
        sku: sku,
        estado: 'valida'
      },
      transaction
    });

    // Si es ronda de reconteo, actualizar la discrepancia
    let discrepanciaActualizada = false;
    if (ronda.tipoRonda === 'reconteo') {
      let discrepancia = await DiscrepanciaConteo.findOne({
        where: {
          inventarioId: ronda.inventarioId,
          sku: sku,
          zonaId: ronda.zonaId || null
        },
        transaction
      });

      if (discrepancia) {
        if (!discrepancia.rondaReconteoId) {
          await discrepancia.update({ rondaReconteoId: ronda.id }, { transaction });
        }

        if (discrepancia.rondaReconteoId === ronda.id) {
          const nuevaCantidadRecontada = totalAcumulado;
          const diferenciaRestante = (discrepancia.cantidadBase || 0) - nuevaCantidadRecontada;

          let nuevoEstado = discrepancia.estado;
          let cantidadFinal = null;
          let criterioCierre = null;

          if (nuevaCantidadRecontada === (discrepancia.cantidadBase || 0)) {
            nuevoEstado = 'resuelta';
            cantidadFinal = nuevaCantidadRecontada;
            criterioCierre = `reconteo_completado_ronda_${ronda.numeroRonda}`;
          } else if (nuevaCantidadRecontada > (discrepancia.cantidadBase || 0)) {
            nuevoEstado = 'resuelta_con_exceso';
            cantidadFinal = nuevaCantidadRecontada;
            criterioCierre = `reconteo_exceso_ronda_${ronda.numeroRonda}`;
          } else if (nuevaCantidadRecontada > 0) {
            nuevoEstado = 'reconteo_en_proceso';
          }

          await discrepancia.update({
            cantidadRecontada: nuevaCantidadRecontada,
            cantidadUltima: nuevaCantidadRecontada,
            estado: nuevoEstado,
            reconteoCount: (discrepancia.reconteoCount || 0) + 1,
            diferencia: Math.abs(diferenciaRestante),
            cantidadFinal: cantidadFinal || discrepancia.cantidadFinal,
            criterioCierre: criterioCierre || discrepancia.criterioCierre,
            cerradoEn: (nuevoEstado === 'resuelta' || nuevoEstado === 'resuelta_con_exceso') ? new Date() : null
          }, { transaction });

          discrepanciaActualizada = true;
        }
      }
    }

    // Actualizar total de escaneos de la ronda
    const totalEscaneosRonda = await Lectura.sum('cantidad', {
      where: {
        rondaId: ronda.id,
        estado: 'valida'
      },
      transaction
    });

    await ronda.update({
      totalEscaneos: Number(totalEscaneosRonda || 0),
      updatedAt: new Date()
    }, { transaction });

    // Commit de la transacción
    await transaction.commit();

    // Contar pendientes restantes (después del commit)
    let totalPendientes = 0;
    if (ronda.tipoRonda === 'reconteo') {
      totalPendientes = await DiscrepanciaConteo.count({
        where: {
          inventarioId: ronda.inventarioId,
          zonaId: ronda.zonaId || null,
          rondaReconteoId: ronda.id,
          estado: { [Op.in]: ['pendiente_reconteo', 'reconteo_en_proceso'] }
        }
      });
    }

    // Preparar mensaje según la fuente de la descripción
    let mensaje = '';
    if (fuenteDescripcion === 'conteo_inicial') {
      mensaje = `✅ ${descripcionSnapshot} - Agregado correctamente. Total acumulado: ${totalAcumulado} unidades.`;
    } else if (fuenteDescripcion === 'lecturas_previas') {
      mensaje = `📋 ${descripcionSnapshot} - Producto agregado (existía en escaneos previos). Total: ${totalAcumulado} unidades.`;
    } else {
      mensaje = `🆕 Producto ${sku} agregado manualmente. Total acumulado: ${totalAcumulado} unidades.`;
    }

    return res.status(201).json({
      ok: true,
      message: mensaje,
      data: {
        lectura: {
          id: lectura.id,
          sku: sku,
          cantidad: cantidad,
          esManual: true
        },
        producto: {
          sku: sku,
          descripcion: descripcionSnapshot,
          fuente: fuenteDescripcion
        },
        acumuladoSku: totalAcumulado,
        totalPendientes: totalPendientes,
        esReconteo: ronda.tipoRonda === 'reconteo',
        discrepanciaActualizada: discrepanciaActualizada
      }
    });

  } catch (error) {
    // Solo hacer rollback si la transacción no ha sido finalizada
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    console.error('❌ Error en agregarLecturaManual:', error);
    next(error);
  }
}

async function editarCantidadProducto(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    const { rondaId, sku } = req.params;
    const { nuevaCantidad } = req.body;

    if (!rondaId || !sku) {
      return res.status(400).json({
        ok: false,
        message: 'rondaId y sku son requeridos'
      });
    }

    if (nuevaCantidad === undefined || nuevaCantidad < 0) {
      return res.status(400).json({
        ok: false,
        message: 'nuevaCantidad debe ser un número mayor o igual a 0'
      });
    }

    // Verificar permisos
    if (!req.canViewAllGroups && req.grupoId) {
      const lectura = await Lectura.findOne({
        where: { rondaId, sku, estado: 'valida' },
        transaction
      });

      if (lectura && lectura.grupoId !== req.grupoId) {
        await transaction.rollback();
        return res.status(403).json({
          ok: false,
          message: 'No tienes permiso para editar lecturas de otro grupo'
        });
      }
    }

    // Obtener la cantidad actual total del SKU
    const cantidadActual = await Lectura.sum('cantidad', {
      where: {
        rondaId,
        sku,
        estado: 'valida'
      },
      transaction
    });

    const diferencia = nuevaCantidad - (cantidadActual || 0);

    if (diferencia === 0) {
      await transaction.commit();
      return res.json({
        ok: true,
        message: 'La cantidad no ha cambiado',
        data: { sku, cantidadActual, nuevaCantidad }
      });
    }

    // Crear una nueva lectura con la diferencia (positiva o negativa)
    if (diferencia !== 0) {
      await Lectura.create({
        rondaId,
        inventarioId: (await RondaConteo.findByPk(rondaId, { transaction })).inventarioId,
        conteoTipo: (await RondaConteo.findByPk(rondaId, { transaction })).numeroRonda,
        zonaId: (await Lectura.findOne({ where: { rondaId, sku }, transaction }))?.zonaId || null,
        grupoId: (await Lectura.findOne({ where: { rondaId, sku }, transaction }))?.grupoId || null,
        usuarioId: req.user.id,
        sku,
        cantidad: diferencia,
        estado: 'valida',
        esManual: true,
        codigoLeido: sku,
        descripcionSnapshot: (await Lectura.findOne({ where: { rondaId, sku }, transaction }))?.descripcionSnapshot || 'Cantidad ajustada'
      }, { transaction });
    }

    // Actualizar total de escaneos de la ronda
    const totalEscaneosRonda = await Lectura.sum('cantidad', {
      where: {
        rondaId,
        estado: 'valida'
      },
      transaction
    });

    await RondaConteo.update(
      { totalEscaneos: Number(totalEscaneosRonda || 0) },
      { where: { id: rondaId }, transaction }
    );

    // Si es reconteo, actualizar la discrepancia
    const ronda = await RondaConteo.findByPk(rondaId, { transaction });
    if (ronda && ronda.tipoRonda === 'reconteo') {
      const nuevaCantidadTotal = await Lectura.sum('cantidad', {
        where: { rondaId, sku, estado: 'valida' },
        transaction
      });

      const discrepancia = await DiscrepanciaConteo.findOne({
        where: {
          inventarioId: ronda.inventarioId,
          sku,
          zonaId: ronda.zonaId || null,
          rondaReconteoId: ronda.id
        },
        transaction
      });

      if (discrepancia) {
        const nuevaDiferencia = Math.abs(
          Number(discrepancia.cantidadBase || 0) - Number(nuevaCantidadTotal || 0)
        );

        let nuevoEstado = 'pendiente_reconteo';
        if (nuevaCantidadTotal > 0) {
          nuevoEstado = nuevaDiferencia === 0 ? 'resuelta' : 'reconteo_en_proceso';
        }

        await discrepancia.update({
          cantidadRecontada: nuevaCantidadTotal || 0,
          cantidadUltima: nuevaCantidadTotal || 0,
          diferencia: nuevaDiferencia,
          estado: nuevoEstado,
          cantidadFinal: nuevaDiferencia === 0 ? nuevaCantidadTotal : null,
          cerradoEn: nuevaDiferencia === 0 ? new Date() : null
        }, { transaction });
      }
    }

    await transaction.commit();

    res.json({
      ok: true,
      message: `Cantidad del producto ${sku} actualizada de ${cantidadActual || 0} a ${nuevaCantidad}`,
      data: {
        sku,
        cantidadAnterior: cantidadActual || 0,
        cantidadNueva: nuevaCantidad,
        diferencia
      }
    });

  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    console.error('❌ Error en editarCantidadProducto:', error);
    next(error);
  }
}

console.log('📦 Exportando controlador de lecturas. Funciones:', {
  scanLectura: typeof scanLectura,
  scanLecturaRonda: typeof scanLecturaRonda,
  agregarLecturaManual: typeof agregarLecturaManual
});


module.exports = {
  scanLectura,
  scanLecturaRonda,
  anularLectura,
  getResumenLecturas,
  getHistorialLecturas,
  getEstadisticasGrupo,
  exportarResultadosGrupo,
  buildWherePendienteReconteo,
  agregarLecturaManual,
  eliminarLecturaPorSku,
  editarCantidadProducto
};