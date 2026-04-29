const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const DiscrepanciaConteo = sequelize.define('DiscrepanciaConteo', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  inventarioId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'inventarios',
      key: 'id'
    }
  },
  zonaId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'zonas',
      key: 'id'
    }
  },
  productoId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  sku: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  descripcionSnapshot: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  rondaBaseId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  ultimaRondaId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  cantidadBase: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  cantidadUltima: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  diferencia: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  estado: {
    type: DataTypes.STRING(30),
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
    type: DataTypes.STRING(50),
    allowNull: true
  },
  cerradoEn: {
    type: DataTypes.DATE,
    allowNull: true
  },
  reconteoCount: {  // ← AGREGAR ESTE CAMPO
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: true
  },
  rondaReconteoId: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'discrepancias_conteo',
  timestamps: true,
  indexes: [
    {
      fields: ['inventarioId', 'zonaId', 'sku']
    },
    {
      fields: ['estado']
    }
  ]
});

module.exports = DiscrepanciaConteo;