import { useState, useEffect } from 'react';
import { getClassementParEquipe, getButeursParEquipe } from '../services/api';
import './Classements.css';

const TEAMS = [
  { name: 'SCR 1', color: '#3dff6e' },
  { name: 'SCR 2', color: '#5500ff' },
  { name: 'SCR 3', color: '#00bf63' },
];

const EQUIPE_LABELS = { 'SCR 1': 'SCR 1', 'SCR 2': 'SCR 2', 'SCR 3': 'SCR 3' };

// ── Table classement par division ─────────────────────────────────────────────
function DivisionTable({ team, division, rows, loading }) {
  const { name, color } = team;

  return (
    <div className="cl-card" style={{ '--tc': color }}>
      <div className="cl-card-header">
        <div>
          <div className="cl-card-team" style={{ color }}>{name}</div>
          {division && <div className="cl-card-div">{division}</div>}
        </div>
        {!loading && rows.length > 0 && (
          <div className="cl-card-count">{rows.length} équipe{rows.length > 1 ? 's' : ''}</div>
        )}
      </div>

      {loading ? (
        <div className="cl-loader"><div className="cl-spin" style={{ borderTopColor: color }} /></div>
      ) : rows.length === 0 ? (
        <p className="cl-empty">Classement non disponible</p>
      ) : (
        <div className="cl-table-wrap">
          <table className="cl-table">
            <thead>
              <tr>
                <th>#</th>
                <th className="cl-th-name">Équipe</th>
                <th>Pts</th>
                <th>J</th>
                <th>V</th>
                <th>N</th>
                <th>D</th>
                <th>Bp</th>
                <th>Bc</th>
                <th>Diff</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.equipe} className={row.isSCR ? 'cl-row-scr' : ''}>
                  <td className="cl-td-rank">{i + 1}</td>
                  <td className="cl-td-name" title={row.equipe}>
                    {row.isSCR && <span className="cl-scr-dot" style={{ background: color }} />}
                    {row.equipe}
                  </td>
                  <td className={`cl-td-num cl-td-pts${row.isSCR ? ' cl-td-scr-pts' : ''}`}>
                    {row.points}
                  </td>
                  <td className="cl-td-num">{row.joues}</td>
                  <td className="cl-td-num">{row.victoires}</td>
                  <td className="cl-td-num">{row.nuls}</td>
                  <td className="cl-td-num">{row.defaites}</td>
                  <td className="cl-td-num">{row.buts_pour}</td>
                  <td className="cl-td-num">{row.buts_contre}</td>
                  <td className={`cl-td-num cl-td-diff${row.diff > 0 ? ' pos' : row.diff < 0 ? ' neg' : ''}`}>
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

// ── Buteurs par équipe ────────────────────────────────────────────────────────
function ButeursSection({ buteurs, loading }) {
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all'
    ? buteurs
    : buteurs.filter(b => b.equipe === filter);

  return (
    <div className="cl-buteurs">
      <div className="cl-buteurs-header">
        <h2 className="cl-section-title">Top Buteurs</h2>
        <div className="cl-filter-tabs">
          {['all', 'SCR 1', 'SCR 2', 'SCR 3'].map(eq => (
            <button
              key={eq}
              className={`cl-filter-tab${filter === eq ? ' cl-filter-tab--on' : ''}`}
              onClick={() => setFilter(eq)}
            >
              {eq === 'all' ? 'Tous' : eq}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="cl-loader"><div className="cl-spin" /></div>
      ) : filtered.length === 0 ? (
        <p className="cl-empty">Aucun buteur enregistré</p>
      ) : (
        <div className="cl-buteurs-grid">
          {filtered.map((b, i) => {
            const team = TEAMS.find(t => t.name === b.equipe);
            const color = team?.color || '#3dff6e';
            return (
              <div key={`${b.buteur}-${b.equipe}`} className="cl-scorer">
                <span className="cl-scorer-rank" style={{ color }}>#{i + 1}</span>
                <div className="cl-scorer-info">
                  <span className="cl-scorer-name">{b.buteur}</span>
                  <span className="cl-scorer-team" style={{ color }}>{b.equipe}</span>
                </div>
                <div className="cl-scorer-buts" style={{ color }}>
                  {b.buts}
                  <span className="cl-scorer-buts-label">but{b.buts > 1 ? 's' : ''}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function Classements() {
  const [classement, setClassement] = useState({});
  const [buteurs,    setButeurs]    = useState([]);
  const [clLoading,  setClLoading]  = useState(true);
  const [btLoading,  setBtLoading]  = useState(true);

  useEffect(() => {
    getClassementParEquipe()
      .then(({ data }) => setClassement(data || {}))
      .catch(() => {})
      .finally(() => setClLoading(false));

    getButeursParEquipe()
      .then(({ data }) => setButeurs(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setBtLoading(false));
  }, []);

  return (
    <div className="cl-page">
      <div className="cl-page-inner">
        <h1 className="cl-page-title">Classements</h1>
        <p className="cl-page-sub">Saison 2024-25 · Calculé depuis les matchs enregistrés</p>

        {/* ── Tables de division ── */}
        <section className="cl-divisions">
          {TEAMS.map(team => (
            <DivisionTable
              key={team.name}
              team={team}
              division={classement[team.name]?.division}
              rows={classement[team.name]?.rows || []}
              loading={clLoading}
            />
          ))}
        </section>

        {/* ── Top buteurs ── */}
        <ButeursSection buteurs={buteurs} loading={btLoading} />
      </div>
    </div>
  );
}
