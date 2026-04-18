'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Añadir columna liderId
    await queryInterface.addColumn('grupos', 'liderId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'usuarios',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    // Añadir columna color (para diferenciar grupos visualmente)
    await queryInterface.addColumn('grupos', 'color', {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: '#3b82f6'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('grupos', 'liderId');
    await queryInterface.removeColumn('grupos', 'color');
  }
};