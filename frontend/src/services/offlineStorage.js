// src/services/offlineStorage.js
const DB_NAME = 'inventario_offline';
const DB_VERSION = 7;

let db = null;
let dbInitPromise = null;
let isSyncing = false;

// Inicializar base de datos
async function ensureDB() {
  if (db) return db;
  if (dbInitPromise) return dbInitPromise;
  
  dbInitPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      console.error('[Offline] Error:', request.error);
      reject(request.error);
    };
    
    request.onsuccess = () => {
      db = request.result;
      console.log('[Offline] Base de datos conectada, versión:', DB_VERSION);
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      console.log('[Offline] Creando stores...');
      
      // Store para escaneos pendientes
      if (!db.objectStoreNames.contains('pending_scans')) {
        const scansStore = db.createObjectStore('pending_scans', { 
          keyPath: 'id', 
          autoIncrement: true 
        });
        scansStore.createIndex('sincronizado', 'sincronizado');
        scansStore.createIndex('created_at', 'created_at');
        console.log('[Offline] Store pending_scans creado');
      }
      
      // Store para caché de inventarios
      if (!db.objectStoreNames.contains('cache_inventarios')) {
        db.createObjectStore('cache_inventarios', { keyPath: 'id' });
        console.log('[Offline] Store cache_inventarios creado');
      }
    };
  });
  
  return dbInitPromise;
}

// ==================== ESCANEOS OFFLINE ====================

export async function savePendingScan(scanData) {
  try {
    const database = await ensureDB();
    const transaction = database.transaction(['pending_scans'], 'readwrite');
    const store = transaction.objectStore('pending_scans');
    
    const pendingScan = {
      ...scanData,
      created_at: Date.now(),
      sincronizado: false,
      intentos: 0
    };
    
    return new Promise((resolve) => {
      const request = store.add(pendingScan);
      request.onsuccess = () => {
        console.log('[Offline] Escaneo guardado localmente, id:', request.result);
        resolve(request.result);
      };
      request.onerror = () => {
        console.error('[Offline] Error guardando:', request.error);
        resolve(null);
      };
    });
  } catch (error) {
    console.error('[Offline] Error en savePendingScan:', error);
    return null;
  }
}

export async function getPendingScans() {
  try {
    const database = await ensureDB();
    const transaction = database.transaction(['pending_scans'], 'readonly');
    const store = transaction.objectStore('pending_scans');
    
    return new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const all = request.result || [];
        const pendientes = all.filter(scan => !scan.sincronizado);
        console.log('[Offline] Escaneos pendientes:', pendientes.length);
        resolve(pendientes);
      };
      request.onerror = () => {
        console.error('[Offline] Error obteniendo:', request.error);
        resolve([]);
      };
    });
  } catch (error) {
    console.error('[Offline] Error en getPendingScans:', error);
    return [];
  }
}

export async function markScanAsSynced(scanId) {
  try {
    const database = await ensureDB();
    const transaction = database.transaction(['pending_scans'], 'readwrite');
    const store = transaction.objectStore('pending_scans');
    
    return new Promise((resolve) => {
      const getRequest = store.get(scanId);
      getRequest.onsuccess = () => {
        const scan = getRequest.result;
        if (scan && !scan.sincronizado) {
          scan.sincronizado = true;
          scan.sincronizado_en = Date.now();
          store.put(scan);
          console.log('[Offline] Escaneo marcado como sincronizado:', scanId);
        }
        resolve(true);
      };
      getRequest.onerror = () => resolve(false);
    });
  } catch (error) {
    console.error('[Offline] Error en markScanAsSynced:', error);
    return false;
  }
}

async function isStillPending(scanId) {
  try {
    const database = await ensureDB();
    const transaction = database.transaction(['pending_scans'], 'readonly');
    const store = transaction.objectStore('pending_scans');
    
    return new Promise((resolve) => {
      const request = store.get(scanId);
      request.onsuccess = () => {
        const scan = request.result;
        resolve(scan && !scan.sincronizado);
      };
      request.onerror = () => resolve(false);
    });
  } catch (error) {
    return false;
  }
}

export async function syncAllPendingScans(api, onProgress) {
  if (isSyncing) {
    console.log('[Offline] Ya hay una sincronización en curso');
    return { sincronizados: 0, errores: 0, total: 0, yaEnCurso: true };
  }
  
  isSyncing = true;
  const pendientes = await getPendingScans();
  let sincronizados = 0;
  let errores = 0;
  
  console.log('[Offline] Sincronizando', pendientes.length, 'escaneos');
  
  for (const scan of pendientes) {
    const stillPending = await isStillPending(scan.id);
    if (!stillPending) {
      console.log('[Offline] Escaneo ya no está pendiente:', scan.id);
      sincronizados++;
      continue;
    }
    
    try {
      const response = await api.post('/lecturas/scan-ronda', {
        rondaId: scan.rondaId,
        grupoId: scan.grupoId,
        codigo: scan.codigo
      });
      
      if (response.data?.ok) {
        await markScanAsSynced(scan.id);
        sincronizados++;
        console.log('[Offline] ✅ Escaneo sincronizado:', scan.codigo);
      } else {
        errores++;
        console.warn('[Offline] ❌ Respuesta no ok:', response.data);
      }
    } catch (error) {
      errores++;
      console.error('[Offline] ❌ Error en sync:', error.message);
    }
    
    if (onProgress) {
      onProgress({ sincronizados, errores, total: pendientes.length });
    }
  }
  
  console.log(`[Offline] Sincronización: ${sincronizados} ok, ${errores} errores`);
  isSyncing = false;
  return { sincronizados, errores, total: pendientes.length };
}

export async function getPendingStats() {
  const pendientes = await getPendingScans();
  return { total: pendientes.length };
}

// ==================== CACHÉ DE INVENTARIOS ====================

export async function cacheInventarios(data) {
  try {
    const database = await ensureDB();
    const transaction = database.transaction(['cache_inventarios'], 'readwrite');
    const store = transaction.objectStore('cache_inventarios');
    
    store.clear();
    data.forEach(item => {
      store.put({ ...item, cached_at: Date.now() });
    });
    
    console.log('[Offline] Inventarios cacheados:', data.length);
    return true;
  } catch (error) {
    console.error('[Offline] Error cacheando inventarios:', error);
    return false;
  }
}

export async function getCachedInventarios() {
  try {
    const database = await ensureDB();
    const transaction = database.transaction(['cache_inventarios'], 'readonly');
    const store = transaction.objectStore('cache_inventarios');
    
    return new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  } catch (error) {
    console.error('[Offline] Error obteniendo caché:', error);
    return [];
  }
}

// ==================== UTILIDADES ====================

export function isOnline() {
  return navigator.onLine;
}

export async function clearAllOfflineData() {
  try {
    if (db) {
      db.close();
      db = null;
    }
    dbInitPromise = null;
    isSyncing = false;
    
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => {
        console.log('[Offline] Base de datos eliminada');
        resolve();
      };
      request.onerror = () => resolve();
    });
  } catch (error) {
    console.error('[Offline] Error limpiando:', error);
  }
}