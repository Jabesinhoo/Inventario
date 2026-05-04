'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Agregar columna unidadMedida
    try {
      await queryInterface.addColumn('conteo_inicial_detalle', 'unidadMedida', {
        type: Sequelize.STRING(20),
        allowNull: true,
        defaultValue: 'Und.'
      });
      console.log('✅ Columna unidadMedida agregada');
    } catch (e) {
      console.log('⚠️ unidadMedida ya existe o error:', e.message);
    }

    // Agregar columna grupoNombre
    try {
      await queryInterface.addColumn('conteo_inicial_detalle', 'grupoNombre', {
        type: Sequelize.STRING(100),
        allowNull: true
      });
      console.log('✅ Columna grupoNombre agregada');
    } catch (e) {
      console.log('⚠️ grupoNombre ya existe o error:', e.message);
    }

    // Agregar columna precioCoste
    try {
      await queryInterface.addColumn('conteo_inicial_detalle', 'precioCoste', {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true,
        defaultValue: 0
      });
      console.log('✅ Columna precioCoste agregada');
    } catch (e) {
      console.log('⚠️ precioCoste ya existe o error:', e.message);
    }

    // Agregar columna cantidadBodega
    try {
      await queryInterface.addColumn('conteo_inicial_detalle', 'cantidadBodega', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      });
      console.log('✅ Columna cantidadBodega agregada');
    } catch (e) {
      console.log('⚠️ cantidadBodega ya existe o error:', e.message);
    }

    // Agregar columna cantidadExhibicion
    try {
      await queryInterface.addColumn('conteo_inicial_detalle', 'cantidadExhibicion', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      });
      console.log('✅ Columna cantidadExhibicion agregada');
    } catch (e) {
      console.log('⚠️ cantidadExhibicion ya existe o error:', e.message);
    }

    // Renombrar columna cantidad a cantidadTotal si existe
    try {
      const table = await queryInterface.describeTable('conteo_inicial_detalle');
      if (table.cantidad && !table.cantidadTotal) {
        await queryInterface.renameColumn('conteo_inicial_detalle', 'cantidad', 'cantidadTotal');
        console.log('✅ Columna cantidad renombrada a cantidadTotal');
      }
    } catch (e) {
      console.log('⚠️ Error renombrando cantidad:', e.message);
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('conteo_inicial_detalle', 'unidadMedida');
    await queryInterface.removeColumn('conteo_inicial_detalle', 'grupoNombre');
    await queryInterface.removeColumn('conteo_inicial_detalle', 'precioCoste');
    await queryInterface.removeColumn('conteo_inicial_detalle', 'cantidadBodega');
    await queryInterface.removeColumn('conteo_inicial_detalle', 'cantidadExhibicion');
  }
};