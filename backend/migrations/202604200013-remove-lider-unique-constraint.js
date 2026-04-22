'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.removeConstraint('grupos', 'grupos_liderId_unique');
      console.log('✅ Restricción unique de liderId eliminada');
    } catch (error) {
      console.log('⚠️ La restricción no existía o ya fue eliminada');
    }
  },

  async down(queryInterface) {
    await queryInterface.addConstraint('grupos', {
      fields: ['liderId'],
      type: 'unique',
      name: 'grupos_liderId_unique'
    });
  }
};