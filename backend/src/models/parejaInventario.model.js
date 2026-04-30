module.exports = (sequelize, DataTypes) => {
  const ParejaInventario = sequelize.define(
    'ParejaInventario',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      inventarioBaseId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'inventarios',
          key: 'id'
        }
      },
      inventarioComparadoId: {
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
      estado: {
        type: DataTypes.ENUM('pendiente', 'en_reconteo', 'completada', 'cancelada'),
        defaultValue: 'pendiente',
        allowNull: false
      },
      fechaComparacion: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      },
      fechaCompletada: {
        type: DataTypes.DATE,
        allowNull: true
      },
      observaciones: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      rondasReconteoGeneradas: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      }
    },
    {
      tableName: 'parejas_inventarios',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['inventarioBaseId', 'inventarioComparadoId', 'zonaId'],
          name: 'unique_pareja_inventario_zona'
        },
        {
          fields: ['estado']
        },
        {
          fields: ['inventarioBaseId']
        },
        {
          fields: ['inventarioComparadoId']
        }
      ]
    }
  );

  // Asociaciones
  ParejaInventario.associate = (models) => {
    ParejaInventario.belongsTo(models.Inventario, { 
      as: 'inventarioBase', 
      foreignKey: 'inventarioBaseId' 
    });
    ParejaInventario.belongsTo(models.Inventario, { 
      as: 'inventarioComparado', 
      foreignKey: 'inventarioComparadoId' 
    });
    ParejaInventario.belongsTo(models.Zona, { 
      as: 'zona', 
      foreignKey: 'zonaId' 
    });
  };

  return ParejaInventario;
};