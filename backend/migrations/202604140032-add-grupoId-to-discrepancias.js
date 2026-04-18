'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Verificar si la columna ya existe
    const [results] = await queryInterface.sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'discrepancias_conteo' 
        AND column_name = 'grupoId'
    `);

    if (results.length === 0) {
      await queryInterface.addColumn('discrepancias_conteo', 'grupoId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'grupos',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });

      // Crear índice para mejorar rendimiento
      await queryInterface.addIndex('discrepancias_conteo', ['grupoId']);
    }
  },

  async down(queryInterface) {
    const [results] = await queryInterface.sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'discrepancias_conteo' 
        AND column_name = 'grupoId'
    `);

    if (results.length > 0) {
      await queryInterface.removeColumn('discrepancias_conteo', 'grupoId');
    }
  }
};