import { useState, useEffect, useMemo } from 'react';
import { getClassementParEquipe, getButeursParEquipe } from '../services/api';
import './Classements.css';

const TEAMS = [
  { name: 'SCR 1', color: '#3dff6e' },
  { name: 'SCR 2', color: '#5500ff' },
  { name: 'SCR 3', color: '#00bf63' },
];

function hexAlpha(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ── Table classement par division ─────────────────────────────────────────────
function DivisionTable({ team, division, rows, loading }) {
  const { name, color } = team;

  return (
    <div className="cl-card" style={{ borderTopColor: color }}>
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
                <tr
                  key={row.equipe}
                  style={row.isSCR ? {
                    background: hexAlpha(color, 0.22),
                    borderLeft: `3px solid ${color}`,
                  } : undefined}
                >
                  <td className="cl-td-rank" style={row.isSCR ? { color } : undefined}>
                    {i + 1}
                  </td>
                  <td
                    className="cl-td-name"
                    title={row.equipe}
                    style={row.isSCR ? { color, fontWeight: 700 } : undefined}
                  >
                    {row.isSCR && (
                      <span className="cl-scr-dot" style={{ background: color }} />
                    )}
                    {row.equipe}
                  </td>
                  <td
                    className="cl-td-num cl-td-pts"
                    style={row.isSCR ? { color } : undefined}
                  >
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
function ButeursSection({ buteurs, loading, classement }) {
  const [filter, setFilter] = useState('all');

  const divisionMap = Object.fromEntries(
    TEAMS.map(t => [t.name, classement[t.name]?.division ?? null])
  );

  const FILTER_OPTIONS = [
    { key: 'all',   label: 'Tous',  sub: null,                color: '#3dff6e' },
    { key: 'SCR 1', label: 'SCR 1', sub: divisionMap['SCR 1'], color: '#3dff6e' },
    { key: 'SCR 2', label: 'SCR 2', sub: divisionMap['SCR 2'], color: '#5500ff' },
    { key: 'SCR 3', label: 'SCR 3', sub: divisionMap['SCR 3'], color: '#00bf63' },
  ];

  // "Tous" → agrège buts par joueur (toutes équipes cumulées)
  // "SCR X" → filtre sur l'équipe, buts spécifiques à cette équipe
  const filtered = useMemo(() => {
    if (filter === 'all') {
      const map = {};
      buteurs.forEach(b => {
        if (!map[b.buteur]) {
          map[b.buteur] = {
            buteur: b.buteur,
            buts: 0,
            equipe: b.equipe,
            joueur_photo: b.joueur_photo,
            _maxButs: 0,
          };
        }
        map[b.buteur].buts += b.buts;
        if (b.buts > map[b.buteur]._maxButs) {
          map[b.buteur]._maxButs = b.buts;
          map[b.buteur].equipe = b.equipe;
          map[b.buteur].joueur_photo = b.joueur_photo;
        }
      });
      return Object.values(map)
        .map(({ _maxButs, ...r }) => r)
        .sort((a, b) => b.buts - a.buts);
    }
    return buteurs
      .filter(b => b.equipe === filter)
      .sort((a, b) => b.buts - a.buts);
  }, [buteurs, filter]);

  return (
    <div className="cl-buteurs">
      <div className="cl-buteurs-header">
        <h2 className="cl-section-title">Top Buteurs</h2>
        <div className="cl-filter-tabs">
          {FILTER_OPTIONS.map(({ key, label, sub, color }) => {
            const active = filter === key;
            return (
              <button
                key={key}
                className={`cl-filter-tab${active ? ' cl-filter-tab--on' : ''}`}
                style={active ? {
                  background: hexAlpha(color, 0.18),
                  borderColor: hexAlpha(color, 0.5),
                  color,
                } : undefined}
                onClick={() => setFilter(key)}
              >
                <span className="cl-filter-label">{label}</span>
                {sub && <span className="cl-filter-sub">{sub}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="cl-loader"><div className="cl-spin" /></div>
      ) : filtered.length === 0 ? (
        <p className="cl-empty">Aucun buteur enregistré</p>
      ) : (
        <div className="cl-buteurs-grid">
          {filtered.map((b, i) => {
            const team  = TEAMS.find(t => t.name === b.equipe);
            const color = team?.color || '#3dff6e';
            const div   = divisionMap[b.equipe];
            return (
              <div key={`${b.buteur}-${b.equipe}-${i}`} className="cl-scorer">
                <span className="cl-scorer-rank" style={{ color }}>#{i + 1}</span>
                <div className="cl-scorer-info">
                  <span className="cl-scorer-name">{b.buteur}</span>
                  <span className="cl-scorer-team" style={{ color }}>{b.equipe}</span>
                  {div && <span className="cl-scorer-div">{div}</span>}
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

        <ButeursSection
          buteurs={buteurs}
          loading={btLoading}
          classement={classement}
        />
      </div>
    </div>
  );
}
