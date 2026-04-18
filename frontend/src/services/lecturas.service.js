import api from './api';

export async function scanLectura(payload) {
  const response = await api.post('/lecturas/scan', payload);
  return response.data;
}

export async function scanLecturaRonda(payload) {
  const response = await api.post('/lecturas/scan-ronda', payload);
  return response.data;
}

export async function anularLectura(id) {
  const response = await api.delete(`/lecturas/${id}`);
  return response.data;
}

export async function getResumenLecturas(params = {}) {
  const response = await api.get('/lecturas/resumen', { params });
  return response.data.data;
}

export async function getHistorialLecturas(params = {}) {
  const response = await api.get('/lecturas/historial', { params });
  return response.data.data;
}

export async function getEstadisticasGrupo(params = {}) {
  const response = await api.get('/lecturas/estadisticas-grupo', { params });
  return response.data.data;
}

export async function exportarResultadosGrupo(params = {}) {
  const response = await api.get('/lecturas/exportar-grupo', { params });
  return response.data;
}