const { QueryTypes } = require('sequelize');
const {
  sequelize,
  AsignacionConteo,
  Grupo,
  Zona,
  RondaConteo,
  DiscrepanciaConteo
} = require('../models');

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function buildError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function getZonaIdByGrupo(inventarioId, grupoId, transaction = null) {
  const asignacion = await AsignacionConteo.findOne({
    where: {
      inventarioId: Number(inventarioId),
      grupoId: Number(grupoId)
    },
    order: [['conteoTipo', 'DESC'], ['id', 'DESC']],
    transaction
  });

  if (!asignacion) {
    throw buildError('El grupo seleccionado no tiene zona asignada en ese inventario');
  }

  return Number(asignacion.zonaId);
}

async function getGrupoInfo(grupoId, transaction = null) {
  if (!grupoId) return null;

  return Grupo.findByPk(Number(grupoId), {
    attributes: ['id', 'nombre', 'inventarioId'],
    transaction
  });
}

async function getLatestGroupForInventarioZona(inventarioId, zonaId, transaction = null) {
  const asignacion = await AsignacionConteo.findOne({
    where: {
      inventarioId: Number(inventarioId),
      zonaId: Number(zonaId)
    },
    order: [['conteoTipo', 'DESC'], ['id', 'DESC']],
    transaction
  });

  if (!asignacion) return null;

  return Grupo.findByPk(Number(asignacion.grupoId), {
    attributes: ['id', 'nombre', 'inventarioId'],
    transaction
  });
}

async function resolveComparisonScope({
  inventarioBaseId,
  inventarioComparadoId,
  grupoBaseIdParam,
  grupoComparadoIdParam,
  zonaIdParam = null,
  transaction = null
}) {
  const baseId = Number(inventarioBaseId);
  const comparadoId = Number(inventarioComparadoId);

  if (!baseId || !comparadoId) {
    throw buildError('inventarioBaseId e inventarioComparadoId son requeridos');
  }

  if (baseId === comparadoId) {
    throw buildError('El inventario base y el inventario comparado deben ser distintos');
  }

  let grupoBaseId = parseOptionalNumber(grupoBaseIdParam);
  let grupoComparadoId = parseOptionalNumber(grupoComparadoIdParam);
  let zonaId = parseOptionalNumber(zonaIdParam);

  if (!grupoBaseId && !grupoComparadoId && !zonaId) {
    throw buildError('Debes indicar una zona o seleccionar los grupos base y comparado');
  }

  if (grupoBaseId) {
    const zonaBase = await getZonaIdByGrupo(baseId, grupoBaseId, transaction);
    if (zonaId && Number(zonaId) !== Number(zonaBase)) {
      throw buildError('La zona indicada no coincide con la zona del grupo base');
    }
    zonaId = zonaBase;
  }

  if (grupoComparadoId) {
    const zonaComparada = await getZonaIdByGrupo(comparadoId, grupoComparadoId, transaction);
    if (zonaId && Number(zonaId) !== Number(zonaComparada)) {
      throw buildError('El grupo base y el grupo comparado no pertenecen a la misma zona');
    }
    zonaId = zonaComparada;
  }

  if (!zonaId) {
    throw buildError('No se pudo resolver la zona para la comparación');
  }

  const zona = await Zona.findByPk(Number(zonaId), {
    attributes: ['id', 'nombre', 'codigo'],
    transaction
  });

  if (!zona) {
    throw buildError('La zona indicada no existe', 404);
  }

  let grupoBase = await getGrupoInfo(grupoBaseId, transaction);
  let grupoComparado = await getGrupoInfo(grupoComparadoId, transaction);

  if (!grupoBase) {
    grupoBase = await getLatestGroupForInventarioZona(baseId, zonaId, transaction);
    grupoBaseId = grupoBase?.id || null;
  }

  if (!grupoComparado) {
    grupoComparado = await getLatestGroupForInventarioZona(comparadoId, zonaId, transaction);
    grupoComparadoId = grupoComparado?.id || null;
  }

  return {
    inventarioBaseId: baseId,
    inventarioComparadoId: comparadoId,
    zonaId: Number(zonaId),
    zona,
    grupoBaseId,
    grupoComparadoId,
    grupoBase,
    grupoComparado
  };
}

