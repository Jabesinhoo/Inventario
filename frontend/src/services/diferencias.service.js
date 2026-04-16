import api from './api';

export async function getInicialVsConteo1(inventarioId) {
  const response = await api.get('/diferencias/inicial-vs-conteo1', {
    params: { inventarioId }
  });

  return response.data.data;
}

export async function getConteo1VsConteo2(inventarioId) {
  const response = await api.get('/diferencias/conteo1-vs-conteo2', {
    params: { inventarioId }
  });

  return response.data.data;
}