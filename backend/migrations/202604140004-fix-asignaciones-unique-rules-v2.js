'use strict';

async function constraintExists(queryInterface, name) {
  const [results] = await queryInterface.sequelize.query(
    `
    SELECT 1
    FROM pg_constraint
    WHERE conname = :name
    LIMIT 1
    `,
    {
      replacements: { name }
    }
  );

  return results.length > 0;
}

module.exports = {
  async up(queryInterface) {
    const grupoConstraint = 'asignaciones_conteo_unique_grupo_por_conteo';
    const zonaConstraint = 'asignaciones_conteo_unique_zona_por_conteo';

    const hasGrupoConstraint = await constraintExists(queryInterface, grupoConstraint);
    if (!hasGrupoConstraint) {
      await queryInterface.addConstraint('asignaciones_conteo', {
        fields: ['inventarioId', 'conteoTipo', 'grupoId'],
        type: 'unique',
        name: grupoConstraint
      });
    }

    const hasZonaConstraint = await constraintExists(queryInterface, zonaConstraint);
    if (!hasZonaConstraint) {
      await queryInterface.addConstraint('asignaciones_conteo', {
        fields: ['inventarioId', 'conteoTipo', 'zonaId'],
        type: 'unique',
        name: zonaConstraint
      });
    }
  },

  async down(queryInterface) {
    const grupoConstraint = 'asignaciones_conteo_unique_grupo_por_conteo';
    const zonaConstraint = 'asignaciones_conteo_unique_zona_por_conteo';

    const hasGrupoConstraint = await constraintExists(queryInterface, grupoConstraint);
    if (hasGrupoConstraint) {
      await queryInterface.removeConstraint('asignaciones_conteo', grupoConstraint);
    }

    const hasZonaConstraint = await constraintExists(queryInterface, zonaConstraint);
    if (hasZonaConstraint) {
      await queryInterface.removeConstraint('asignaciones_conteo', zonaConstraint);
    }
  }
};