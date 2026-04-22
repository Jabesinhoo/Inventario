'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Verificar si ya existen roles
    const rolesExistentes = await queryInterface.sequelize.query(
      `SELECT COUNT(*) as count FROM roles WHERE nombre IN ('admin', 'supervisor', 'contador')`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    
    if (rolesExistentes[0].count === 0) {
      await queryInterface.bulkInsert('roles', [
        { nombre: 'admin', createdAt: new Date(), updatedAt: new Date() },
        { nombre: 'supervisor', createdAt: new Date(), updatedAt: new Date() },
        { nombre: 'contador', createdAt: new Date(), updatedAt: new Date() }
      ]);
      console.log('✅ Roles insertados');
    } else {
      console.log('⏭️ Roles ya existen');
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('roles', {
      nombre: ['admin', 'supervisor', 'contador']
    });
  }
};