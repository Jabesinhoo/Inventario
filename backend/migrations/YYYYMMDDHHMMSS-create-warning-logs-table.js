// backend/src/database/migrations/20260115000000-create-warning-logs-table.js

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Verificar si la tabla ya existe
    const tables = await queryInterface.showAllTables();
    
    if (tables.includes('warning_logs')) {
      console.log('⚠️ La tabla warning_logs ya existe, saltando creación...');
      return;
    }

    await queryInterface.createTable('warning_logs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      tipo: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'producto_en_otra_zona'
      },
      ronda_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'rondas_conteo',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      sku: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      zona_actual_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'zonas',
          key: 'id'
        }
      },
      zona_actual_nombre: {
        type: Sequelize.STRING(120),
        allowNull: false
      },
      grupo_actual_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'grupos',
          key: 'id'
        }
      },
      grupo_actual_nombre: {
        type: Sequelize.STRING(120),
        allowNull: false
      },
      cantidad_actual: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      zona_otra_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'zonas',
          key: 'id'
        }
      },
      zona_otra_nombre: {
        type: Sequelize.STRING(120),
        allowNull: false
      },
      grupo_otro_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'grupos',
          key: 'id'
        }
      },
      grupo_otro_nombre: {
        type: Sequelize.STRING(120),
        allowNull: false
      },
      cantidad_otra_zona: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      usuario_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'usuarios',
          key: 'id'
        }
      },
      usuario_nombre: {
        type: Sequelize.STRING(120),
        allowNull: false
      },
      creado_en: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Crear índices UNO POR UNO (evitar duplicados)
    await queryInterface.addIndex('warning_logs', ['ronda_id'], {
      name: 'idx_warning_logs_ronda_id'
    });
    
    await queryInterface.addIndex('warning_logs', ['sku'], {
      name: 'idx_warning_logs_sku'
    });
    
    await queryInterface.addIndex('warning_logs', ['creado_en'], {
      name: 'idx_warning_logs_creado_en'
    });
    
    await queryInterface.addIndex('warning_logs', ['tipo'], {
      name: 'idx_warning_logs_tipo'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('warning_logs');
  }
};