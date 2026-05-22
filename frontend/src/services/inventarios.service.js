// src/services/inventarios.service.js
import api from './api';
import { getCachedInventarios, cacheInventarios, isOnline, savePendingRequest, getPendingRequests, markAsSynced } from './offlineStorage';

// Obtener inventarios (con caché offline)
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
    
    // Guardar en caché para uso offline
    await cacheInventarios(data);
    console.log('[Online] Inventarios actualizados en caché');
    
    return data;
  } catch (error) {
    console.error('Error al obtener inventarios:', error);
    
    // Si falla la petición, intentar usar caché como respaldo
    const cached = await getCachedInventarios();
    if (cached && cached.length > 0) {
      console.log('[Respaldo] Usando caché de inventarios por error');
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
    
    // Crear un objeto temporal para mostrar en la UI
    const tempInventario = {
      ...payload,
      id: `temp_${Date.now()}`,
      esTemporal: true,
      pendingSync: true
    };
    
    // Actualizar caché local para mostrar el nuevo inventario
    const currentCache = await getCachedInventarios();
    await cacheInventarios([tempInventario, ...currentCache]);
    
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
    const currentCache = await getCachedInventarios();
    await cacheInventarios([newInventario, ...currentCache.filter(i => !i.esTemporal)]);
    
    return newInventario;
  } catch (error) {
    console.error('Error al crear inventario:', error);
    
    // Si falla por problemas de red, guardar en cola
    if (!isOnline() || error.message?.includes('Network')) {
      const pendingId = await savePendingRequest('inventario', '/inventarios', payload, 'POST');
      
      const tempInventario = {
        ...payload,
        id: `temp_${Date.now()}`,
        esTemporal: true,
        pendingSync: true
      };
      
      const currentCache = await getCachedInventarios();
      await cacheInventarios([tempInventario, ...currentCache]);
      
      return tempInventario;
    }
    
    throw error;
  }
}

// Actualizar inventario
export async function updateInventario(id, payload) {
  if (!isOnline()) {
    await savePendingRequest('inventario', `/inventarios/${id}`, payload, 'PUT');
    
    // Actualizar caché local
    const currentCache = await getCachedInventarios();
    const updatedCache = currentCache.map(item => 
      item.id === id ? { ...item, ...payload, pendingSync: true } : item
    );
    await cacheInventarios(updatedCache);
    
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
    const currentCache = await getCachedInventarios();
    const updatedCache = currentCache.map(item => 
      item.id === id ? updatedInventario : item
    );
    await cacheInventarios(updatedCache);
    
    return updatedInventario;
  } catch (error) {
    console.error('Error al actualizar inventario:', error);
    
    if (!isOnline() || error.message?.includes('Network')) {
      await savePendingRequest('inventario', `/inventarios/${id}`, payload, 'PUT');
      
      const currentCache = await getCachedInventarios();
      const updatedCache = currentCache.map(item => 
        item.id === id ? { ...item, ...payload, pendingSync: true } : item
      );
      await cacheInventarios(updatedCache);
      
      return { id, ...payload };
    }
    
    throw error;
  }
}

// Eliminar inventario
export async function deleteInventario(id) {
  if (!isOnline()) {
    await savePendingRequest('inventario', `/inventarios/${id}`, null, 'DELETE');
    
    // Actualizar caché local
    const currentCache = await getCachedInventarios();
    const updatedCache = currentCache.filter(item => item.id !== id);
    await cacheInventarios(updatedCache);
    
    return { 
      ok: true, 
      offline: true, 
      message: 'Eliminación guardada localmente. Se sincronizará después.'
    };
  }
  
  try {
    const response = await api.delete(`/inventarios/${id}`);
    
    // Actualizar caché
    const currentCache = await getCachedInventarios();
    const updatedCache = currentCache.filter(item => item.id !== id);
    await cacheInventarios(updatedCache);
    
    return response.data;
  } catch (error) {
    console.error('Error al eliminar inventario:', error);
    
    if (!isOnline() || error.message?.includes('Network')) {
      await savePendingRequest('inventario', `/inventarios/${id}`, null, 'DELETE');
      
      const currentCache = await getCachedInventarios();
      const updatedCache = currentCache.filter(item => item.id !== id);
      await cacheInventarios(updatedCache);
      
      return { ok: true, offline: true };
    }
    
    throw error;
  }
}

// Sincronizar inventarios pendientes
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
      
      if (response?.data?.ok !== false) {
        await markAsSynced(req.id);
        sincronizados++;
      } else {
        errores++;
      }
    } catch (error) {
      errores++;
      console.error(`Error sincronizando inventario ${req.id}:`, error);
    }
  }
  
  // Refrescar caché después de sincronizar
  if (sincronizados > 0 && isOnline()) {
    try {
      const freshData = await api.get('/inventarios');
      await cacheInventarios(freshData.data.data || []);
    } catch (error) {
      console.error('Error refrescando caché después de sincronizar:', error);
    }
  }
  
  return { sincronizados, errores, total: pendientes.length };
}