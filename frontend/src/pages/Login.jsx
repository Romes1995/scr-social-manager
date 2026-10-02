import { useState } from 'react';
import { useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

// Page demandée avant la connexion (chemin interne uniquement)
function pageDeSuite(params) {
  const suite = params.get('suite');
  return suite && suite.startsWith('/') && !suite.startsWith('//') && !suite.startsWith('/login') ? suite : '/';
}

export default function Login() {
  const { login, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const suite = pageDeSuite(params);

  // Déjà connecté → page demandée
  if (!authLoading && isAuthenticated) return <Navigate to={suite} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username.trim(), password);
      navigate(suite, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Connexion impossible');
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
