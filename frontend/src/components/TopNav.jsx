import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { importFFF } from '../services/api';
import './TopNav.css';

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

// Mapping tab id → path
const TAB_PATH = {
  home:       '/',
  programme:  '/programme',
  matchday:   '/matchday',
  convocation:'/convocation',
  resultats:  '/resultats',
  score_live: '/score-live',
  templates:  '/templates',
  listes:     '/listes',
};

// Mapping path → groupe actif
function activeGroupFromPath(pathname) {
  const map = {
    '/programme':   'generations',
    '/matchday':    'generations',
    '/convocation': 'generations',
    '/resultats':   'generations',
    '/score-live':  'score_live',
    '/templates':   'gestion',
    '/listes':      'gestion',
    '/admin/users': 'admin',
  };
  return map[pathname] ?? null;
}

const ROLE_LABELS = {
  admin:        'Admin',
  gestionnaire: 'Gestionnaire',
  coach:        'Coach',
  score_live:   'Score Live',
  lecteur:      'Lecteur',
};

const NAV_GROUPS = [
  { id: 'home', label: 'Accueil' },
  {
    id: 'generations', label: 'Générations',
    children: [
      { id: 'programme',    label: 'Programme',  icon: '📅', roles: ['admin','gestionnaire'] },
      { id: 'matchday',     label: 'Match Day',  icon: '🏟️', roles: ['admin','gestionnaire'] },
      { id: 'convocation',  label: 'Convocation',icon: '📨', roles: ['admin','gestionnaire','coach'] },
      { id: 'resultats',    label: 'Résultats',  icon: '🏆', roles: ['admin','gestionnaire'] },
    ],
  },
  { id: 'score_live', label: 'Score Live', roles: ['admin','gestionnaire','score_live'] },
  {
    id: 'gestion', label: 'Gestion',
    children: [
      { id: 'templates', label: 'Templates', icon: '🎨', roles: ['admin','gestionnaire'] },
      { id: 'listes',    label: 'Liste',     icon: '📋', roles: ['admin','gestionnaire'] },
    ],
  },
];

export default function TopNav() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, logout, hasRole } = useAuth();

  const [openMenu,    setOpenMenu]    = useState(null);
  const [importing,   setImporting]   = useState(false);
  const [importAlert, setImportAlert] = useState(null);
  const [logoError,   setLogoError]   = useState(false);
  const navRef = useRef(null);

  const curGroup = activeGroupFromPath(location.pathname);

  useEffect(() => {
    if (!openMenu) return;
    const close = (e) => { if (navRef.current && !navRef.current.contains(e.target)) setOpenMenu(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [openMenu]);

  const go = (tabId) => {
    navigate(TAB_PATH[tabId] ?? '/');
    setOpenMenu(null);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await importFFF();
      const nb  = res.data?.nouveaux ?? res.data?.importes ?? '?';
      setImportAlert({ type: 'ok', msg: `${nb} match(s) importé(s)` });
    } catch {
      setImportAlert({ type: 'err', msg: 'Erreur import FFF' });
    } finally {
      setImporting(false);
      setTimeout(() => setImportAlert(null), 4000);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <header className="topnav" ref={navRef}>
        <div className="topnav-inner">

          {/* Logo */}
          <button className="topnav-logo" onClick={() => go('home')}>
            {!logoError ? (
              <img
                src={`${API_BASE}/uploads/logos/scr.png`}
                alt="SCR"
                className="topnav-logo-img"
                onError={() => setLogoError(true)}
              />
            ) : (
              <span className="topnav-logo-badge">SCR</span>
            )}
            <span className="topnav-logo-text">
              <span className="topnav-logo-title">SCR Social Manager</span>
              <span className="topnav-logo-sub">SC Roeschwoog</span>
            </span>
          </button>

          {/* Nav groups */}
          <nav className="topnav-links">
            {NAV_GROUPS.map((group) => {
              // Masquer les items inaccessibles au rôle courant
              if (group.roles && !hasRole(group.roles)) return null;

              const isActive    = curGroup === group.id;
              const hasChildren = !!group.children;
              const isOpen      = openMenu === group.id;

              if (!hasChildren) {
                return (
                  <button
                    key={group.id}
                    className={`topnav-item${isActive ? ' topnav-item--active' : ''}`}
                    onClick={() => go(group.id)}
                  >
                    {group.label}
                  </button>
                );
              }

              const visibleChildren = group.children.filter(c => !c.roles || hasRole(c.roles));
              if (visibleChildren.length === 0) return null;

              return (
                <div key={group.id} className="topnav-dropdown-wrap">
                  <button
                    className={`topnav-item topnav-item--has-children${isActive ? ' topnav-item--active' : ''}${isOpen ? ' topnav-item--open' : ''}`}
                    onClick={() => setOpenMenu(isOpen ? null : group.id)}
                  >
                    {group.label}
                    <svg className="topnav-chevron" width="10" height="6" viewBox="0 0 10 6">
                      <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="topnav-dropdown">
                      {visibleChildren.map(child => (
                        <button
                          key={child.id}
                          className={`topnav-dropdown-item${location.pathname === TAB_PATH[child.id] ? ' topnav-dropdown-item--active' : ''}`}
                          onClick={() => go(child.id)}
                        >
                          <span className="topnav-dropdown-icon">{child.icon}</span>
                          {child.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Lien Admin (admin uniquement) */}
            {hasRole(['admin']) && (
              <button
                className={`topnav-item${curGroup === 'admin' ? ' topnav-item--active' : ''}`}
                onClick={() => { navigate('/admin/users'); setOpenMenu(null); }}
              >
                Admin
              </button>
            )}
          </nav>

          {/* Actions */}
          <div className="topnav-actions">
            <a
              href="http://localhost:5175/vitrine"
              target="_blank"
              rel="noopener noreferrer"
              className="topnav-btn topnav-btn--vitrine"
            >
              Site vitrine ↗
            </a>
            {hasRole(['admin', 'gestionnaire']) && (
              <button
                className="topnav-btn topnav-btn--ghost"
                onClick={handleImport}
                disabled={importing}
              >
                {importing ? '⏳' : '⬇'} Import FFF
              </button>
            )}
            <button
              className="topnav-btn topnav-btn--gold"
              onClick={() => navigate('/resultats')}
            >
              Publier
            </button>

            {/* User info + logout */}
            {user && (
              <div className="topnav-user">
                <div className="topnav-user-info">
                  <span className="topnav-user-name">{user.username}</span>
                  <span className="topnav-user-role">{ROLE_LABELS[user.role] || user.role}</span>
                </div>
                <button className="topnav-btn topnav-btn--logout" onClick={handleLogout} title="Déconnexion">
                  ⏏
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Toast import */}
      {importAlert && (
        <div className={`topnav-toast topnav-toast--${importAlert.type}`}>
          {importAlert.type === 'ok' ? '✅' : '❌'} {importAlert.msg}
        </div>
      )}
    </>
  );
}
