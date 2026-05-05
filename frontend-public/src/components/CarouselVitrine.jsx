import { useState, useEffect, useRef } from 'react';
import { getCarousel, API_BASE_URL } from '../services/api';

// ── Config ────────────────────────────────────────────────────────────────────
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
  const s  = `${JOURS[dt.getDay()]} ${dt.getDate()} ${MOIS[dt.getMonth()]}`;
  return h ? `${s} · ${String(h).slice(0, 5)}` : s;
}

function countdown(dateStr) {
  if (!dateStr) return null;
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
  const diff   = Math.round((target - today) / 86400000);
  if (diff < 0)  return null;
  if (diff === 0) return "Auj.";
  if (diff === 1) return 'Demain';
  return `J-${diff}`;
}

function initials(name) {
  return (name || '').split(' ').filter(Boolean).map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

// 2 lignes avant SCR + SCR + 2 lignes après
function reducedRanking(rows, half = 2) {
  if (!rows?.length) return { visible: [], topDots: false, botDots: false };
  if (rows.length <= half * 2 + 1) return { visible: rows, topDots: false, botDots: false };
  const si = rows.findIndex(r => r.isSCR);
  if (si === -1) return { visible: rows.slice(0, half * 2 + 1), topDots: false, botDots: rows.length > half * 2 + 1 };
  const start = Math.max(0, si - half);
  const end   = Math.min(rows.length, si + half + 1);
  return { visible: rows.slice(start, end), topDots: start > 0, botDots: end < rows.length };
}

// ── Card — Dernier résultat ───────────────────────────────────────────────────
function VCResult({ data }) {
  if (!data) return <div className="vc vc--empty"><span>Aucun résultat</span></div>;

  const win   = data.score_scr > data.score_adv;
  const draw  = data.score_scr === data.score_adv;
  const badge = win  ? { l: 'Victoire', c: '#3dff6e', bg: 'rgba(61,255,110,0.14)' }
              : draw ? { l: 'Nul',       c: '#f97316', bg: 'rgba(249,115,22,0.14)' }
                     : { l: 'Défaite',   c: '#ef4444', bg: 'rgba(239,68,68,0.14)'  };

  return (
    <div className="vc">
      <div className="vc-label">Dernier résultat</div>
      <div className="vc-score">{data.score_scr} – {data.score_adv}</div>
      <span className="vc-result-badge" style={{ color: badge.c, background: badge.bg }}>{badge.l}</span>
      <div className="vc-club">
        {data.logo_adversaire_local
          ? <img src={`${API_BASE_URL}${data.logo_adversaire_local}`} alt="" className="vc-logo" />
          : <div className="vc-logo-placeholder" />}
        <span className="vc-adv">{data.adversaire}</span>
      </div>
      <div className="vc-foot">
        <span className={`vc-badge${data.domicile !== false ? ' vc-badge--dom' : ' vc-badge--ext'}`}>
          {data.domicile !== false ? 'Domicile' : 'Extérieur'}
        </span>
        {data.date && (
          <span>{new Date(data.date).toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short' })}</span>
        )}
        {data.division && <span className="vc-competition">{data.division}</span>}
      </div>
    </div>
  );
}

// ── Card — Classement ─────────────────────────────────────────────────────────
function VCRanking({ data, color }) {
  if (!data?.rows?.length) return <div className="vc vc--empty"><span>Classement indisponible</span></div>;

  const { visible, topDots, botDots } = reducedRanking(data.rows, 2);

  return (
    <div className="vc">
      <div className="vc-label">
        Classement{data.division && <span className="vc-division" style={{ color }}> {data.division}</span>}
      </div>
      <table className="vc-table">
        <thead>
          <tr><th>#</th><th>Club</th><th className="vc-r">Pts</th><th className="vc-r">J</th></tr>
        </thead>
        <tbody>
          {topDots && <tr className="vc-dots"><td colSpan={4}>···</td></tr>}
          {visible.map((row) => {
            const rank = row.rank ?? (data.rows.indexOf(row) + 1);
            return (
              <tr key={rank} className={row.isSCR ? 'vc-scr' : ''} style={row.isSCR ? { color } : {}}>
                <td className="vc-rank-n">{rank}</td>
                <td className="vc-club-name">{row.equipe}</td>
                <td className="vc-r"><strong>{row.points}</strong></td>
                <td className="vc-r">{row.joues}</td>
              </tr>
            );
          })}
          {botDots && <tr className="vc-dots"><td colSpan={4}>···</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ── Card — Meilleur buteur ────────────────────────────────────────────────────
function VCScorer({ data, color }) {
  if (!data) return <div className="vc vc--empty"><span>Aucun buteur</span></div>;
  const ini = initials(data.nom);
  return (
    <div className="vc">
      <div className="vc-label">Meilleur buteur</div>
      <div className="vc-scorer">
        <div className="vc-avatar">
          {data.photo
            ? <img src={`${API_BASE_URL}${data.photo}`} alt={data.nom} />
            : <div className="vc-initials" style={{ background: `${color}18`, color }}>{ini}</div>}
        </div>
        <div className="vc-scorer-info">
          <div className="vc-scorer-name">{data.nom}</div>
          {data.categorie && <div className="vc-scorer-cat">{data.categorie}</div>}
        </div>
      </div>
      <div className="vc-buts" style={{ color }}>
        {data.buts}<span className="vc-buts-label">but{data.buts > 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}

// ── Card — Prochain match ─────────────────────────────────────────────────────
function VCNext({ data, color }) {
  if (!data) return <div className="vc vc--empty"><span>Aucun match prévu</span></div>;
  const cd = countdown(data.date);
  return (
    <div className="vc">
      <div className="vc-label">Prochain match</div>
      <div className="vc-next-top">
        {cd && <span className="vc-countdown" style={{ color }}>{cd}</span>}
        <span className={`vc-badge${data.domicile !== false ? ' vc-badge--dom' : ' vc-badge--ext'}`}>
          {data.domicile !== false ? 'Dom' : 'Ext'}
        </span>
      </div>
      <div className="vc-club">
        {data.logo_adversaire_local
          ? <img src={`${API_BASE_URL}${data.logo_adversaire_local}`} alt="" className="vc-logo" />
          : <div className="vc-logo-placeholder" />}
        <span className="vc-adv vc-adv--lg">{data.adversaire}</span>
      </div>
      <div className="vc-foot">
        <span>{fmtDate(data.date, data.heure)}</span>
        {data.division && <span className="vc-competition">{data.division}</span>}
      </div>
    </div>
  );
}

// ── Slide (contenu d'une équipe) ──────────────────────────────────────────────
function TeamSlide({ team, data, loading }) {
  if (loading) return <div className="vc-slide"><div className="spinner" style={{ marginTop: 80 }} /></div>;
  if (!data)   return <div className="vc-slide"><div className="empty-state"><p>Données indisponibles</p></div></div>;
  return (
    <div className="vc-slide">
      <div className="vc-grid">
        <VCResult  data={data.lastResult} color={team.color} />
        <VCRanking data={data.ranking}    color={team.color} />
        <VCScorer  data={data.topScorer}  color={team.color} />
        <VCNext    data={data.nextMatch}   color={team.color} />
      </div>
    </div>
  );
}

// ── Carousel vitrine ──────────────────────────────────────────────────────────
export default function CarouselVitrine({ activeTeam, setActiveTeam, onPause, onResume }) {
  const [teamData, setTeamData] = useState({ 1: null, 2: null, 3: null });
  const [loading,  setLoading]  = useState(true);

  // Touch swipe
  const touchStartX = useRef(null);

  useEffect(() => {
    Promise.all(
      TEAMS.map(t => getCarousel(t.id).then(r => [t.id, r.data]).catch(() => [t.id, null]))
    ).then(results => {
      const d = {};
      results.forEach(([k, v]) => { d[k] = v; });
      setTeamData(d);
    }).finally(() => setLoading(false));
  }, []);

  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    touchStartX.current = null;
    if (Math.abs(diff) < 50) return;
    const next = diff > 0
      ? (activeTeam + 1) % TEAMS.length
      : (activeTeam - 1 + TEAMS.length) % TEAMS.length;
    setActiveTeam(next);
  };

  return (
    <div className="vc-section">
      {/* Piste de slides (pleine largeur, translateX) */}
      <div
        className="vc-slider-wrapper"
        onMouseEnter={onPause}
        onMouseLeave={onResume}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="vc-slider-track"
          style={{ transform: `translateX(-${activeTeam * 100}%)` }}
        >
          {TEAMS.map((t) => (
            <TeamSlide
              key={t.id}
              team={t}
              data={teamData[t.id]}
              loading={loading}
            />
          ))}
        </div>
      </div>

      {/* Indicateurs de navigation */}
      <div className="vc-dots-nav">
        {TEAMS.map((t, i) => (
          <button
            key={i}
            className={`vc-dot-btn${activeTeam === i ? ' active' : ''}`}
            style={{ '--tc': t.color }}
            onClick={() => setActiveTeam(i)}
            aria-label={t.label}
          />
        ))}
      </div>
    </div>
  );
}
