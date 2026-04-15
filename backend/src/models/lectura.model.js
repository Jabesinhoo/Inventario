module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    'Lectura',
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
      zonaId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      grupoId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      usuarioId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      productoId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      sku: {
        type: DataTypes.STRING(80),
        allowNull: true
      },
      codigoLeido: {
        type: DataTypes.STRING(120),
        allowNull: false
      },
      descripcionSnapshot: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      cantidad: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      estado: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'valida'
      },
      fechaHora: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    },
    {
      tableName: 'lecturas',
      timestamps: true,
      indexes: [
        { fields: ['inventarioId'] },
        { fields: ['conteoTipo'] },
        { fields: ['zonaId'] },
        { fields: ['grupoId'] },
        { fields: ['usuarioId'] },
        { fields: ['sku'] },
        { fields: ['codigoLeido'] }
      ]
    }
  );
};