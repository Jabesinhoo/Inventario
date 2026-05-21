// Sistema de almacenamiento offline para escaneos
const DB_NAME = 'inventario_offline';
const DB_VERSION = 2; // Incrementar versión para forzar actualización
const STORES = {
  SCANS: 'pending_scans',
  INVENTORIES: 'inventories',
  RONDAS: 'rondas',
  GROUPS: 'groups',
  ZONES: 'zones'
};

let db = null;

// Abrir/crear base de datos IndexedDB
export async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;
      
      console.log('[IndexedDB] Actualizando de versión', oldVersion, 'a', DB_VERSION);
      
      // Eliminar stores antiguos si existen (para evitar inconsistencias)
      if (db.objectStoreNames.contains(STORES.SCANS)) {
        db.deleteObjectStore(STORES.SCANS);
      }
      if (db.objectStoreNames.contains(STORES.INVENTORIES)) {
        db.deleteObjectStore(STORES.INVENTORIES);
      }
      if (db.objectStoreNames.contains(STORES.RONDAS)) {
        db.deleteObjectStore(STORES.RONDAS);
      }
      if (db.objectStoreNames.contains(STORES.GROUPS)) {
        db.deleteObjectStore(STORES.GROUPS);
      }
      if (db.objectStoreNames.contains(STORES.ZONES)) {
        db.deleteObjectStore(STORES.ZONES);
      }
      
      // Crear stores nuevos
      const scansStore = db.createObjectStore(STORES.SCANS, { 
        keyPath: 'id', 
        autoIncrement: true 
      });
      scansStore.createIndex('created_at', 'created_at');
      scansStore.createIndex('sincronizado', 'sincronizado');
      
      db.createObjectStore(STORES.INVENTORIES, { keyPath: 'id' });
      db.createObjectStore(STORES.RONDAS, { keyPath: 'id' });
      db.createObjectStore(STORES.GROUPS, { keyPath: 'id' });
      db.createObjectStore(STORES.ZONES, { keyPath: 'id' });
      
      console.log('[IndexedDB] Stores creados correctamente');
    };
  });
}

// Guardar escaneo pendiente (offline)
export async function savePendingScan(scanData) {
  if (!db) await openDB();
  
  const transaction = db.transaction([STORES.SCANS], 'readwrite');
  const store = transaction.objectStore(STORES.SCANS);
  
  const pendingScan = {
    ...scanData,
    created_at: new Date().toISOString(),
    sincronizado: false,
    intentos: 0
  };
  
  return new Promise((resolve, reject) => {
    const request = store.add(pendingScan);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Obtener todos los escaneos pendientes (versión segura sin índices)
export async function getPendingScans() {
  if (!db) await openDB();
  
  const transaction = db.transaction([STORES.SCANS], 'readonly');
  const store = transaction.objectStore(STORES.SCANS);
  
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const all = request.result || [];
      const pendientes = all.filter(scan => !scan.sincronizado);
      resolve(pendientes);
    };
    request.onerror = () => {
      console.error('Error en getPendingScans:', request.error);
      resolve([]);
    };
  });
}

// Marcar escaneo como sincronizado
export async function markAsSynced(scanId) {
  if (!db) await openDB();
  
  const transaction = db.transaction([STORES.SCANS], 'readwrite');
  const store = transaction.objectStore(STORES.SCANS);
  
  return new Promise((resolve, reject) => {
    const getRequest = store.get(scanId);
    getRequest.onsuccess = () => {
      const scan = getRequest.result;
      if (scan) {
        scan.sincronizado = true;
        scan.sincronizado_en = new Date().toISOString();
        const updateRequest = store.put(scan);
        updateRequest.onsuccess = () => resolve();
        updateRequest.onerror = () => reject(updateRequest.error);
      } else {
        resolve();
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

// Eliminar escaneo sincronizado
export async function deleteSyncedScan(scanId) {
  if (!db) await openDB();
  
  const transaction = db.transaction([STORES.SCANS], 'readwrite');
  const store = transaction.objectStore(STORES.SCANS);
  
  return new Promise((resolve, reject) => {
    const request = store.delete(scanId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Cachear datos para offline
export async function cacheData(storeName, data) {
  if (!db) await openDB();
  
  const transaction = db.transaction([storeName], 'readwrite');
  const store = transaction.objectStore(storeName);
  
  // Limpiar cache anterior
  store.clear();
  
  // Guardar nuevos datos
  data.forEach(item => {
    store.put({ ...item, cached_at: new Date().toISOString() });
  });
  
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// Obtener datos cacheados
export async function getCachedData(storeName) {
  if (!db) await openDB();
  
  const transaction = db.transaction([storeName], 'readonly');
  const store = transaction.objectStore(storeName);
  
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// Obtener estadísticas de pendientes
export async function getPendingStats() {
  const pendientes = await getPendingScans();
  const gruposMap = {};
  pendientes.forEach(scan => {
    gruposMap[scan.grupoId] = (gruposMap[scan.grupoId] || 0) + 1;
  });
  return {
    total: pendientes.length,
    grupos: gruposMap
  };
}

// Sincronizar todos los pendientes
export async function syncAllPendingScans(api, onProgress) {
  const pendientes = await getPendingScans();
  let sincronizados = 0;
  let errores = 0;
  
  for (const scan of pendientes) {
    try {
      await api.post('/lecturas/scan-ronda', {
        rondaId: scan.rondaId,
        grupoId: scan.grupoId,
        codigo: scan.codigo
      });
      
      await markAsSynced(scan.id);
      sincronizados++;
      
      if (onProgress) {
        onProgress({ sincronizados, errores, total: pendientes.length });
      }
    } catch (error) {
      errores++;
      scan.intentos = (scan.intentos || 0) + 1;
      if (scan.intentos >= 5) {
        await markAsSynced(scan.id); // Marcar como fallido definitivo
      } else {
        // Actualizar intentos en la base de datos
        if (db) {
          const transaction = db.transaction([STORES.SCANS], 'readwrite');
          const store = transaction.objectStore(STORES.SCANS);
          store.put(scan);
        }
      }
    }
  }
  
  return { sincronizados, errores, total: pendientes.length };
}

// Verificar conexión a internet
export function isOnline() {
  return navigator.onLine;
}

// Escuchar cambios de conexión
export function onConnectionChange(callback) {
  const onlineHandler = () => callback(true);
  const offlineHandler = () => callback(false);
  
  window.addEventListener('online', onlineHandler);
  window.addEventListener('offline', offlineHandler);
  
  // Retornar función para limpiar
  return () => {
    window.removeEventListener('online', onlineHandler);
    window.removeEventListener('offline', offlineHandler);
  };
}