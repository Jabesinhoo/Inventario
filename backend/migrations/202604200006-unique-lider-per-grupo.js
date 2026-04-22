'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addConstraint('grupos', {
      fields: ['liderId'],
      type: 'unique',
      name: 'grupos_liderId_unique',
      where: {
        liderId: { [Sequelize.Op.ne]: null }
      }
    });
    console.log('✅ Constraint unique para liderId agregada');
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('grupos', 'grupos_liderId_unique');
    console.log('❌ Constraint unique para liderId removida');
  }
};