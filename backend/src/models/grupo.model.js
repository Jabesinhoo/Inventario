module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    'Grupo',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      inventarioId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      nombre: {
        type: DataTypes.STRING(120),
        allowNull: false
      },
      liderId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      color: {
        type: DataTypes.STRING(20),
        allowNull: true,
        defaultValue: '#3b82f6'
      },
      estado: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'activo'
      }
    },
    {
      tableName: 'grupos',
      timestamps: true
    }
  );
};