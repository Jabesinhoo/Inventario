const { sequelize, Usuario, Grupo, UsuarioGrupo } = require('../models');
const { QueryTypes } = require('sequelize');

// Obtener todos los grupos de un usuario
async function getGruposDeUsuario(req, res, next) {
  try {
    const { usuarioId } = req.params;
    
    const grupos = await sequelize.query(`
      SELECT 
        g.id,
        g.nombre,
        g.color,
        g."inventarioId",
        i.nombre as inventario_nombre,
        ug.esLider,
        ug.fechaAsignacion
      FROM usuario_grupo ug
      JOIN grupos g ON g.id = ug."grupoId"
      JOIN inventarios i ON i.id = g."inventarioId"
      WHERE ug."usuarioId" = :usuarioId
      ORDER BY ug.fechaAsignacion DESC
    `, {
      replacements: { usuarioId },
      type: QueryTypes.SELECT
    });
    
    res.json({
      ok: true,
      data: grupos
    });
  } catch (error) {
    next(error);
  }
}

// Obtener miembros de un grupo
async function getMiembrosDelGrupo(req, res, next) {
  try {
    const { grupoId } = req.params;
    
    const miembros = await sequelize.query(`
      SELECT 
        u.id, 
        u.nombre, 
        u.email, 
        u."rolId",
        r.nombre as rol,
        ug.esLider,
        ug.fechaAsignacion
      FROM usuario_grupo ug
      JOIN usuarios u ON u.id = ug."usuarioId"
      LEFT JOIN roles r ON r.id = u."rolId"
      WHERE ug."grupoId" = :grupoId
      ORDER BY ug.esLider DESC, u.nombre
    `, {
      replacements: { grupoId },
      type: QueryTypes.SELECT
    });
    
    res.json({
      ok: true,
      data: miembros
    });
  } catch (error) {
    next(error);
  }
}

// Asignar usuario a grupo
async function asignarUsuarioAGrupo(req, res, next) {
  try {
    const { usuarioId, grupoId, esLider = false } = req.body;
    
    const usuario = await Usuario.findByPk(usuarioId);
    if (!usuario) {
      return res.status(404).json({
        ok: false,
        message: 'Usuario no encontrado'
      });
    }
    
    const grupo = await Grupo.findByPk(grupoId);
    if (!grupo) {
      return res.status(404).json({
        ok: false,
        message: 'Grupo no encontrado'
      });
    }
    
    // Verificar si ya es miembro de este grupo
    const yaEsMiembro = await UsuarioGrupo.findOne({
      where: { usuarioId, grupoId }
    });
    
    if (yaEsMiembro) {
      return res.status(400).json({
        ok: false,
        message: 'El usuario ya pertenece a este grupo'
      });
    }
    
    // Verificar si ya es miembro de otro grupo en el MISMO inventario
    const mismoInventario = await sequelize.query(`
      SELECT ug.*
      FROM usuario_grupo ug
      JOIN grupos g ON g.id = ug."grupoId"
      WHERE ug."usuarioId" = :usuarioId
        AND g."inventarioId" = :inventarioId
    `, {
      replacements: { usuarioId, inventarioId: grupo.inventarioId },
      type: QueryTypes.SELECT
    });
    
    if (mismoInventario.length > 0) {
      return res.status(400).json({
        ok: false,
        message: `El usuario ya pertenece a otro grupo en este inventario. No puede estar en dos grupos del mismo inventario.`
      });
    }
    
    // Si es líder, verificar que no haya otro líder en este grupo
    if (esLider) {
      const otroLider = await UsuarioGrupo.findOne({
        where: { grupoId, esLider: true }
      });
      
      if (otroLider) {
        return res.status(400).json({
          ok: false,
          message: 'Este grupo ya tiene un líder'
        });
      }
      
      // Actualizar liderId en el grupo
      await grupo.update({ liderId: usuarioId });
    }
    
    // Crear la relación
    await UsuarioGrupo.create({
      usuarioId,
      grupoId,
      esLider,
      fechaAsignacion: new Date()
    });
    
    res.json({
      ok: true,
      message: 'Usuario asignado al grupo correctamente'
    });
  } catch (error) {
    console.error('[ASIGNAR USUARIO] Error:', error);
    next(error);
  }
}

// Remover usuario de un grupo
async function removerUsuarioDeGrupo(req, res, next) {
  try {
    const { usuarioId, grupoId } = req.body;
    
    const relacion = await UsuarioGrupo.findOne({
      where: { usuarioId, grupoId }
    });
    
    if (!relacion) {
      return res.status(404).json({
        ok: false,
        message: 'El usuario no pertenece a este grupo'
      });
    }
    
    // Si era líder, limpiar liderId del grupo
    if (relacion.esLider) {
      await Grupo.update({ liderId: null }, { where: { id: grupoId } });
    }
    
    await relacion.destroy();
    
    res.json({
      ok: true,
      message: 'Usuario removido del grupo correctamente'
    });
  } catch (error) {
    next(error);
  }
}

// Usuarios disponibles para un grupo (que no están en este inventario)
async function getUsuariosDisponiblesParaGrupo(req, res, next) {
  try {
    const { grupoId } = req.params;
    
    const grupo = await Grupo.findByPk(grupoId);
    if (!grupo) {
      return res.status(404).json({
        ok: false,
        message: 'Grupo no encontrado'
      });
    }
    
    const disponibles = await sequelize.query(`
      SELECT 
        u.id, 
        u.nombre, 
        u.email, 
        u."rolId", 
        r.nombre as rol
      FROM usuarios u
      LEFT JOIN roles r ON r.id = u."rolId"
      WHERE u.activo = true
        AND u.id NOT IN (
          SELECT ug."usuarioId"
          FROM usuario_grupo ug
          JOIN grupos g ON g.id = ug."grupoId"
          WHERE g."inventarioId" = :inventarioId
        )
      ORDER BY u.nombre
    `, {
      replacements: { inventarioId: grupo.inventarioId },
      type: QueryTypes.SELECT
    });
    
    res.json({
      ok: true,
      data: disponibles
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getGruposDeUsuario,
  getMiembrosDelGrupo,
  asignarUsuarioAGrupo,
  removerUsuarioDeGrupo,
  getUsuariosDisponiblesParaGrupo
};