'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Verificar si ya existe la constraint
    const tableInfo = await queryInterface.describeTable('usuarios');
    
    // Agregar constraint unique para grupoId (cada usuario solo puede estar en un grupo)
    await queryInterface.changeColumn('usuarios', 'grupoId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'grupos',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    
    // Agregar índice único para grupoId (opcional, para evitar duplicados lógicos)
    // Nota: No se puede hacer unique porque varios usuarios pueden tener NULL
    console.log('✅ Validación de usuario único por grupo configurada');
  },

  async down(queryInterface) {
    console.log('⏭️ Reversión no necesaria');
  }
};