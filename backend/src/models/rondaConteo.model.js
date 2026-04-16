module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    'RondaConteo',
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
      numeroRonda: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      tipoRonda: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'completa'
      },
      estado: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'borrador'
      },
      generadaDesdeRondaId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      observaciones: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    },
    {
      tableName: 'rondas_conteo',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['inventarioId', 'zonaId', 'numeroRonda']
        }
      ]
    }
  );
};