import { useState, useEffect } from 'react';
import { getVitrineData, API_BASE_URL } from '../services/api';
import './VitrineGrid.css';

const TEAMS = [
  { id: 1, label: 'SCR 1', color: '#3dff6e' },
  { id: 2, label: 'SCR 2', color: '#5500ff' },
  { id: 3, label: 'SCR 3', color: '#00bf63' },
];

// Zones par défaut pour les classements de district
const PROMO_PLACES = 2;
const RELEG_PLACES = 2;

const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MOIS  = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return `${JOURS[dt.getUTCDay()]} ${dt.getUTCDate()} ${MOIS[dt.getUTCMonth()]}`;
}

function fmtHeure(h) {
  if (!h) return '';
  return String(h).slice(0, 5);
}

function initials(name) {
  return (name || '').trim().split(/\s+/).map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function countdown(dateStr) {
  if (!dateStr) return null;
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
  const diff   = Math.round((target - today) / 86400000);
  if (diff < 0)  return null;
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Demain';
  return `J−${diff}`;
}

// ── Colonne 1 : Classement complet ───────────────────────────────────────────

function Classement({ ranking, color }) {
  if (!ranking?.rows?.length) {
    return (
      <div className="vg-col">
        <div className="vg-col-title">Classement</div>
        <div className="vg-empty">Classement indisponible</div>
      </div>
    );
  }

  const rows  = ranking.rows;
  const total = rows.length;

  return (
    <div className="vg-col">
      <div className="vg-col-title">
        Classement
        {ranking.division && (
          <span className="vg-division" style={{ color }}> {ranking.division}</span>
        )}
      </div>

      <table className="vg-table">
        <thead>
          <tr>
            <th className="vg-th-rank">#</th>
            <th>Club</th>
            <th className="vg-th-r">Pts</th>
            <th className="vg-th-r">J</th>
            <th className="vg-th-r">+/−</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const rank     = idx + 1;
            const isPromo  = rank <= PROMO_PLACES;
            const isReleg  = rank > total - RELEG_PLACES;
            const isSCR    = row.isSCR;
            const diff     = row.diff ?? (row.buts_pour - row.buts_contre);

            return (
              <tr
                key={idx}
                className={[
                  'vg-row',
                  isSCR   ? 'vg-row--scr'   : '',
                  isPromo ? 'vg-row--promo'  : '',
                  isReleg ? 'vg-row--releg'  : '',
                ].filter(Boolean).join(' ')}
              >
                <td className="vg-rank">{rank}</td>
                <td className="vg-club-name">{row.equipe}</td>
                <td className="vg-r"><strong>{row.points}</strong></td>
                <td className="vg-r">{row.joues}</td>
                <td className={`vg-r vg-diff${diff > 0 ? ' pos' : diff < 0 ? ' neg' : ''}`}>
                  {diff > 0 ? '+' : ''}{diff}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="vg-legend">
        <span className="vg-legend-item vg-legend--promo">Montée</span>
        <span className="vg-legend-item vg-legend--releg">Descente</span>
        <span className="vg-legend-item vg-legend--scr">SCR</span>
      </div>
    </div>
  );
}

// ── Colonne 2 : Dernier résultat ──────────────────────────────────────────────

function DernierResultat({ data }) {
  if (!data) {
    return (
      <div className="vg-card">
        <div className="vg-card-label">Dernier résultat</div>
        <div className="vg-empty">Aucun résultat enregistré</div>
      </div>
    );
  }

  const win  = data.score_scr > data.score_adv;
  const draw = data.score_scr === data.score_adv;
  const badge = win  ? { l: 'Victoire', c: '#3dff6e', bg: 'rgba(61,255,110,0.14)' }
              : draw ? { l: 'Nul',      c: '#f97316', bg: 'rgba(249,115,22,0.14)'  }
                     : { l: 'Défaite',  c: '#ef4444', bg: 'rgba(239,68,68,0.14)'   };

  // Dédoublonner + compter les buts par joueur
  const buteursMap = {};
  (data.buteurs || []).forEach(b => {
    const k = (b || '').trim();
    if (k) buteursMap[k] = (buteursMap[k] || 0) + 1;
  });

  return (
    <div className="vg-card">
      <div className="vg-card-label">Dernier résultat</div>

      <div className="vg-score-row">
        <span className="vg-score">{data.score_scr} – {data.score_adv}</span>
        <span className="vg-result-badge" style={{ color: badge.c, background: badge.bg }}>
          {badge.l}
        </span>
      </div>

      <div className="vg-adv-row">
        {data.logo_adversaire_local
          ? <img src={`${API_BASE_URL}${data.logo_adversaire_local}`} alt="" className="vg-logo" />
          : <div className="vg-logo-ph" />}
        <span className="vg-adv">{data.adversaire}</span>
      </div>

      {Object.keys(buteursMap).length > 0 && (
        <div className="vg-buteurs">
          {Object.entries(buteursMap).map(([nom, n], i) => (
            <span key={i} className="vg-buteur">
              ⚽ {nom}{n > 1 ? ` ×${n}` : ''}
            </span>
          ))}
        </div>
      )}

      <div className="vg-meta">
        <span className={`vg-badge-sm ${data.domicile !== false ? 'dom' : 'ext'}`}>
          {data.domicile !== false ? '🏠 Domicile' : '✈️ Extérieur'}
        </span>
        {data.date && <span>{fmtDate(data.date)}</span>}
        {data.lieu && <span className="vg-lieu">📍 {data.lieu}</span>}
      </div>
    </div>
  );
}

// ── Colonne 2 : Prochain match ────────────────────────────────────────────────

function ProchainMatch({ data, color }) {
  if (!data) {
    return (
      <div className="vg-card">
        <div className="vg-card-label">Prochain match</div>
        <div className="vg-empty">Aucun match programmé</div>
      </div>
    );
  }

  const cd = countdown(data.date);

  return (
    <div className="vg-card">
      <div className="vg-card-label">Prochain match</div>

      {cd && (
        <div className="vg-countdown" style={{ color }}>{cd}</div>
      )}

      <div className="vg-adv-row">
        {data.logo_adversaire_local
          ? <img src={`${API_BASE_URL}${data.logo_adversaire_local}`} alt="" className="vg-logo" />
          : <div className="vg-logo-ph" />}
        <span className="vg-adv vg-adv--lg">{data.adversaire}</span>
      </div>

      <div className="vg-meta">
        <span className={`vg-badge-sm ${data.domicile !== false ? 'dom' : 'ext'}`}>
          {data.domicile !== false ? '🏠 Domicile' : '✈️ Extérieur'}
        </span>
        <span>
          {fmtDate(data.date)}{data.heure ? ` · ${fmtHeure(data.heure)}` : ''}
        </span>
      </div>

      {data.lieu && <div className="vg-lieu">📍 {data.lieu}</div>}
      {data.division && <div className="vg-division-tag">{data.division}</div>}
    </div>
  );
}

// ── Colonne 3 : Meilleur buteur ───────────────────────────────────────────────

function MeilleurButeur({ data, color }) {
  if (!data) {
    return (
      <div className="vg-col">
        <div className="vg-col-title">Meilleur buteur</div>
        <div className="vg-empty">Aucun buteur enregistré</div>
      </div>
    );
  }

  const ini = initials(data.nom);

  return (
    <div className="vg-col">
      <div className="vg-col-title">Meilleur buteur</div>

      <div className="vg-scorer-header">
        <div className="vg-scorer-avatar" style={{ borderColor: color, background: `${color}15` }}>
          {data.photo
            ? <img src={`${API_BASE_URL}${data.photo}`} alt={data.nom} />
            : <span style={{ color }}>{ini}</span>}
        </div>
        <div className="vg-scorer-info">
          <div className="vg-scorer-name">{data.nom}</div>
          {data.categorie && <div className="vg-scorer-cat">{data.categorie}</div>}
          <div className="vg-scorer-total" style={{ color }}>
            {data.buts} but{data.buts > 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {data.matchs?.length > 0 && (
        <div className="vg-scorer-matchs">
          <div className="vg-scorer-matchs-label">Buts par match</div>
          {data.matchs.map((m, i) => (
            <div key={i} className="vg-scorer-match">
              <div className="vg-scorer-match-info">
                <span className="vg-scorer-match-adv">vs {m.adversaire}</span>
                <span className="vg-scorer-match-meta">
                  {fmtDate(m.date)}{m.division ? ` · ${m.division}` : ''}
                </span>
              </div>
              <div className="vg-scorer-match-buts">
                {Array.from({ length: m.nb_buts }).map((_, j) => (
                  <span key={j} className="vg-goal-dot" style={{ color }}>⚽</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Grille principale ─────────────────────────────────────────────────────────

export default function VitrineGrid({ activeTeam }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const team = TEAMS[activeTeam] ?? TEAMS[0];

  useEffect(() => {
    getVitrineData(team.id)
      .then(r => { setData(r.data); setError(null); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  // key={activeTeam} in parent resets this component on team change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="vg-state">
        <div className="spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="vg-state vg-state--error">
        Erreur de chargement
      </div>
    );
  }

  return (
    <div className="vg-section">
      <div className="vg-grid">
        {/* Col 1 — Classement */}
        <Classement ranking={data?.ranking} color={team.color} />

        {/* Col 2 — Résultat + Prochain */}
        <div className="vg-col vg-col--middle">
          <DernierResultat data={data?.lastResult} />
          <ProchainMatch   data={data?.nextMatch} color={team.color} />
        </div>

        {/* Col 3 — Meilleur buteur */}
        <MeilleurButeur data={data?.meilleurButeur} color={team.color} />
      </div>
    </div>
  );
}
