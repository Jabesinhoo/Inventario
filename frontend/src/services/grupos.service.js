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

export async function getUsuariosDisponiblesParaGrupo(grupoId) {
  const response = await api.get(`/grupos/${grupoId}/usuarios-disponibles`);
  return response.data.data;
}

export async function getLideresDisponiblesParaGrupo(grupoId) {
  const response = await api.get(`/grupos/${grupoId}/lideres-disponibles`);
  return response.data.data;
}

export async function asignarUsuarioAGrupo(usuarioId, grupoId, esLider = false) {
  const response = await api.post('/grupos/asignar-usuario', { usuarioId, grupoId, esLider });
  return response.data;
}

export async function removerUsuarioDeGrupo(usuarioId, grupoId) {
  const response = await api.post('/grupos/remover-usuario', { usuarioId, grupoId });
  return response.data;
}