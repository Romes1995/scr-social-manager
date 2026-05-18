import { useState, useEffect } from 'react';
import { getButeursParEquipe, API_BASE_URL } from '../services/api';

const TEAMS = [
  { name: 'SCR 1', accent: '#51946a' },
  { name: 'SCR 2', accent: '#5500ff' },
  { name: 'SCR 3', accent: '#00bf63' },
];

function EquipeButeurs({ team, rows }) {
  const { name, accent } = team;
  return (
    <div className="card" style={{ borderTopColor: accent, borderTopWidth: 2 }}>
      <div style={{ fontWeight: 800, fontSize: 14, color: accent, marginBottom: 16, paddingBottom: 10, borderBottom: '0.5px solid var(--border)' }}>
        {name}
      </div>

      {rows.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Aucun buteur enregistré</p>
      ) : (
        rows.map((row, i) => (
          <div
            key={row.buteur}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 0',
              borderBottom: i < rows.length - 1 ? '0.5px solid var(--border)' : 'none',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: i < 3 ? accent : 'var(--text-faint)', minWidth: 18, textAlign: 'right', flexShrink: 0 }}>
              {i + 1}
            </span>
            {row.joueur_photo ? (
              <img
                src={`${API_BASE_URL}${row.joueur_photo}`}
                alt=""
                style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid var(--border)', flexShrink: 0 }}
              />
            ) : null}
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: i < 3 ? 'var(--text)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.buteur}
            </span>
            <span style={{ fontSize: 13, fontWeight: 800, color: accent, flexShrink: 0 }}>
              {row.buts}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

export default function Buteurs() {
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getButeursParEquipe()
      .then(r => setData(r.data))
      .catch(err => console.error('[Buteurs]', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 24 }}>Buteurs</h1>
      {loading ? <div className="spinner" /> : (
        <div className="home-grid">
          {TEAMS.map(team => (
            <EquipeButeurs
              key={team.name}
              team={team}
              rows={data.filter(r => r.equipe === team.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
