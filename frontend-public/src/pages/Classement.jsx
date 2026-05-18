import { useState, useEffect } from 'react';
import { getClassementParEquipe } from '../services/api';

const TEAMS = [
  { name: 'SCR 1', accent: '#51946a' },
  { name: 'SCR 2', accent: '#5500ff' },
  { name: 'SCR 3', accent: '#00bf63' },
];

function DivisionTable({ team, division, rows }) {
  const { name, accent } = team;
  return (
    <div className="card" style={{ borderTopColor: accent, borderTopWidth: 2 }}>
      <div style={{ marginBottom: 14, paddingBottom: 10, borderBottom: '0.5px solid var(--border)' }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: accent }}>{name}</div>
        {division && (
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>{division}</div>
        )}
      </div>

      {rows.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Classement non disponible</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ padding: '6px 4px' }}>#</th>
                <th style={{ padding: '6px 4px' }}>Équipe</th>
                <th className="num" style={{ padding: '6px 4px' }}>Pts</th>
                <th className="num" style={{ padding: '6px 4px' }}>J</th>
                <th className="num" style={{ padding: '6px 4px' }}>G</th>
                <th className="num" style={{ padding: '6px 4px' }}>N</th>
                <th className="num" style={{ padding: '6px 4px' }}>P</th>
                <th className="num" style={{ padding: '6px 4px' }}>BP</th>
                <th className="num" style={{ padding: '6px 4px' }}>BC</th>
                <th className="num" style={{ padding: '6px 4px' }}>Diff</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.equipe} style={row.isSCR ? { background: `${accent}12` } : {}}>
                  <td style={{ color: 'var(--text-faint)', width: 22, padding: '8px 4px' }}>{i + 1}</td>
                  <td style={{ fontWeight: row.isSCR ? 700 : 400, color: row.isSCR ? accent : 'var(--text-muted)', padding: '8px 4px', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.equipe}
                  </td>
                  <td className="num" style={{ fontWeight: 700, color: row.isSCR ? accent : undefined, padding: '8px 4px' }}>{row.points}</td>
                  <td className="num" style={{ padding: '8px 4px' }}>{row.joues}</td>
                  <td className="num" style={{ padding: '8px 4px' }}>{row.victoires}</td>
                  <td className="num" style={{ padding: '8px 4px' }}>{row.nuls}</td>
                  <td className="num" style={{ padding: '8px 4px' }}>{row.defaites}</td>
                  <td className="num" style={{ padding: '8px 4px' }}>{row.buts_pour}</td>
                  <td className="num" style={{ padding: '8px 4px' }}>{row.buts_contre}</td>
                  <td className="num" style={{ padding: '8px 4px', color: row.diff > 0 ? 'var(--accent)' : row.diff < 0 ? 'var(--rouge)' : 'var(--text-muted)' }}>
                    {row.diff > 0 ? `+${row.diff}` : row.diff}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Classement() {
  const [data, setData]       = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getClassementParEquipe()
      .then(r => setData(r.data))
      .catch(err => console.error('[Classement]', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page" style={{ maxWidth: 1060 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 24 }}>Classement</h1>
      {loading ? <div className="spinner" /> : (
        <div className="home-grid">
          {TEAMS.map(team => (
            <DivisionTable
              key={team.name}
              team={team}
              division={data[team.name]?.division}
              rows={data[team.name]?.rows || []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
