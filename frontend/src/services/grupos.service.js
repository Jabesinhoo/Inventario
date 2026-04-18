import api from './api';

export async function getGrupos(inventarioId = '') {
  const response = await api.get('/grupos', {
    params: inventarioId ? { inventarioId } : {}
  });
  return response.data.data;
}

export async function getGrupo(id) {
  const response = await api.get(`/grupos/${id}`);
  return response.data.data;
}

export async function createGrupo(payload) {
  const response = await api.post('/grupos', payload);
  return response.data.data;
}

export async function updateGrupo(id, payload) {
  const response = await api.put(`/grupos/${id}`, payload);
  return response.data.data;
}

export async function deleteGrupo(id) {
  const response = await api.delete(`/grupos/${id}`);
  return response.data;
}

export async function getGrupoEstadisticas(id) {
  const response = await api.get(`/grupos/${id}/estadisticas`);
  return response.data.data;
}

export async function getRondaActivaDelGrupo(grupoId) {
  const response = await api.get('/rondas/activa', { params: { grupoId } });
  return response.data.data;
}