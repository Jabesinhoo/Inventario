const bcrypt = require('bcryptjs');
const { Usuario, Rol, sequelize } = require('../src/models');

async function createTestUsers() {
  try {
    console.log('\n[SISTEMA] Creando usuarios de prueba');
    console.log('=====================================\n');

    // Buscar el rol "contador"
    const rolContador = await Rol.findOne({ where: { nombre: 'contador' } });
    
    if (!rolContador) {
      console.error('❌ No existe el rol "contador". Ejecuta primero las migraciones y seeders.');
      process.exit(1);
    }

    console.log(`✅ Rol encontrado: contador (ID: ${rolContador.id})\n`);

    let creados = 0;
    let existentes = 0;

    for (let i = 1; i <= 30; i++) {
      const nombre = `Usuario ${i}`;
      const email = `usuario${i}@test.com`;
      const password = 'jabes123';
      const passwordHash = await bcrypt.hash(password, 10);

      // Verificar si ya existe
      const existe = await Usuario.findOne({ where: { email } });

      if (existe) {
        console.log(`⏭️ Usuario ${i} ya existe: ${email}`);
        existentes++;
        continue;
      }

      await Usuario.create({
        nombre,
        email,
        passwordHash,
        rolId: rolContador.id,
        activo: true
      });

      console.log(`✅ Usuario ${i} creado: ${email} / ${password}`);
      creados++;
    }

    console.log('\n=====================================');
    console.log(`📊 Resumen:`);
    console.log(`   ✅ Creados: ${creados}`);
    console.log(`   ⏭️ Ya existían: ${existentes}`);
    console.log(`   🔑 Contraseña: jabes123`);
    console.log('=====================================\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await sequelize.close();
  }
}

createTestUsers();