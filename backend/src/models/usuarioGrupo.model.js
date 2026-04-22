module.exports = (sequelize, DataTypes) => {
  const UsuarioGrupo = sequelize.define(
    'UsuarioGrupo',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      usuarioId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      grupoId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      esLider: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      fechaAsignacion: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    },
    {
      tableName: 'usuario_grupo',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['usuarioId', 'grupoId']
        }
      ]
    }
  );

  return UsuarioGrupo;
};