import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { clearSession, getToken, getUser, saveSession } from '../utils/storage';

export function useAuth() {
  const [user, setUser] = useState(getUser());
  const [token, setToken] = useState(getToken());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSession() {
      const savedToken = getToken();

      if (!savedToken) {
        setLoading(false);
        return;
      }

      try {
        const response = await api.get('/auth/me');
        setUser(response.data.user);
        setToken(savedToken);
      } catch (error) {
        clearSession();
        setUser(null);
        setToken(null);
      } finally {
        setLoading(false);
      }
    }

    loadSession();
  }, []);

  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    const { token: newToken, user: newUser } = response.data;

    saveSession(newToken, newUser);
    setToken(newToken);
    setUser(newUser);

    return newUser;
  };

  const logout = () => {
    clearSession();
    setToken(null);
    setUser(null);
  };

  return useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: !!token,
      login,
      logout
    }),
    [user, token, loading]
  );
}