import { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

function parseStoredUser() {
  try {
    const raw = localStorage.getItem('scr_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('scr_token'));
  const [user,  setUser]  = useState(parseStoredUser);

  const login = useCallback((newToken, newUser) => {
    localStorage.setItem('scr_token', newToken);
    localStorage.setItem('scr_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('scr_token');
    localStorage.removeItem('scr_user');
    setToken(null);
    setUser(null);
  }, []);

  const isAuthenticated = !!token && !!user;

  const hasRole = useCallback((roles) => {
    if (!user) return false;
    return Array.isArray(roles) ? roles.includes(user.role) : user.role === roles;
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return ctx;
}
