'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('discrepancias_conteo', 'rondaReconteoId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'rondas_conteo',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('discrepancias_conteo', 'rondaReconteoId');
  }
};