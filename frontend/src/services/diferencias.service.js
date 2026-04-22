import api from './api';

export async function compareInventarios(params) {
  const response = await api.get('/diferencias/comparar-inventarios', {
    params
  });
  return response.data.data;
}

export async function generarRondaReconteoDesdeComparacion(payload) {
  const response = await api.post('/diferencias/generar-reconteo', payload);
  return response.data;
}

export async function updateDiscrepanciaManual(data) {
  const response = await api.post('/diferencias/ajuste-manual', data);
  return response.data;
}