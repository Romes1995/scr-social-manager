import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { loginUser } from '../services/api';
import './Login.css';

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

const ROLE_HOME = {
  admin:        '/',
  gestionnaire: '/programme',
  coach:        '/convocation',
  score_live:   '/score-live',
};

function homeForRole(role) {
  return ROLE_HOME[role] ?? '/programme';
}

export default function Login() {
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  // Déjà connecté → redirection vers la page principale du rôle
  if (isAuthenticated) return <Navigate to={homeForRole(user?.role)} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await loginUser({ username: username.trim(), password });
      login(data.token, data.user);
      navigate(homeForRole(data.user.role), { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Identifiants invalides');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <img
            src={`${API_BASE}/uploads/logos/scr.png`}
            alt="SCR"
            className="login-logo-img"
            onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
          />
          <span className="login-logo-badge" style={{ display: 'none' }}>SCR</span>
        </div>

        <h1 className="login-title">SCR Social Manager</h1>
        <p className="login-subtitle">SC Roeschwoog · Espace administration</p>

        <form onSubmit={handleSubmit} className="login-form" noValidate>
          <div className="login-field">
            <label htmlFor="login-username">Nom d'utilisateur</label>
            <input
              id="login-username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              disabled={loading}
            />
          </div>
          <div className="login-field">
            <label htmlFor="login-password">Mot de passe</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          {error && <div className="login-error" role="alert">{error}</div>}

          <button type="submit" className="login-btn" disabled={loading || !username || !password}>
            {loading ? <span className="login-spinner" /> : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
