'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('conteo_inicial_detalle');
    
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
    
    if (!tableInfo.cantidadTotal && !tableInfo.cantidad) {
      await queryInterface.addColumn('conteo_inicial_detalle', 'cantidadTotal', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      });
      console.log('✅ Columna cantidadTotal agregada');
    } else if (tableInfo.cantidad && !tableInfo.cantidadTotal) {
      await queryInterface.renameColumn('conteo_inicial_detalle', 'cantidad', 'cantidadTotal');
      console.log('✅ Columna cantidad renombrada a cantidadTotal');
    } else {
      console.log('⏭️ Columna cantidadTotal ya existe');
    }
  },

  async down(queryInterface) {
    const tableInfo = await queryInterface.describeTable('conteo_inicial_detalle');
    if (tableInfo.cantidadBodega) {
      await queryInterface.removeColumn('conteo_inicial_detalle', 'cantidadBodega');
    }
    if (tableInfo.cantidadExhibicion) {
      await queryInterface.removeColumn('conteo_inicial_detalle', 'cantidadExhibicion');
    }
    // No removemos cantidadTotal porque puede ser la original
  }
};