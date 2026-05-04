const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const path = require('path');
const fs = require('fs');

async function findPgDump() {
  const possiblePaths = [
    'pg_dump',
    '"C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump"',
    '"C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump"',
    '"C:\\Program Files\\PostgreSQL\\14\\bin\\pg_dump"',
    '"C:\\Program Files\\PostgreSQL\\13\\bin\\pg_dump"',
    '"C:\\Program Files\\PostgreSQL\\12\\bin\\pg_dump"',
    '"C:\\Program Files (x86)\\PostgreSQL\\16\\bin\\pg_dump"',
    '"C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe"',
  ];
  
  for (const pgPath of possiblePaths) {
    try {
      const cleanPath = pgPath.replace(/"/g, '');
      if (fs.existsSync(cleanPath) || cleanPath === 'pg_dump') {
        await execPromise(`"${cleanPath}" --version`);
        return cleanPath;
      }
    } catch (err) {
      // Continuar buscando
    }
  }
  
  return 'pg_dump';
}

async function ejecutarExportarExcel(req, res, next) {
  try {
    console.log('[SCRIPT] Ejecutando exportación a Excel...');
    
    const scriptPath = path.join(__dirname, '../../scripts/export-to-excel.js');
    
    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({
        ok: false,
        message: 'Script no encontrado: export-to-excel.js'
      });
    }
    
    try {
      const { stdout, stderr } = await execPromise(`node "${scriptPath}"`, {
        timeout: 120000
      });
      
      console.log('[SCRIPT] stdout:', stdout);
      if (stderr) console.error('[SCRIPT] stderr:', stderr);
      
      const match = stdout.match(/✅ Archivo guardado: (.+\.xlsx)/);
      const filename = match ? path.basename(match[1]) : null;
      
      if (filename) {
        const filePath = path.join(__dirname, '../../exports', filename);
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          
          return res.json({
            ok: true,
            message: 'Exportación completada',
            data: {
              filename: filename,
              size: stats.size,
              sizeFormatted: (stats.size / 1024).toFixed(2) + ' KB'
            }
          });
        }
      }
      
      res.json({
        ok: true,
        message: 'Exportación completada',
        data: { filename, output: stdout }
      });
      
    } catch (execError) {
      console.error('[SCRIPT] Error ejecutando script:', execError);
      return res.status(500).json({
        ok: false,
        message: 'Error al ejecutar el script',
        error: execError.message
      });
    }
    
  } catch (error) {
    console.error('[SCRIPT] Error:', error);
    next(error);
  }
}

async function ejecutarBackup(req, res, next) {
  try {
    console.log('[SCRIPT] Ejecutando respaldo de PostgreSQL...');
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const backupDir = path.join(__dirname, '../../backups');
    const backupPath = path.join(backupDir, `backup_${timestamp}.sql`);
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const pgDumpPath = await findPgDump();
    console.log('[SCRIPT] Usando pg_dump:', pgDumpPath);
    
    const dbUser = process.env.DB_USER || 'postgres';
    const dbName = process.env.DB_NAME || 'inventario';
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = process.env.DB_PORT || '5432';
    
    const command = `"${pgDumpPath}" -U ${dbUser} -h ${dbHost} -p ${dbPort} -d ${dbName} -f "${backupPath}"`;
    
    console.log('[SCRIPT] Ejecutando:', command);
    
    const { stdout, stderr } = await execPromise(command, {
      env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD }
    });
    
    if (stderr && !stderr.includes('WARNING')) {
      console.error('[SCRIPT] Error:', stderr);
      return res.status(500).json({
        ok: false,
        message: 'Error al ejecutar el respaldo',
        error: stderr
      });
    }
    
    if (!fs.existsSync(backupPath)) {
      throw new Error('No se pudo crear el archivo de respaldo');
    }
    
    const stats = fs.statSync(backupPath);
    
    res.json({
      ok: true,
      message: 'Respaldo completado',
      data: {
        filename: `backup_${timestamp}.sql`,
        path: backupPath,
        size: stats.size,
        sizeFormatted: (stats.size / 1024 / 1024).toFixed(2) + ' MB'
      }
    });
    
  } catch (error) {
    console.error('[SCRIPT] Error:', error);
    res.status(500).json({
      ok: false,
      message: 'Error al ejecutar el respaldo',
      error: error.message
    });
  }
}

