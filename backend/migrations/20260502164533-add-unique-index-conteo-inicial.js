'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Eliminar restricciones existentes si las hay
    try {
      await queryInterface.removeConstraint('conteo_inicial_detalle', 'conteo_inicial_detalle_sku_zonaId_inventarioId_unique');
    } catch (e) {}
    
    try {
      await queryInterface.removeConstraint('conteo_inicial_detalle', 'unique_conteo_inventario_zona_sku');
    } catch (e) {}
    
    // Crear índice único
    await queryInterface.addConstraint('conteo_inicial_detalle', {
      fields: ['inventarioId', 'zonaId', 'sku'],
      type: 'unique',
      name: 'unique_conteo_inventario_zona_sku'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeConstraint('conteo_inicial_detalle', 'unique_conteo_inventario_zona_sku');
  }
};