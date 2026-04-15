module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    'Zona',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      nombre: {
        type: DataTypes.STRING(120),
        allowNull: false,
        unique: true
      },
      codigo: {
        type: DataTypes.STRING(40),
        allowNull: false,
        unique: true
      },
      activa: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      }
    },
    {
      tableName: 'zonas',
      timestamps: true
    }
  );
};