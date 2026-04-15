import api from './api';

export async function getGrupos(inventarioId = '') {
  const response = await api.get('/grupos', {
    params: inventarioId ? { inventarioId } : {}
  });
  return response.data.data;
}

export async function createGrupo(payload) {
  const response = await api.post('/grupos', payload);
  return response.data.data;
}