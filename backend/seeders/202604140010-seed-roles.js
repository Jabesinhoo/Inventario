'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('roles', [
      {
        nombre: 'admin',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        nombre: 'supervisor',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        nombre: 'contador',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('roles', {
      nombre: ['admin', 'supervisor', 'contador']
    });
  }
};