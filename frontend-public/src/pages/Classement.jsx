import { useState, useEffect } from 'react';
import { getClassement } from '../services/api';

export default function Classement() {
  const [rows, setRows]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getClassement()
      .then(r => setRows(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 24 }}>Classement</h1>
      {loading ? (
        <div className="spinner" />
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <h3>Classement non disponible</h3>
          <p>Les données seront affichées une fois les matchs enregistrés</p>
        </div>
      ) : (
        <div className="card">
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
                <th className="num">BC</th>
                <th className="num">Diff</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.equipe}>
                  <td style={{ color: 'var(--text-faint)', width: 32 }}>{i + 1}</td>
                  <td style={{ fontWeight: row.isSCR ? 700 : 400, color: row.isSCR ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {row.equipe}
                  </td>
                  <td className={`num${row.isSCR ? ' accent' : ''}`} style={{ fontWeight: 700 }}>{row.points}</td>
                  <td className="num">{row.joues}</td>
                  <td className="num">{row.victoires}</td>
                  <td className="num">{row.nuls}</td>
                  <td className="num">{row.defaites}</td>
                  <td className="num">{row.buts_pour}</td>
                  <td className="num">{row.buts_contre}</td>
                  <td className="num" style={{ color: row.diff > 0 ? 'var(--accent)' : row.diff < 0 ? 'var(--rouge)' : 'var(--text-muted)' }}>
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