async function getInventarioSnapshot({ inventarioId, zonaId, transaction = null }) {
  const initialRows = await sequelize.query(
    `
    SELECT
      cid.sku,
      MAX(cid."descripcionSnapshot") AS descripcion,
      SUM(cid."cantidadTotal")::int AS cantidad
    FROM conteo_inicial_detalle cid
    WHERE cid."inventarioId" = :inventarioId
      AND cid."zonaId" = :zonaId
    GROUP BY cid.sku
    ORDER BY cid.sku ASC
    `,
    {
      replacements: {
        inventarioId: Number(inventarioId),
        zonaId: Number(zonaId)
      },
      type: QueryTypes.SELECT,
      transaction
    }
  );

  if (initialRows.length > 0) {
    return {
      source: 'conteo_inicial',
      rows: initialRows.map((row) => ({
        sku: row.sku,
        descripcion: row.descripcion || null,
        cantidad: Number(row.cantidad || 0)
      }))
    };
  }

  const lecturaRows = await sequelize.query(
    `
    SELECT
      l.sku,
      MAX(l."descripcionSnapshot") AS descripcion,
      SUM(l.cantidad)::int AS cantidad
    FROM lecturas l
    WHERE l."inventarioId" = :inventarioId
      AND l."zonaId" = :zonaId
      AND l.estado = 'valida'
    GROUP BY l.sku
    ORDER BY l.sku ASC
    `,
    {
      replacements: {
        inventarioId: Number(inventarioId),
        zonaId: Number(zonaId)
      },
      type: QueryTypes.SELECT,
      transaction
    }
  );

  return {
    source: 'lecturas',
    rows: lecturaRows.map((row) => ({
      sku: row.sku,
      descripcion: row.descripcion || null,
      cantidad: Number(row.cantidad || 0)
    }))
  };
}

function compareSnapshots(baseRows, comparedRows, zonaId, zonaNombre) {
  const baseMap = new Map(baseRows.map((row) => [row.sku, row]));
  const comparedMap = new Map(comparedRows.map((row) => [row.sku, row]));

  const skus = [...new Set([...baseMap.keys(), ...comparedMap.keys()])].sort((a, b) =>
    String(a).localeCompare(String(b))
  );

  return skus.map((sku) => {
    const base = baseMap.get(sku);
    const compared = comparedMap.get(sku);

    const cantidadBase = Number(base?.cantidad || 0);
    const cantidadComparada = Number(compared?.cantidad || 0);

    return {
      zonaId,
      zona: zonaNombre,
      sku,
      descripcion: base?.descripcion || compared?.descripcion || null,
      cantidadBase,
      cantidadComparada,
      diferencia: Math.abs(cantidadBase - cantidadComparada)
    };
  });
}

