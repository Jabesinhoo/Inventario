module.exports = (sequelize, DataTypes) => {
  return sequelize.define(
    'Rol',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      nombre: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
      }
    },
    {
      tableName: 'roles',
      timestamps: true
    }
  );
};