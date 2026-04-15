module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
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
    },
    {
      tableName: 'usuarios',
      timestamps: true
    }
  );
};