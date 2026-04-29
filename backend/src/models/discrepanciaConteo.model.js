module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    'DiscrepanciaConteo',
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
      descripcionSnapshot: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      rondaBaseId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      ultimaRondaId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      cantidadBase: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      cantidadUltima: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      diferencia: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      estado: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: 'pendiente_reconteo'
      },
      proximaRondaNumero: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      cantidadFinal: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      criterioCierre: {
        type: DataTypes.STRING(60),
        allowNull: true
      },
      cerradoEn: {
        type: DataTypes.DATE,
        allowNull: true
      },
      reconteoCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: true
      }
    },
    {
      tableName: 'discrepancias_conteo',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['inventarioId', 'zonaId', 'sku']
        },
        {
          fields: ['estado']
        },
        {
          fields: ['proximaRondaNumero']
        }
      ]
    }
  );
};