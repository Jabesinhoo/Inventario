'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Eliminar restricción única existente
    await queryInterface.removeConstraint('parejas_inventarios', 'unique_pareja_inventario_zona');
    
    // Crear nuevas restricciones UNIQUE para inventarioBaseId y inventarioComparadoId individualmente
    await queryInterface.addConstraint('parejas_inventarios', {
      fields: ['inventarioBaseId'],
      type: 'unique',
      name: 'unique_inventario_base'
    });
    
    await queryInterface.addConstraint('parejas_inventarios', {
      fields: ['inventarioComparadoId'],
      type: 'unique',
      name: 'unique_inventario_comparado'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeConstraint('parejas_inventarios', 'unique_inventario_base');
    await queryInterface.removeConstraint('parejas_inventarios', 'unique_inventario_comparado');
    await queryInterface.addConstraint('parejas_inventarios', {
      fields: ['inventarioBaseId', 'inventarioComparadoId', 'zonaId'],
      type: 'unique',
      name: 'unique_pareja_inventario_zona'
    });
  }
};