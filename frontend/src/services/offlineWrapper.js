import { cacheList, getCachedList, cacheData, getCachedData, savePendingRequest, isOnline } from './offlineManager';
import api from './api';

// Wrapper para getInventarios
export async function getInventariosOffline(forceRefresh = false) {
  const cacheKey = 'inventarios_list';
  
  // Intentar obtener de caché
  if (!forceRefresh && !isOnline()) {
    const cached = await getCachedList(cacheKey);
    if (cached && cached.length > 0) {
      console.log('[Offline] Usando caché de inventarios');
      return cached;
    }
  }
  
  // Si hay internet o no hay caché, ir al servidor
  try {
    const response = await api.get('/inventarios');
    const data = response.data.data;
    await cacheList(cacheKey, data);
    return data;
  } catch (error) {
    // Si falla, intentar caché como respaldo
    const cached = await getCachedList(cacheKey);
    if (cached && cached.length > 0) {
      console.log('[Offline] Usando caché de respaldo para inventarios');
      return cached;
    }
    throw error;
  }
}

// Wrapper para getZonas
export async function getZonasOffline(forceRefresh = false) {
  const cacheKey = 'zonas_list';
  
  if (!forceRefresh && !isOnline()) {
    const cached = await getCachedList(cacheKey);
    if (cached && cached.length > 0) return cached;
  }
  
  try {
    const response = await api.get('/zonas');
    const data = response.data.data;
    await cacheList(cacheKey, data);
    return data;
  } catch (error) {
    const cached = await getCachedList(cacheKey);
    if (cached && cached.length > 0) return cached;
    throw error;
  }
}

// Wrapper para getGrupos
export async function getGruposOffline(inventarioId, forceRefresh = false) {
  const cacheKey = `grupos_${inventarioId}`;
  
  if (!forceRefresh && !isOnline()) {
    const cached = await getCachedList(cacheKey);
    if (cached && cached.length > 0) return cached;
  }
  
  try {
    const response = await api.get('/grupos', { params: { inventarioId } });
    const data = response.data.data;
    await cacheList(cacheKey, data);
    return data;
  } catch (error) {
    const cached = await getCachedList(cacheKey);
    if (cached && cached.length > 0) return cached;
    throw error;
  }
}

// Wrapper para getDashboard
export async function getDashboardOffline(params, forceRefresh = false) {
  const cacheKey = `dashboard_${JSON.stringify(params)}`;
  
  if (!forceRefresh && !isOnline()) {
    const cached = await getCachedData(cacheKey);
    if (cached) return cached;
  }
  
  try {
    const response = await api.get('/dashboard', { params });
    const data = response.data.data;
    await cacheData(cacheKey, data, 'dashboard');
    return data;
  } catch (error) {
    const cached = await getCachedData(cacheKey);
    if (cached) return cached;
    throw error;
  }
}

// Wrapper para crear grupo (con cola offline)
export async function createGrupoOffline(payload) {
  if (!isOnline()) {
    await savePendingRequest('grupo', '/grupos', payload, 'POST');
    return { ok: true, offline: true, message: 'Grupo guardado localmente. Se sincronizará después.' };
  }
  
  try {
    const response = await api.post('/grupos', payload);
    return response.data;
  } catch (error) {
    if (!isOnline()) {
      await savePendingRequest('grupo', '/grupos', payload, 'POST');
      return { ok: true, offline: true, message: 'Error al guardar. Se guardó localmente.' };
    }
    throw error;
  }
}

// Wrapper para crear inventario (con cola offline)
export async function createInventarioOffline(payload) {
  if (!isOnline()) {
    await savePendingRequest('inventario', '/inventarios', payload, 'POST');
    return { ok: true, offline: true, message: 'Inventario guardado localmente. Se sincronizará después.' };
  }
  
  try {
    const response = await api.post('/inventarios', payload);
    return response.data;
  } catch (error) {
    if (!isOnline()) {
      await savePendingRequest('inventario', '/inventarios', payload, 'POST');
      return { ok: true, offline: true, message: 'Error al guardar. Se guardó localmente.' };
    }
    throw error;
  }
}

// Wrapper para crear zona
export async function createZonaOffline(payload) {
  if (!isOnline()) {
    await savePendingRequest('zona', '/zonas', payload, 'POST');
    return { ok: true, offline: true, message: 'Zona guardada localmente. Se sincronizará después.' };
  }
  
  try {
    const response = await api.post('/zonas', payload);
    return response.data;
  } catch (error) {
    if (!isOnline()) {
      await savePendingRequest('zona', '/zonas', payload, 'POST');
      return { ok: true, offline: true, message: 'Error al guardar. Se guardó localmente.' };
    }
    throw error;
  }
}