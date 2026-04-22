import api from './api';

export async function getRondas(params = {}) {
  const response = await api.get('/rondas', { params });
  return response.data.data;
}

// Alias para compatibilidad con EscaneoPage
export async function getRondasActivas(inventarioId, zonaId) {
  return getRondas({ inventarioId, zonaId });
}

export async function getRonda(id) {
  const response = await api.get(`/rondas/${id}`);
  return response.data.data;
}

export async function createRonda(payload) {
  const response = await api.post('/rondas', payload);
  return response.data.data;
}

export async function iniciarRonda(id) {
  const response = await api.patch(`/rondas/${id}/iniciar`);
  return response.data;
}

export async function pausarRonda(id) {
  const response = await api.patch(`/rondas/${id}/pausar`);
  return response.data;
}

export async function reanudarRonda(id) {
  const response = await api.patch(`/rondas/${id}/reanudar`);
  return response.data;
}

export async function cerrarRonda(id) {
  const response = await api.patch(`/rondas/${id}/cerrar`);
  return response.data;
}

export async function getPendientesRonda(id) {
  const response = await api.get(`/rondas/${id}/pendientes`);
  return response.data.data;
}

export async function conciliarRonda(id) {
  const response = await api.post(`/rondas/${id}/conciliar`);
  return response.data;
}

export async function getRondaActivaDelGrupo(grupoId) {
  const response = await api.get('/rondas/activa', { params: { grupoId } });
  return response.data.data;
}