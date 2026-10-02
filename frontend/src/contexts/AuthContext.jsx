import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMe, loginUser, logoutUser } from '../services/api';

// Session portée par un cookie httpOnly posé par l'API : le frontend ne voit
// jamais le jeton, il demande simplement /auth/me pour savoir qui est connecté.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then(({ data }) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, motDePasse) => {
    const { data } = await loginUser({ username, mot_de_passe: motDePasse });
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try { await logoutUser(); } finally { setUser(null); }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return ctx;
}
