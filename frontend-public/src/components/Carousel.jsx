import { useState, useEffect } from 'react';
import { getCarousel, API_BASE_URL } from '../services/api';

// ── Config équipes ────────────────────────────────────────────────────────────
const TEAMS = [
  { id: 1, label: 'SCR 1', color: '#3dff6e' },
  { id: 2, label: 'SCR 2', color: '#5500ff' },
  { id: 3, label: 'SCR 3', color: '#00bf63' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MOIS  = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];

function fmtDate(d, h) {
  if (!d) return '—';
  const dt = new Date(d);
  const str = `${JOURS[dt.getDay()]} ${dt.getDate()} ${MOIS[dt.getMonth()]}`;
  return h ? `${str} · ${String(h).slice(0, 5)}` : str;
}

function countdown(dateStr) {
  if (!dateStr) return null;
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
  const diff   = Math.round((target - today) / 86400000);
  if (diff < 0)  return null;
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Demain';
  return `J-${diff}`;
}

function initials(name) {
  return (name || '').split(' ').filter(Boolean).map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

// Retourne max maxRows lignes centrées autour de la ligne SCR
function reducedRanking(rows, maxRows = 6) {
  if (!rows?.length) return { visible: [], topDots: false, botDots: false };
  if (rows.length <= maxRows) return { visible: rows, topDots: false, botDots: false };
  const scrIdx = rows.findIndex(r => r.isSCR);
  const pivot  = scrIdx === -1 ? 0 : scrIdx;
  let start    = Math.max(0, pivot - Math.floor(maxRows / 2));
  let end      = start + maxRows;
  if (end > rows.length) { end = rows.length; start = Math.max(0, end - maxRows); }
  return { visible: rows.slice(start, end), topDots: start > 0, botDots: end < rows.length };
}

// ── Card : Dernier résultat ───────────────────────────────────────────────────
function LastResultCard({ data, color }) {
  if (!data) return (
    <div className="cc cc--empty">
      <div className="cc-title">Dernier résultat</div>
      <span>Aucun résultat</span>
    </div>
  );

  const win   = data.score_scr > data.score_adv;
  const draw  = data.score_scr === data.score_adv;
  const badge = win  ? { label: 'V', color: '#3dff6e', bg: 'rgba(61,255,110,0.12)' }
              : draw ? { label: 'N', color: '#f97316', bg: 'rgba(249,115,22,0.12)' }
                     : { label: 'D', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };

  return (
    <div className="cc">
      <div className="cc-title">Dernier résultat</div>

      <div className="cc-score">
        <span>{data.score_scr} – {data.score_adv}</span>
        <span className="cc-vnd" style={{ color: badge.color, background: badge.bg }}>
          {badge.label}
        </span>
      </div>

      <div className="cc-club">
        {data.logo_adversaire_local && (
          <img src={`${API_BASE_URL}${data.logo_adversaire_local}`} alt="" className="cc-logo" />
        )}
        <span>{data.adversaire}</span>
      </div>

      <div className="cc-foot">
        <span className={`cc-badge${data.domicile !== false ? ' cc-badge--dom' : ' cc-badge--ext'}`}>
          {data.domicile !== false ? 'Domicile' : 'Extérieur'}
        </span>
        {data.date && (
          <span>{new Date(data.date).toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short' })}</span>
        )}
      </div>
    </div>
  );
}

// ── Card : Classement réduit ──────────────────────────────────────────────────
function RankingCard({ data, color }) {
  if (!data?.rows?.length) return (
    <div className="cc cc--empty">
      <div className="cc-title">Classement</div>
      <span>Indisponible</span>
    </div>
  );

  const { visible, topDots, botDots } = reducedRanking(data.rows, 6);

  return (
    <div className="cc">
      <div className="cc-title">
        Classement <span style={{ color, fontWeight: 600 }}>{data.division}</span>
      </div>

      <table className="cc-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Club</th>
            <th className="cc-r">Pts</th>
            <th className="cc-r">J</th>
          </tr>
        </thead>
        <tbody>
          {topDots && (
            <tr className="cc-dots"><td colSpan={4}>···</td></tr>
          )}
          {visible.map((row, i) => {
            const rank = row.rank ?? (
              (data.rows.indexOf(row)) + 1
            );
            return (
              <tr key={i} className={row.isSCR ? 'cc-scr' : ''} style={row.isSCR ? { color } : {}}>
                <td className="cc-rank">{rank}</td>
                <td className="cc-name">{row.equipe}</td>
                <td className="cc-r"><strong>{row.points}</strong></td>
                <td className="cc-r">{row.joues}</td>
              </tr>
            );
          })}
          {botDots && (
            <tr className="cc-dots"><td colSpan={4}>···</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Card : Meilleur buteur ────────────────────────────────────────────────────
function TopScorerCard({ data, color }) {
  if (!data) return (
    <div className="cc cc--empty">
      <div className="cc-title">Meilleur buteur</div>
      <span>Aucun buteur</span>
    </div>
  );

  const ini = initials(data.nom);

  return (
    <div className="cc">
      <div className="cc-title">Meilleur buteur</div>

      <div className="cc-scorer">
        <div className="cc-avatar">
          {data.photo ? (
            <img src={`${API_BASE_URL}${data.photo}`} alt={data.nom} />
          ) : (
            <div className="cc-initials" style={{ background: `${color}1a`, color }}>
              {ini}
            </div>
          )}
        </div>

        <div className="cc-scorer-info">
          <div className="cc-scorer-name">{data.nom}</div>
          {data.categorie && (
            <div className="cc-scorer-meta">{data.categorie}</div>
          )}
        </div>

        <div className="cc-scorer-buts" style={{ color }}>
          {data.buts}
          <small>but{data.buts > 1 ? 's' : ''}</small>
        </div>
      </div>
    </div>
  );
}

// ── Card : Prochain match ─────────────────────────────────────────────────────
function NextMatchCard({ data, color }) {
  if (!data) return (
    <div className="cc cc--empty">
      <div className="cc-title">Prochain match</div>
      <span>Aucun match prévu</span>
    </div>
  );

  const cd = countdown(data.date);

  return (
    <div className="cc">
      <div className="cc-title">Prochain match</div>

      <div className="cc-next-top">
        {cd && <span className="cc-countdown" style={{ color }}>{cd}</span>}
        <span className={`cc-badge${data.domicile !== false ? ' cc-badge--dom' : ' cc-badge--ext'}`}>
          {data.domicile !== false ? 'Dom' : 'Ext'}
        </span>
      </div>

      <div className="cc-club">
        {data.logo_adversaire_local && (
          <img src={`${API_BASE_URL}${data.logo_adversaire_local}`} alt="" className="cc-logo" />
        )}
        <span className="cc-next-adv">{data.adversaire}</span>
      </div>

      <div className="cc-foot">
        <span>{fmtDate(data.date, data.heure)}</span>
        {data.lieu && <span>📍 {data.lieu}</span>}
      </div>
    </div>
  );
}

// ── Carousel principal ────────────────────────────────────────────────────────
export default function CarouselSection() {
  const [active,   setActive]   = useState(0);
  const [teamData, setTeamData] = useState({ 1: null, 2: null, 3: null });
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    Promise.all(
      TEAMS.map(t => getCarousel(t.id).then(r => [t.id, r.data]).catch(() => [t.id, null]))
    ).then(results => {
      const d = {};
      results.forEach(([k, v]) => { d[k] = v; });
      setTeamData(d);
    }).finally(() => setLoading(false));
  }, []);

  const team = TEAMS[active];
  const data = teamData[team.id];

  return (
    <div className="carousel-section">
      {/* Onglets */}
      <div className="carousel-tabs">
        {TEAMS.map((t, i) => (
          <button
            key={t.id}
            className={`carousel-tab${active === i ? ' active' : ''}`}
            style={active === i ? { color: t.color, borderBottomColor: t.color } : {}}
            onClick={() => setActive(i)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Grille 2×2 */}
      {loading ? (
        <div className="spinner" />
      ) : !data ? (
        <div className="empty-state"><p>Données indisponibles pour {team.label}</p></div>
      ) : (
        <div className="carousel-grid">
          <LastResultCard  data={data.lastResult} color={team.color} />
          <RankingCard     data={data.ranking}    color={team.color} />
          <TopScorerCard   data={data.topScorer}  color={team.color} />
          <NextMatchCard   data={data.nextMatch}  color={team.color} />
        </div>
      )}
    </div>
  );
}
