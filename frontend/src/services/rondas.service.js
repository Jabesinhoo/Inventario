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

export async function reabrirRonda(id) {
  const response = await api.patch(`/rondas/${id}/reabrir`);
  return response.data.data;
}

export async function getMisRondasParaEscaneo(inventarioId) {
  const response = await api.get('/rondas/mis-rondas', {
    params: { inventarioId }
  });
  return response.data.data;
}
export async function deleteRonda(id) {
  const { data } = await api.delete(`/rondas/${id}`);
  return data;
}

export async function abrirTodasRondas(inventarioId) {
  const { data } = await api.patch(`/rondas/inventario/${inventarioId}/abrir-todas`);
  return data;
}

export async function pausarTodasRondas(inventarioId) {
  const { data } = await api.patch(`/rondas/inventario/${inventarioId}/pausar-todas`);
  return data;
}

export async function cerrarTodasRondas(inventarioId) {
  const { data } = await api.patch(`/rondas/inventario/${inventarioId}/cerrar-todas`);
  return data;
}

export async function getRondaActivaDelGrupo(inventarioId, grupoId = null) {
  const params = {};

  if (inventarioId) params.inventarioId = inventarioId;
  if (grupoId) params.grupoId = grupoId;

  const response = await api.get('/rondas/activa', { params });
  return response.data.data;
}