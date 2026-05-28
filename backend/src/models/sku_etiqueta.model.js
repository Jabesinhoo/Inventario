module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    'SkuEtiqueta',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      sku: {
        type: DataTypes.STRING(80),
        allowNull: false
      },
      nombre: {
        type: DataTypes.STRING(100),
        allowNull: false,
        defaultValue: 'Etiqueta'
      },
      color: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: '#f59e0b'
      },
      nota: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      activo: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      creadoPorId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      actualizadoPorId: {
        type: DataTypes.INTEGER,
        allowNull: true
      }
    },
    {
      tableName: 'sku_etiquetas',
      timestamps: true
    }
  );
};