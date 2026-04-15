module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    'Inventario',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      nombre: {
        type: DataTypes.STRING(150),
        allowNull: false
      },
      fecha: {
        type: DataTypes.DATEONLY,
        allowNull: false
      },
      estado: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'borrador'
      },
      requiereConteo3: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      }
    },
    {
      tableName: 'inventarios',
      timestamps: true
    }
  );
};