async function compareInventarios(req, res, next) {
  try {
    const scope = await resolveComparisonScope({
      inventarioBaseId: req.query.inventarioBaseId,
      inventarioComparadoId: req.query.inventarioComparadoId,
      grupoBaseIdParam: req.query.grupoBaseId,
      grupoComparadoIdParam: req.query.grupoComparadoId,
      zonaIdParam: req.query.zonaId
    });

    const [snapshotBase, snapshotComparado] = await Promise.all([
      getInventarioSnapshot({
        inventarioId: scope.inventarioBaseId,
        zonaId: scope.zonaId
      }),
      getInventarioSnapshot({
        inventarioId: scope.inventarioComparadoId,
        zonaId: scope.zonaId
      })
    ]);

    const comparacion = compareSnapshots(
      snapshotBase.rows,
      snapshotComparado.rows,
      scope.zonaId,
      scope.zona.nombre
    );

    const diferencias = comparacion.filter((row) => Number(row.diferencia) > 0);

    res.json({
      ok: true,
      data: {
        inventarioBaseId: scope.inventarioBaseId,
        inventarioComparadoId: scope.inventarioComparadoId,
        zona: scope.zona,
        grupoBase: scope.grupoBase,
        grupoComparado: scope.grupoComparado,
        fuenteBase: snapshotBase.source,
        fuenteComparada: snapshotComparado.source,
        comparacion,
        diferencias,
        resumen: {
          totalItemsComparados: comparacion.length,
          totalDiferencias: diferencias.length,
          totalDiferenciaUnidades: diferencias.reduce(
            (sum, row) => sum + Number(row.diferencia || 0),
            0
          )
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

async function generarRondaReconteoDesdeComparacion(req, res, next) {
  const transaction = await sequelize.transaction();

  try {
    const scope = await resolveComparisonScope({
      inventarioBaseId: req.body.inventarioBaseId,
      inventarioComparadoId: req.body.inventarioComparadoId,
      grupoBaseIdParam: req.body.grupoBaseId,
      grupoComparadoIdParam: req.body.grupoComparadoId,
      zonaIdParam: req.body.zonaId,
      transaction
    });

    const [snapshotBase, snapshotComparado] = await Promise.all([
      getInventarioSnapshot({
        inventarioId: scope.inventarioBaseId,
        zonaId: scope.zonaId,
        transaction
      }),
      getInventarioSnapshot({
        inventarioId: scope.inventarioComparadoId,
        zonaId: scope.zonaId,
        transaction
      })
    ]);

    const comparacion = compareSnapshots(
      snapshotBase.rows,
      snapshotComparado.rows,
      scope.zonaId,
      scope.zona.nombre
    );

    const diferencias = comparacion.filter((row) => Number(row.diferencia) > 0);

    if (diferencias.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        ok: false,
        message: 'No hay diferencias para generar reconteo'
      });
    }

    const ultimaRonda = await RondaConteo.findOne({
      where: {
        inventarioId: scope.inventarioComparadoId,
        zonaId: scope.zonaId
      },
      order: [['numeroRonda', 'DESC']],
      transaction
    });

    const siguienteNumero = Number(ultimaRonda?.numeroRonda || 0) + 1;

    const ronda = await RondaConteo.create(
      {
        inventarioId: scope.inventarioComparadoId,
        zonaId: scope.zonaId,
        numeroRonda: siguienteNumero,
        tipoRonda: 'reconteo',
        estado: 'borrador',
        generadaDesdeRondaId: ultimaRonda?.id || null,
        observaciones: `Reconteo generado por diferencias entre inventario ${scope.inventarioBaseId} e inventario ${scope.inventarioComparadoId}`,
        totalEscaneos: 0
      },
      { transaction }
    );

    for (const item of diferencias) {
      const existente = await DiscrepanciaConteo.findOne({
        where: {
          inventarioId: scope.inventarioComparadoId,
          zonaId: scope.zonaId,
          sku: item.sku
        },
        transaction
      });

      if (existente) {
        await existente.update(
          {
            descripcionSnapshot: item.descripcion || existente.descripcionSnapshot,
            cantidadBase: Number(item.cantidadBase || 0),
            cantidadUltima: Number(item.cantidadComparada || 0),
            diferencia: Number(item.diferencia || 0),
            ultimaRondaId: ronda.id,
            proximaRondaNumero: ronda.numeroRonda,
            estado: 'pendiente_reconteo',
            cantidadFinal: null,
            criterioCierre: null,
            cerradoEn: null
          },
          { transaction }
        );
      } else {
        await DiscrepanciaConteo.create(
          {
            inventarioId: scope.inventarioComparadoId,
            zonaId: scope.zonaId,
            productoId: null,
            sku: item.sku,
            descripcionSnapshot: item.descripcion || null,
            rondaBaseId: ronda.id,
            ultimaRondaId: ronda.id,
            cantidadBase: Number(item.cantidadBase || 0),
            cantidadUltima: Number(item.cantidadComparada || 0),
            diferencia: Number(item.diferencia || 0),
            estado: 'pendiente_reconteo',
            proximaRondaNumero: ronda.numeroRonda,
            cantidadFinal: null,
            criterioCierre: null,
            cerradoEn: null
          },
          { transaction }
        );
      }
    }

    await transaction.commit();

    res.status(201).json({
      ok: true,
      message: 'Ronda de reconteo generada correctamente',
      data: {
        ronda,
        zona: scope.zona,
        grupoBase: scope.grupoBase,
        grupoComparado: scope.grupoComparado,
        totalDiscrepancias: diferencias.length
      }
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
}

async function updateDiscrepanciaManual(req, res, next) {
  try {
    const inventarioId = Number(req.body.inventarioId);
    const zonaId = Number(req.body.zonaId);
    const sku = req.body.sku ? String(req.body.sku).trim() : '';
    const cantidadFinal = Number(req.body.cantidadFinal);
    const observacion = req.body.observacion
      ? String(req.body.observacion).trim()
      : 'ajuste_manual_supervisor';

    if (!inventarioId || !zonaId || !sku || Number.isNaN(cantidadFinal)) {
      return res.status(400).json({
        ok: false,
        message: 'inventarioId, zonaId, sku y cantidadFinal son requeridos'
      });
    }

    const discrepancia = await DiscrepanciaConteo.findOne({
      where: {
        inventarioId,
        zonaId,
        sku
      },
      order: [['id', 'DESC']]
    });

    if (!discrepancia) {
      return res.status(404).json({
        ok: false,
        message: 'No se encontró una discrepancia para ese inventario, zona y SKU'
      });
    }

    await discrepancia.update({
      cantidadFinal,
      cantidadUltima: cantidadFinal,
      diferencia: 0,
      estado: 'cerrada',
      criterioCierre: observacion,
      cerradoEn: new Date()
    });

    res.json({
      ok: true,
      message: 'Discrepancia ajustada manualmente',
      data: discrepancia
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  compareInventarios,
  generarRondaReconteoDesdeComparacion,
  updateDiscrepanciaManual
};