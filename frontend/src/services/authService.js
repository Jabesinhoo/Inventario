import api from './api'

export const authService = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (userData) => api.post('/auth/register', userData),
  getCurrentUser: () => api.get('/auth/me'),
  logout: () => {
    localStorage.removeItem('token')
    delete api.defaults.headers.common['Authorization']
  },
}