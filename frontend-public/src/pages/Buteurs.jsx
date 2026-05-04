import { useState, useEffect } from 'react';
import { getButeurs, getClassement, API_BASE_URL } from '../services/api';

function ButeursTable({ data }) {
  if (!data.length) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucun buteur enregistré</p>;
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Joueur</th>
          <th>Équipe</th>
          <th className="num">Buts</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={`${row.buteur}-${row.equipe}`}>
            <td style={{ color: i < 3 ? 'var(--accent)' : 'var(--text-faint)', fontWeight: 700, width: 32 }}>
              {i + 1}
            </td>
            <td>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {row.joueur_photo && (
                  <img
                    src={`${API_BASE_URL}/uploads/joueurs/${row.joueur_photo}`}
                    alt=""
                    style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid var(--border)' }}
                  />
                )}
                <span style={{ fontWeight: 600, color: i < 3 ? 'var(--text)' : 'var(--text-muted)' }}>
                  {row.buteur}
                </span>
              </div>
            </td>
            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.equipe}</td>
            <td className={`num ${i < 3 ? 'accent' : ''}`} style={{ fontWeight: 700 }}>{row.buts}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ClassementTable({ data }) {
  if (!data.length) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Classement non disponible</p>;
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Équipe</th>
          <th className="num">Pts</th>
          <th className="num">J</th>
          <th className="num">G</th>
          <th className="num">N</th>
          <th className="num">P</th>
          <th className="num">BP</th>
          <th className="num">Diff</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={row.equipe}>
            <td style={{ color: 'var(--text-faint)', width: 32 }}>{i + 1}</td>
            <td style={{ fontWeight: row.isSCR ? 700 : 400, color: row.isSCR ? 'var(--accent)' : 'var(--text-muted)' }}>
              {row.equipe}
            </td>
            <td className={`num ${row.isSCR ? 'accent' : ''}`} style={{ fontWeight: 700 }}>{row.points}</td>
            <td className="num">{row.joues}</td>
            <td className="num">{row.victoires}</td>
            <td className="num">{row.nuls}</td>
            <td className="num">{row.defaites}</td>
            <td className="num">{row.buts_pour}</td>
            <td className="num" style={{ color: row.diff > 0 ? 'var(--accent)' : row.diff < 0 ? 'var(--rouge)' : 'var(--text-muted)' }}>
              {row.diff > 0 ? `+${row.diff}` : row.diff}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Buteurs() {
  const [tab, setTab]               = useState('buteurs');
  const [buteurs, setButeurs]       = useState([]);
  const [classement, setClassement] = useState([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    Promise.all([getButeurs(), getClassement()])
      .then(([b, c]) => { setButeurs(b.data); setClassement(c.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 20 }}>Buteurs</h1>

      <div className="tabs">
        <button className={`tab-btn${tab === 'buteurs' ? ' active' : ''}`} onClick={() => setTab('buteurs')}>
          Buteurs SCR
        </button>
        <button className={`tab-btn${tab === 'classement' ? ' active' : ''}`} onClick={() => setTab('classement')}>
          Classement division
        </button>
      </div>

      {loading ? (
        <div className="spinner" />
      ) : (
        <div className="card">
          {tab === 'buteurs'
            ? <ButeursTable data={buteurs} />
            : <ClassementTable data={classement} />
          }
        </div>
      )}
    </div>
  );
}
