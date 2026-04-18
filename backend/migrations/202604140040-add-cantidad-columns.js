'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Verificar si las columnas existen antes de agregarlas
    const tableInfo = await queryInterface.describeTable('conteo_inicial_detalle');
    
    // Agregar cantidadExhibicion si no existe
    if (!tableInfo.cantidadExhibicion) {
      await queryInterface.addColumn('conteo_inicial_detalle', 'cantidadExhibicion', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      });
      console.log('✅ Columna cantidadExhibicion agregada');
    } else {
      console.log('⏭️ Columna cantidadExhibicion ya existe');
    }
    
    // Agregar cantidadBodega si no existe
    if (!tableInfo.cantidadBodega) {
      await queryInterface.addColumn('conteo_inicial_detalle', 'cantidadBodega', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      });
      console.log('✅ Columna cantidadBodega agregada');
    } else {
      console.log('⏭️ Columna cantidadBodega ya existe');
    }
    
    // cantidadTotal ya existe, solo verificamos
    if (tableInfo.cantidadTotal) {
      console.log('✅ Columna cantidadTotal ya existe');
    } else if (tableInfo.cantidad) {
      // Renombrar columna antigua si existe
      await queryInterface.renameColumn('conteo_inicial_detalle', 'cantidad', 'cantidadTotal');
      console.log('✅ Columna cantidad renombrada a cantidadTotal');
    } else {
      await queryInterface.addColumn('conteo_inicial_detalle', 'cantidadTotal', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      });
      console.log('✅ Columna cantidadTotal agregada');
    }
  },

  async down(queryInterface) {
    const tableInfo = await queryInterface.describeTable('conteo_inicial_detalle');
    
    if (tableInfo.cantidadExhibicion) {
      await queryInterface.removeColumn('conteo_inicial_detalle', 'cantidadExhibicion');
    }
    if (tableInfo.cantidadBodega) {
      await queryInterface.removeColumn('conteo_inicial_detalle', 'cantidadBodega');
    }
    // No removemos cantidadTotal porque puede ser la original
  }
};