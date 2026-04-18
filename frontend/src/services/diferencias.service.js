import api from './api';

export async function getInicialVsConteo1(inventarioId, grupoId) {
  const response = await api.get('/diferencias/inicial-vs-conteo1', {
    params: { inventarioId, grupoId }
  });
  return response.data.data;
}

export async function getConteo1VsConteo2(inventarioId, grupoId) {
  const response = await api.get('/diferencias/conteo1-vs-conteo2', {
    params: { inventarioId, grupoId }
  });
  return response.data.data;
}

export async function updateDiscrepanciaManual(data) {
  const response = await api.post('/diferencias/ajuste-manual', data);
  return response.data;
}