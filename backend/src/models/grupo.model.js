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