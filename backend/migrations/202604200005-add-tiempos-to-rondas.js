'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('rondas_conteo');
    
    if (!tableInfo.tiempoInicio) {
      await queryInterface.addColumn('rondas_conteo', 'tiempoInicio', {
        type: Sequelize.DATE,
        allowNull: true
      });
      console.log('✅ Columna tiempoInicio agregada');
    } else {
      console.log('⏭️ Columna tiempoInicio ya existe');
    }
    
    if (!tableInfo.tiempoFin) {
      await queryInterface.addColumn('rondas_conteo', 'tiempoFin', {
        type: Sequelize.DATE,
        allowNull: true
      });
      console.log('✅ Columna tiempoFin agregada');
    } else {
      console.log('⏭️ Columna tiempoFin ya existe');
    }
    
    if (!tableInfo.totalEscaneos) {
      await queryInterface.addColumn('rondas_conteo', 'totalEscaneos', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      });
      console.log('✅ Columna totalEscaneos agregada');
    } else {
      console.log('⏭️ Columna totalEscaneos ya existe');
    }
  },

  async down(queryInterface) {
    const tableInfo = await queryInterface.describeTable('rondas_conteo');
    if (tableInfo.tiempoInicio) {
      await queryInterface.removeColumn('rondas_conteo', 'tiempoInicio');
    }
    if (tableInfo.tiempoFin) {
      await queryInterface.removeColumn('rondas_conteo', 'tiempoFin');
    }
    if (tableInfo.totalEscaneos) {
      await queryInterface.removeColumn('rondas_conteo', 'totalEscaneos');
    }
  }
};