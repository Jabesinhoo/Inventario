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
const Producto = require('./producto.model')(sequelize, DataTypes);
const AsignacionConteo = require('./asignacionConteo.model')(sequelize, DataTypes);
const Lectura = require('./lectura.model')(sequelize, DataTypes);
const RondaConteo = require('./rondaConteo.model')(sequelize, DataTypes);
const AsignacionRonda = require('./asignacionRonda.model')(sequelize, DataTypes);
const DiscrepanciaConteo = require('./discrepanciaConteo.model')(sequelize, DataTypes);

Rol.hasMany(Usuario, { foreignKey: 'rolId' });
Usuario.belongsTo(Rol, { foreignKey: 'rolId', as: 'rol' });

Inventario.hasMany(Grupo, { foreignKey: 'inventarioId', as: 'grupos' });
Grupo.belongsTo(Inventario, { foreignKey: 'inventarioId', as: 'inventario' });

Inventario.hasMany(AsignacionConteo, { foreignKey: 'inventarioId', as: 'asignaciones' });
AsignacionConteo.belongsTo(Inventario, { foreignKey: 'inventarioId', as: 'inventario' });

Grupo.hasMany(AsignacionConteo, { foreignKey: 'grupoId', as: 'asignaciones' });
AsignacionConteo.belongsTo(Grupo, { foreignKey: 'grupoId', as: 'grupo' });

Zona.hasMany(AsignacionConteo, { foreignKey: 'zonaId', as: 'asignaciones' });
AsignacionConteo.belongsTo(Zona, { foreignKey: 'zonaId', as: 'zona' });

Producto.hasMany(Lectura, { foreignKey: 'productoId', as: 'lecturas' });
Lectura.belongsTo(Producto, { foreignKey: 'productoId', as: 'producto' });

Inventario.hasMany(Lectura, { foreignKey: 'inventarioId', as: 'lecturas' });
Lectura.belongsTo(Inventario, { foreignKey: 'inventarioId', as: 'inventario' });

Grupo.hasMany(Lectura, { foreignKey: 'grupoId', as: 'lecturas' });
Lectura.belongsTo(Grupo, { foreignKey: 'grupoId', as: 'grupo' });

Zona.hasMany(Lectura, { foreignKey: 'zonaId', as: 'lecturas' });
Lectura.belongsTo(Zona, { foreignKey: 'zonaId', as: 'zona' });

Usuario.hasMany(Lectura, { foreignKey: 'usuarioId', as: 'lecturas' });
Lectura.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });

Inventario.hasMany(ConteoInicialDetalle, {
  foreignKey: 'inventarioId',
  as: 'conteoInicial'
});
ConteoInicialDetalle.belongsTo(Inventario, {
  foreignKey: 'inventarioId',
  as: 'inventario'
});

Zona.hasMany(ConteoInicialDetalle, {
  foreignKey: 'zonaId',
  as: 'conteoInicial'
});
ConteoInicialDetalle.belongsTo(Zona, {
  foreignKey: 'zonaId',
  as: 'zona'
});

Producto.hasMany(ConteoInicialDetalle, {
  foreignKey: 'productoId',
  as: 'conteoInicial'
});
ConteoInicialDetalle.belongsTo(Producto, {
  foreignKey: 'productoId',
  as: 'producto'
});

Inventario.hasMany(RondaConteo, {
  foreignKey: 'inventarioId',
  as: 'rondas'
});
RondaConteo.belongsTo(Inventario, {
  foreignKey: 'inventarioId',
  as: 'inventario'
});

Zona.hasMany(RondaConteo, {
  foreignKey: 'zonaId',
  as: 'rondas'
});
RondaConteo.belongsTo(Zona, {
  foreignKey: 'zonaId',
  as: 'zona'
});

RondaConteo.belongsTo(RondaConteo, {
  foreignKey: 'generadaDesdeRondaId',
  as: 'rondaOrigen'
});
RondaConteo.hasMany(RondaConteo, {
  foreignKey: 'generadaDesdeRondaId',
  as: 'rondasDerivadas'
});

RondaConteo.hasOne(AsignacionRonda, {
  foreignKey: 'rondaId',
  as: 'asignacion'
});
AsignacionRonda.belongsTo(RondaConteo, {
  foreignKey: 'rondaId',
  as: 'ronda'
});

Grupo.hasMany(AsignacionRonda, {
  foreignKey: 'grupoId',
  as: 'asignacionesRonda'
});
AsignacionRonda.belongsTo(Grupo, {
  foreignKey: 'grupoId',
  as: 'grupo'
});

RondaConteo.hasMany(Lectura, {
  foreignKey: 'rondaId',
  as: 'lecturas'
});
Lectura.belongsTo(RondaConteo, {
  foreignKey: 'rondaId',
  as: 'ronda'
});

Inventario.hasMany(DiscrepanciaConteo, {
  foreignKey: 'inventarioId',
  as: 'discrepancias'
});
DiscrepanciaConteo.belongsTo(Inventario, {
  foreignKey: 'inventarioId',
  as: 'inventario'
});

Zona.hasMany(DiscrepanciaConteo, {
  foreignKey: 'zonaId',
  as: 'discrepancias'
});
DiscrepanciaConteo.belongsTo(Zona, {
  foreignKey: 'zonaId',
  as: 'zona'
});

Producto.hasMany(DiscrepanciaConteo, {
  foreignKey: 'productoId',
  as: 'discrepancias'
});
DiscrepanciaConteo.belongsTo(Producto, {
  foreignKey: 'productoId',
  as: 'producto'
});

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

module.exports = {
  sequelize,
  Op,
  ConteoInicialDetalle,
  Rol,
  Usuario,
  Zona,
  Inventario,
  Grupo,
  Producto,
  AsignacionConteo,
  Lectura,
  RondaConteo,
  AsignacionRonda,
  DiscrepanciaConteo
};