module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    'ConteoInicialDetalle',
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
      zonaId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      productoId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      sku: {
        type: DataTypes.STRING(80),
        allowNull: false
      },
      codigoLeido: {
        type: DataTypes.STRING(120),
        allowNull: true
      },
      descripcionSnapshot: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      cantidadBodega: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      cantidadExhibicion: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      cantidadTotal: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      origenArchivo: {
        type: DataTypes.STRING(255),
        allowNull: true
      }
    },
    {
      tableName: 'conteo_inicial_detalle',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['inventarioId', 'zonaId', 'sku']
        }
      ]
    }
  );
};