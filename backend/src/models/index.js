const { Sequelize, DataTypes, Op } = require('sequelize');
const config = require('../../config/config');

const sequelize = new Sequelize(
  config.db.database,
  config.db.username,
  config.db.password,
  {
    host: config.db.host,
    port: config.db.port,
    dialect: config.db.dialect,
    logging: config.db.logging
  }
);

const ConteoInicialDetalle = require('./conteoInicialDetalle.model')(sequelize, DataTypes);
const Rol = require('./rol.model')(sequelize, DataTypes);
const Usuario = require('./usuario.model')(sequelize, DataTypes);
const Zona = require('./zona.model')(sequelize, DataTypes);
const Inventario = require('./inventario.model')(sequelize, DataTypes);
const Grupo = require('./grupo.model')(sequelize, DataTypes);
const AsignacionConteo = require('./asignacionConteo.model')(sequelize, DataTypes);
const Lectura = require('./lectura.model')(sequelize, DataTypes);
const RondaConteo = require('./rondaConteo.model')(sequelize, DataTypes);
const AsignacionRonda = require('./asignacionRonda.model')(sequelize, DataTypes);
const DiscrepanciaConteo = require('./discrepanciaConteo.model')(sequelize, DataTypes);

// ==================== ASOCIACIONES ====================

// Rol -> Usuario
Rol.hasMany(Usuario, { foreignKey: 'rolId' });
Usuario.belongsTo(Rol, { foreignKey: 'rolId', as: 'rol' });

// Usuario <-> Grupo (Tabla intermedia)
Usuario.belongsToMany(Grupo, {
  through: 'usuario_grupo',
  foreignKey: 'usuarioId',
  otherKey: 'grupoId',
  as: 'grupos'
});

Grupo.belongsToMany(Usuario, {
  through: 'usuario_grupo',
  foreignKey: 'grupoId',
  otherKey: 'usuarioId',
  as: 'miembros'
});

// Grupo -> Usuario (líder del grupo)
Grupo.belongsTo(Usuario, { foreignKey: 'liderId', as: 'lider' });
Usuario.hasMany(Grupo, { foreignKey: 'liderId', as: 'gruposLiderados' });

// Inventario -> Grupo
Inventario.hasMany(Grupo, { foreignKey: 'inventarioId', as: 'grupos' });
Grupo.belongsTo(Inventario, { foreignKey: 'inventarioId', as: 'inventario' });

// Inventario -> AsignacionConteo
Inventario.hasMany(AsignacionConteo, { foreignKey: 'inventarioId', as: 'asignaciones' });
AsignacionConteo.belongsTo(Inventario, { foreignKey: 'inventarioId', as: 'inventario' });

// Grupo -> AsignacionConteo
Grupo.hasMany(AsignacionConteo, { foreignKey: 'grupoId', as: 'asignaciones' });
AsignacionConteo.belongsTo(Grupo, { foreignKey: 'grupoId', as: 'grupo' });

// Zona -> AsignacionConteo
Zona.hasMany(AsignacionConteo, { foreignKey: 'zonaId', as: 'asignaciones' });
AsignacionConteo.belongsTo(Zona, { foreignKey: 'zonaId', as: 'zona' });

// ==================== LECTURAS ====================

// Inventario -> Lectura
Inventario.hasMany(Lectura, { foreignKey: 'inventarioId', as: 'lecturas' });
Lectura.belongsTo(Inventario, { foreignKey: 'inventarioId', as: 'inventario' });

// Grupo -> Lectura
Grupo.hasMany(Lectura, { foreignKey: 'grupoId', as: 'lecturas' });
Lectura.belongsTo(Grupo, { foreignKey: 'grupoId', as: 'grupo' });

// Zona -> Lectura
Zona.hasMany(Lectura, { foreignKey: 'zonaId', as: 'lecturas' });
Lectura.belongsTo(Zona, { foreignKey: 'zonaId', as: 'zona' });

// Usuario -> Lectura
Usuario.hasMany(Lectura, { foreignKey: 'usuarioId', as: 'lecturas' });
Lectura.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });

