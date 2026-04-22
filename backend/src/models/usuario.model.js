module.exports = (sequelize, DataTypes) => {
  const Usuario = sequelize.define(
    'Usuario',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      nombre: {
        type: DataTypes.STRING(120),
        allowNull: false
      },
      email: {
        type: DataTypes.STRING(120),
        allowNull: false,
        unique: true
      },
      passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      activo: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      rolId: {
        type: DataTypes.INTEGER,
        allowNull: false
      }
      // ✅ NO DEBE TENER grupoId AQUÍ
    },
    {
      tableName: 'usuarios',
      timestamps: true
    }
  );

  Usuario.associate = function(models) {
    Usuario.belongsTo(models.Rol, { foreignKey: 'rolId', as: 'rol' });
    Usuario.belongsToMany(models.Grupo, {
      through: 'usuario_grupo',
      foreignKey: 'usuarioId',
      otherKey: 'grupoId',
      as: 'grupos'
    });
  };

  return Usuario;
};