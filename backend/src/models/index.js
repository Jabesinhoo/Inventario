const { Sequelize, DataTypes, Op } = require('sequelize');
const config = require('../../config/config');
const ConteoInicialDetalle = require('./conteoInicialDetalle.model')(sequelize, DataTypes);

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

const Rol = require('./rol.model')(sequelize, DataTypes);
const Usuario = require('./usuario.model')(sequelize, DataTypes);
const Zona = require('./zona.model')(sequelize, DataTypes);
const Inventario = require('./inventario.model')(sequelize, DataTypes);
const Grupo = require('./grupo.model')(sequelize, DataTypes);
const Producto = require('./producto.model')(sequelize, DataTypes);
const AsignacionConteo = require('./asignacionConteo.model')(sequelize, DataTypes);
const Lectura = require('./lectura.model')(sequelize, DataTypes);

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

Inventario.hasMany(ConteoInicialDetalle, { foreignKey: 'inventarioId', as: 'conteoInicial' });
ConteoInicialDetalle.belongsTo(Inventario, { foreignKey: 'inventarioId', as: 'inventario' });

module.exports = {
  sequelize,
  Op,
  Rol,
  Usuario,
  Zona,
  Inventario,
  Grupo,
  Producto,
  AsignacionConteo,
  Lectura,
  ConteoInicialDetalle,
};