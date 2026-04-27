import api from './api';

export const authService = {
  login: (identificador, password) =>
    api.post('/auth/login', { identificador, password }),

  register: (userData) => api.post('/auth/register', userData),
  getCurrentUser: () => api.get('/auth/me'),

  logout: () => {
    localStorage.removeItem('inventario_token');
    localStorage.removeItem('inventario_user');
    delete api.defaults.headers.common['Authorization'];
  }
};