import api from './api';
import { getCachedInventarios, cacheInventarios, isOnline } from './offlineStorage';

export async function getInventarios(forceRefresh = false) {
  // Si estamos offline y no se fuerza refresco, usar caché
  if (!isOnline() && !forceRefresh) {
    const cached = await getCachedInventarios();
    if (cached && cached.length > 0) {
      console.log('[Offline] Inventarios desde caché');
      return cached;
    }
  }
  
  try {
    const response = await api.get('/inventarios');
    const data = response.data.data || [];
    
    // Guardar en caché
    await cacheInventarios(data);
    console.log('[Online] Inventarios actualizados');
    
    return data;
  } catch (error) {
    console.error('Error al obtener inventarios:', error);
    const cached = await getCachedInventarios();
    if (cached && cached.length > 0) {
      console.log('[Respaldo] Usando caché');
      return cached;
    }
    throw error;
  }
}

// Crear inventario (con cola offline)
export async function createInventario(payload) {
  // Si estamos offline, guardar en cola
  if (!isOnline()) {
    const pendingId = await savePendingRequest('inventario', '/inventarios', payload, 'POST');
    console.log(`[Offline] Inventario guardado en cola. ID local: ${pendingId}`);
    
    // Optimistic update: agregar a caché local temporalmente
    const tempInventario = {
      ...payload,
      id: `temp_${Date.now()}`,
      esTemporal: true,
      createdAt: new Date().toISOString()
    };
    
    const currentCache = await getCachedList(CACHE_KEY);
    await cacheList(CACHE_KEY, [tempInventario, ...currentCache]);
    
    return { 
      ok: true, 
      offline: true, 
      data: tempInventario,
      message: 'Inventario creado localmente. Se sincronizará cuando haya conexión.'
    };
  }
  
  try {
    const response = await api.post('/inventarios', payload);
    const newInventario = response.data.data;
    
    // Actualizar caché con el nuevo inventario
    const currentCache = await getCachedList(CACHE_KEY);
    await cacheList(CACHE_KEY, [newInventario, ...currentCache.filter(i => !i.esTemporal)]);
    
    return { ok: true, offline: false, data: newInventario };
  } catch (error) {
    console.error('Error al crear inventario:', error);
    
    // Si falla por problemas de red, guardar en cola
    if (!isOnline() || error.message?.includes('Network')) {
      const pendingId = await savePendingRequest('inventario', '/inventarios', payload, 'POST');
      
      const tempInventario = {
        ...payload,
        id: `temp_${Date.now()}`,
        esTemporal: true
      };
      
      const currentCache = await getCachedList(CACHE_KEY);
      await cacheList(CACHE_KEY, [tempInventario, ...currentCache]);
      
      return { 
        ok: true, 
        offline: true, 
        data: tempInventario,
        message: 'Inventario guardado localmente. Se sincronizará después.'
      };
    }
    
    throw error;
  }
}

// Actualizar inventario
export async function updateInventario(id, payload) {
  if (!isOnline()) {
    await savePendingRequest('inventario', `/inventarios/${id}`, payload, 'PUT');
    
    // Optimistic update: actualizar caché local
    const currentCache = await getCachedList(CACHE_KEY);
    const updatedCache = currentCache.map(item => 
      item.id === id ? { ...item, ...payload, esTemporal: true, pendienteActualizar: true } : item
    );
    await cacheList(CACHE_KEY, updatedCache);
    
    return { 
      ok: true, 
      offline: true, 
      data: { id, ...payload },
      message: 'Actualización guardada localmente. Se sincronizará después.'
    };
  }
  
  try {
    const response = await api.put(`/inventarios/${id}`, payload);
    const updatedInventario = response.data.data;
    
    // Actualizar caché
    const currentCache = await getCachedList(CACHE_KEY);
    const updatedCache = currentCache.map(item => 
      item.id === id ? updatedInventario : item
    );
    await cacheList(CACHE_KEY, updatedCache);
    
    return { ok: true, offline: false, data: updatedInventario };
  } catch (error) {
    console.error('Error al actualizar inventario:', error);
    
    if (!isOnline() || error.message?.includes('Network')) {
      await savePendingRequest('inventario', `/inventarios/${id}`, payload, 'PUT');
      
      const currentCache = await getCachedList(CACHE_KEY);
      const updatedCache = currentCache.map(item => 
        item.id === id ? { ...item, ...payload, pendienteActualizar: true } : item
      );
      await cacheList(CACHE_KEY, updatedCache);
      
      return { 
        ok: true, 
        offline: true, 
        data: { id, ...payload },
        message: 'Actualización guardada localmente.'
      };
    }
    
    throw error;
  }
}

// Eliminar inventario
export async function deleteInventario(id) {
  if (!isOnline()) {
    await savePendingRequest('inventario', `/inventarios/${id}`, null, 'DELETE');
    
    // Optimistic update: eliminar de caché local
    const currentCache = await getCachedList(CACHE_KEY);
    const updatedCache = currentCache.filter(item => item.id !== id);
    await cacheList(CACHE_KEY, updatedCache);
    
    return { 
      ok: true, 
      offline: true, 
      message: 'Eliminación guardada localmente. Se sincronizará después.'
    };
  }
  
  try {
    const response = await api.delete(`/inventarios/${id}`);
    
    // Actualizar caché
    const currentCache = await getCachedList(CACHE_KEY);
    const updatedCache = currentCache.filter(item => item.id !== id);
    await cacheList(CACHE_KEY, updatedCache);
    
    return response.data;
  } catch (error) {
    console.error('Error al eliminar inventario:', error);
    
    if (!isOnline() || error.message?.includes('Network')) {
      await savePendingRequest('inventario', `/inventarios/${id}`, null, 'DELETE');
      
      const currentCache = await getCachedList(CACHE_KEY);
      const updatedCache = currentCache.filter(item => item.id !== id);
      await cacheList(CACHE_KEY, updatedCache);
      
      return { 
        ok: true, 
        offline: true, 
        message: 'Eliminación guardada localmente.'
      };
    }
    
    throw error;
  }
}

// Sincronizar inventarios pendientes (llamado automáticamente cuando vuelve internet)
export async function syncPendingInventarios() {
  const pendientes = await getPendingRequests('inventario');
  let sincronizados = 0;
  let errores = 0;
  
  for (const req of pendientes) {
    try {
      let response;
      if (req.method === 'POST') {
        response = await api.post(req.url, req.data);
      } else if (req.method === 'PUT') {
        response = await api.put(req.url, req.data);
      } else if (req.method === 'DELETE') {
        response = await api.delete(req.url);
      }
      
      if (response?.data?.ok) {
        await markAsSynced(req.id);
        sincronizados++;
        
        // Actualizar caché después de sincronizar
        if (req.method !== 'DELETE') {
          const freshData = await api.get('/inventarios');
          await cacheList(CACHE_KEY, freshData.data.data || []);
        } else {
          // Para DELETE, solo refrescar caché
          const freshData = await api.get('/inventarios');
          await cacheList(CACHE_KEY, freshData.data.data || []);
        }
      } else {
        errores++;
      }
    } catch (error) {
      errores++;
      console.error(`Error sincronizando inventario ${req.id}:`, error);
    }
  }
  
  return { sincronizados, errores, total: pendientes.length };
}

// Limpiar caché de inventarios (útil para forzar refresco)
export async function clearInventariosCache() {
  await cacheList(CACHE_KEY, []);
  console.log('[Cache] Inventarios cache limpiado');
}