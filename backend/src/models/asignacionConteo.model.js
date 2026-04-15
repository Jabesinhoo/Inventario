module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    'AsignacionConteo',
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
      conteoTipo: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      grupoId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      zonaId: {
        type: DataTypes.INTEGER,
        allowNull: false
      }
    },
    {
      tableName: 'asignaciones_conteo',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['inventarioId', 'conteoTipo', 'grupoId', 'zonaId']
        },
        {
          unique: true,
          fields: ['inventarioId', 'conteoTipo', 'grupoId']
        },
        {
          unique: true,
          fields: ['inventarioId', 'conteoTipo', 'zonaId']
        }
      ]
    }
  );
};