async function listarExportaciones(req, res, next) {
  try {
    const exportDir = path.join(__dirname, '../../exports');
    
    if (!fs.existsSync(exportDir)) {
      return res.json({ ok: true, data: [] });
    }
    
    const files = fs.readdirSync(exportDir).filter(f => f.endsWith('.xlsx'));
    
    res.json({
      ok: true,
      data: files.map(f => ({
        nombre: f,
        fecha: fs.statSync(path.join(exportDir, f)).mtime
      }))
    });
  } catch (error) {
    next(error);
  }
}

async function descargarExportacion(req, res, next) {
  try {
    const { filename } = req.params;
    
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({
        ok: false,
        message: 'Nombre de archivo inválido'
      });
    }
    
    const filePath = path.join(__dirname, '../../exports', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        ok: false,
        message: 'Archivo no encontrado'
      });
    }
    
    const fileBuffer = fs.readFileSync(filePath);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    res.send(fileBuffer);
    
  } catch (error) {
    console.error('[SCRIPT] Error:', error);
    next(error);
  }
}

async function exportarJson(req, res, next) {
  try {
    const { getSqlServerPool } = require('../config/sqlserver');
    const pool = await getSqlServerPool();
    
    const result = await pool.request().query(`
      SELECT 
        i.[CódigoInventario] as sku,
        i.[Descripción] as descripcion,
        ISNULL((
          SELECT TOP 1 c.Cantidad 
          FROM [dbo].[CCA_M_Inventarios] c 
          WHERE c.IdInventario = i.IdInventario 
            AND c.IdBodegaInventario = 'BOD'
          ORDER BY c.IdAsientoContable DESC
        ), 0) as cantidadBodega,
        ISNULL((
          SELECT TOP 1 c.Cantidad 
          FROM [dbo].[CCA_M_Inventarios] c 
          WHERE c.IdInventario = i.IdInventario 
            AND c.IdBodegaInventario = 'EXH'
          ORDER BY c.IdAsientoContable DESC
        ), 0) as cantidadExhibicion
      FROM [dbo].[Inventarios] i
      WHERE i.[Activo] = -1
      ORDER BY i.[CódigoInventario]
    `);
    
    res.json({
      ok: true,
      data: result.recordset
    });
  } catch (error) {
    console.error('[EXPORT] Error:', error);
    next(error);
  }
}

async function exportarExcelMelissa(req, res, next) {
  try {
    console.log('[SCRIPT] Ejecutando exportación de inventario Melissa...');
    
    const scriptPath = path.join(__dirname, '../../scripts/exportar-melissa.js');
    const exportsDir = path.join(__dirname, '../../exports');
    
    // Ejecutar el script
    const { stdout, stderr } = await execPromise(`node "${scriptPath}"`, {
      timeout: 120000
    });
    
    console.log('[SCRIPT] stdout:', stdout);
    if (stderr) console.error('[SCRIPT] stderr:', stderr);
    
    // Buscar el archivo generado
    const files = fs.readdirSync(exportsDir).filter(f => f.startsWith('inventario_melissa_') && f.endsWith('.xlsx'));
    if (files.length === 0) {
      return res.status(500).json({
        ok: false,
        message: 'No se pudo generar el archivo'
      });
    }
    
    // Tomar el archivo más reciente
    const latestFile = files.sort().reverse()[0];
    const filePath = path.join(exportsDir, latestFile);
    
    res.download(filePath, latestFile);
    
  } catch (error) {
    console.error('[SCRIPT] Error:', error);
    res.status(500).json({
      ok: false,
      message: 'Error al exportar inventario Melissa: ' + error.message
    });
  }
}

module.exports = {
  ejecutarExportarExcel,
  ejecutarBackup,
  listarExportaciones,
  descargarExportacion,
  exportarJson,
  exportarExcelMelissa
};