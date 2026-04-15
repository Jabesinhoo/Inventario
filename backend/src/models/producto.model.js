module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    'Producto',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      sku: {
        type: DataTypes.STRING(80),
        allowNull: false,
        unique: true
      },
      codigoBarra: {
        type: DataTypes.STRING(120),
        allowNull: false,
        unique: true
      },
      codigoQr: {
        type: DataTypes.STRING(120),
        allowNull: true,
        unique: true
      },
      descripcion: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      categoria: {
        type: DataTypes.STRING(120),
        allowNull: true
      },
      activo: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      }
    },
    {
      tableName: 'productos',
      timestamps: true
    }
  );
};