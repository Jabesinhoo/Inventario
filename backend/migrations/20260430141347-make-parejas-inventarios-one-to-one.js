'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableName = 'parejas_inventarios';
    
    // Verificar si las restricciones ya existen antes de crearlas
    const [results] = await queryInterface.sequelize.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = '${tableName}' 
      AND constraint_type = 'UNIQUE'
    `);
    
    const existingConstraints = results.map(r => r.constraint_name);
    
    // Solo crear unique_inventario_base si no existe
    if (!existingConstraints.includes('unique_inventario_base')) {
      await queryInterface.addConstraint(tableName, {
        fields: ['inventarioBaseId'],
        type: 'unique',
        name: 'unique_inventario_base'
      });
    }
    
    // Solo crear unique_inventario_comparado si no existe
    if (!existingConstraints.includes('unique_inventario_comparado')) {
      await queryInterface.addConstraint(tableName, {
        fields: ['inventarioComparadoId'],
        type: 'unique',
        name: 'unique_inventario_comparado'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableName = 'parejas_inventarios';
    
    try {
      await queryInterface.removeConstraint(tableName, 'unique_inventario_base');
    } catch (e) {}
    
    try {
      await queryInterface.removeConstraint(tableName, 'unique_inventario_comparado');
    } catch (e) {}
  }
};