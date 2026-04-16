module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    'AsignacionRonda',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      rondaId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      grupoId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      estado: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'asignada'
      }
    },
    {
      tableName: 'asignaciones_ronda',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['rondaId']
        }
      ]
    }
  );
};