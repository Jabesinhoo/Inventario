const bcrypt = require('bcryptjs');
const readline = require('readline');
const { Usuario, Rol, sequelize } = require('../src/models');
const config = require('../config/config');

async function createAdmin() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query) =>
    new Promise((resolve) => rl.question(query, resolve));

  try {
    console.log('\n[SISTEMA] Creando usuario administrador');
    console.log('=====================================\n');

    const nombre = (await question('Nombre completo: ')).trim();
    const email = (await question('Correo electrónico: ')).trim().toLowerCase();
    const password = await question('Contraseña (mínimo 8 caracteres): ');
    const confirmar = await question('Confirmar contraseña: ');

    if (!nombre) {
      throw new Error('El nombre es obligatorio');
    }

    if (!email) {
      throw new Error('El correo electrónico es obligatorio');
    }

    if (password !== confirmar) {
      throw new Error('Las contraseñas no coinciden');
    }

    if (password.length < 8) {
      throw new Error('La contraseña debe tener al menos 8 caracteres');
    }

    const rolAdmin = await Rol.findOne({
      where: { nombre: 'admin' }
    });

    if (!rolAdmin) {
      throw new Error(
        'No existe el rol admin. Ejecuta primero las migraciones y el seeder de roles.'
      );
    }

    const existe = await Usuario.findOne({
      where: { email }
    });

    if (existe) {
      throw new Error('El usuario ya existe');
    }

    const passwordHash = await bcrypt.hash(
      password,
      config.bcrypt?.rounds || 10
    );

    // ✅ SIN grupoId - la columna ya no existe
    const usuario = await Usuario.create({
      nombre,
      email,
      passwordHash,
      rolId: rolAdmin.id,
      activo: true
      // ❌ NO incluir grupoId
    });

    console.log('\n[SUCCESS] Administrador creado exitosamente');
    console.log(`[INFO] ID: ${usuario.id}`);
    console.log(`[INFO] Email: ${usuario.email}`);
    console.log(`[INFO] Rol: ${rolAdmin.nombre}\n`);
  } catch (error) {
    console.error(`\n[ERROR] ${error.message}\n`);
    process.exitCode = 1;
  } finally {
    rl.close();
    await sequelize.close();
  }
}

createAdmin();