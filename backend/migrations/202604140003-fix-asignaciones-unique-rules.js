'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.addConstraint('asignaciones_conteo', {
      fields: ['inventarioId', 'conteoTipo', 'grupoId'],
      type: 'unique',
      name: 'asignaciones_conteo_unique_grupo_por_conteo'
    });

    await queryInterface.addConstraint('asignaciones_conteo', {
      fields: ['inventarioId', 'conteoTipo', 'zonaId'],
      type: 'unique',
      name: 'asignaciones_conteo_unique_zona_por_conteo'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint(
      'asignaciones_conteo',
      'asignaciones_conteo_unique_grupo_por_conteo'
    );

    await queryInterface.removeConstraint(
      'asignaciones_conteo',
      'asignaciones_conteo_unique_zona_por_conteo'
    );
  }
};