// RondaConteo -> Lectura
RondaConteo.hasMany(Lectura, { foreignKey: 'rondaId', as: 'lecturas' });
Lectura.belongsTo(RondaConteo, { foreignKey: 'rondaId', as: 'ronda' });

// ==================== CONTEO INICIAL ====================

// Inventario -> ConteoInicialDetalle
Inventario.hasMany(ConteoInicialDetalle, {
  foreignKey: 'inventarioId',
  as: 'conteoInicial'
});
ConteoInicialDetalle.belongsTo(Inventario, {
  foreignKey: 'inventarioId',
  as: 'inventario'
});

// Zona -> ConteoInicialDetalle
Zona.hasMany(ConteoInicialDetalle, {
  foreignKey: 'zonaId',
  as: 'conteoInicial'
});
ConteoInicialDetalle.belongsTo(Zona, {
  foreignKey: 'zonaId',
  as: 'zona'
});

// ==================== RONDAS ====================

// Inventario -> RondaConteo
Inventario.hasMany(RondaConteo, {
  foreignKey: 'inventarioId',
  as: 'rondas'
});
RondaConteo.belongsTo(Inventario, {
  foreignKey: 'inventarioId',
  as: 'inventario'
});

// Zona -> RondaConteo
Zona.hasMany(RondaConteo, {
  foreignKey: 'zonaId',
  as: 'rondas'
});
RondaConteo.belongsTo(Zona, {
  foreignKey: 'zonaId',
  as: 'zona'
});

// RondaConteo auto-referencia
RondaConteo.belongsTo(RondaConteo, {
  foreignKey: 'generadaDesdeRondaId',
  as: 'rondaOrigen'
});
RondaConteo.hasMany(RondaConteo, {
  foreignKey: 'generadaDesdeRondaId',
  as: 'rondasDerivadas'
});

// RondaConteo -> AsignacionRonda
RondaConteo.hasOne(AsignacionRonda, {
  foreignKey: 'rondaId',
  as: 'asignacion'
});
AsignacionRonda.belongsTo(RondaConteo, {
  foreignKey: 'rondaId',
  as: 'ronda'
});

// Grupo -> AsignacionRonda
Grupo.hasMany(AsignacionRonda, {
  foreignKey: 'grupoId',
  as: 'asignacionesRonda'
});
AsignacionRonda.belongsTo(Grupo, {
  foreignKey: 'grupoId',
  as: 'grupo'
});

// ==================== DISCREPANCIAS ====================

// Inventario -> DiscrepanciaConteo
Inventario.hasMany(DiscrepanciaConteo, {
  foreignKey: 'inventarioId',
  as: 'discrepancias'
});
DiscrepanciaConteo.belongsTo(Inventario, {
  foreignKey: 'inventarioId',
  as: 'inventario'
});

// Zona -> DiscrepanciaConteo
Zona.hasMany(DiscrepanciaConteo, {
  foreignKey: 'zonaId',
  as: 'discrepancias'
});
DiscrepanciaConteo.belongsTo(Zona, {
  foreignKey: 'zonaId',
  as: 'zona'
});

// RondaConteo -> DiscrepanciaConteo
RondaConteo.hasMany(DiscrepanciaConteo, {
  foreignKey: 'rondaBaseId',
  as: 'discrepanciasBase'
});
DiscrepanciaConteo.belongsTo(RondaConteo, {
  foreignKey: 'rondaBaseId',
  as: 'rondaBase'
});

RondaConteo.hasMany(DiscrepanciaConteo, {
  foreignKey: 'ultimaRondaId',
  as: 'discrepanciasUltima'
});
DiscrepanciaConteo.belongsTo(RondaConteo, {
  foreignKey: 'ultimaRondaId',
  as: 'ultimaRonda'
});

// ==================== EXPORTS ====================

module.exports = {
  sequelize,
  Op,
  ConteoInicialDetalle,
  Rol,
  Usuario,
  Zona,
  Inventario,
  Grupo,
  AsignacionConteo,
  Lectura,
  RondaConteo,
  AsignacionRonda,
  DiscrepanciaConteo
};