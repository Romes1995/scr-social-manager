import { useState } from 'react';
import './HeaderVitrine.css';

const TEAMS = [
  { label: 'SCR 1', color: '#3dff6e' },
  { label: 'SCR 2', color: '#5500ff' },
  { label: 'SCR 3', color: '#00bf63' },
];

export default function HeaderVitrine({ activeTeam, setActiveTeam }) {
  const [open, setOpen] = useState(false);

  const selectTeam = (i) => {
    setActiveTeam(i);
    setOpen(false);
  };

  return (
    <>
      <header className="vh">
        <div className="vh-brand">
          <div className="vh-badge">SCR</div>
          <div className="vh-name">
            <span className="vh-name-main">Sporting Club</span>
            <span className="vh-name-sub">de Roeschwoog</span>
          </div>
        </div>

        <button className="vh-burger" onClick={() => setOpen(v => !v)} aria-label="Menu">
          <span />
          <span />
          <span />
        </button>
      </header>

      {/* Overlay */}
      {open && <div className="vh-overlay" onClick={() => setOpen(false)} />}

      {/* Drawer */}
      <div className={`vh-drawer${open ? ' vh-drawer--open' : ''}`}>
        <div className="vh-drawer-top">
          <span className="vh-drawer-title">Équipes</span>
          <button className="vh-drawer-close" onClick={() => setOpen(false)}>✕</button>
        </div>
        {TEAMS.map((t, i) => (
          <button
            key={t.label}
            className={`vh-drawer-team${activeTeam === i ? ' active' : ''}`}
            style={activeTeam === i ? { color: t.color, borderLeftColor: t.color } : {}}
            onClick={() => selectTeam(i)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </>
  );
}
