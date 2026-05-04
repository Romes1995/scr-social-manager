import { useState, useRef, useEffect } from 'react';
import { importFFF } from '../services/api';
import './TopNav.css';

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

const NAV_GROUPS = [
  { id: 'home', label: 'Accueil' },
  {
    id: 'generations', label: 'Générations',
    children: [
      { id: 'programme',   label: 'Programme',   icon: '📅' },
      { id: 'matchday',    label: 'Match Day',    icon: '🏟️' },
      { id: 'convocation', label: 'Convocation',  icon: '📨' },
    ],
  },
  { id: 'score_live', label: 'Score Live' },
  {
    id: 'publications', label: 'Publications',
    children: [
      { id: 'resultats', label: 'Résultats', icon: '🏆' },
      { id: 'listes',    label: 'Listes',    icon: '📋' },
    ],
  },
  {
    id: 'gestion', label: 'Gestion',
    children: [
      { id: 'templates', label: 'Templates', icon: '🎨' },
    ],
  },
];

function activeGroup(activeTab) {
  for (const g of NAV_GROUPS) {
    if (g.id === activeTab) return g.id;
    if (g.children?.some(c => c.id === activeTab)) return g.id;
  }
  return null;
}

export default function TopNav({ activeTab, setActiveTab }) {
  const [openMenu,     setOpenMenu]     = useState(null);
  const [importing,    setImporting]    = useState(false);
  const [importAlert,  setImportAlert]  = useState(null);
  const [logoError,    setLogoError]    = useState(false);
  const navRef = useRef(null);
  const curGroup = activeGroup(activeTab);

  // Ferme le dropdown sur clic extérieur
  useEffect(() => {
    if (!openMenu) return;
    const close = (e) => { if (navRef.current && !navRef.current.contains(e.target)) setOpenMenu(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [openMenu]);

  const navigate = (tabId) => {
    setActiveTab(tabId);
    setOpenMenu(null);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await importFFF();
      const nb = res.data?.nouveaux ?? res.data?.importes ?? '?';
      setImportAlert({ type: 'ok', msg: `${nb} match(s) importé(s)` });
    } catch {
      setImportAlert({ type: 'err', msg: 'Erreur import FFF' });
    } finally {
      setImporting(false);
      setTimeout(() => setImportAlert(null), 4000);
    }
  };

  return (
    <>
      <header className="topnav" ref={navRef}>
        <div className="topnav-inner">

          {/* Logo */}
          <button className="topnav-logo" onClick={() => navigate('home')}>
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
              const isActive   = curGroup === group.id;
              const hasChildren = !!group.children;
              const isOpen     = openMenu === group.id;

              if (!hasChildren) {
                return (
                  <button
                    key={group.id}
                    className={`topnav-item${isActive ? ' topnav-item--active' : ''}`}
                    onClick={() => navigate(group.id)}
                  >
                    {group.label}
                  </button>
                );
              }

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
                      {group.children.map(child => (
                        <button
                          key={child.id}
                          className={`topnav-dropdown-item${activeTab === child.id ? ' topnav-dropdown-item--active' : ''}`}
                          onClick={() => navigate(child.id)}
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
          </nav>

          {/* Actions */}
          <div className="topnav-actions">
            <button
              className="topnav-btn topnav-btn--ghost"
              onClick={handleImport}
              disabled={importing}
            >
              {importing ? '⏳' : '⬇'} Import FFF
            </button>
            <button
              className="topnav-btn topnav-btn--gold"
              onClick={() => navigate('resultats')}
            >
              Publier
            </button>
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
