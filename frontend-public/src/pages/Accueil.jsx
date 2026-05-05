import { useState, useEffect } from 'react';
import { getPublicMatchs, getClassementParEquipe, API_BASE_URL } from '../services/api';
import CarouselSection from '../components/Carousel';

// ── Constantes ────────────────────────────────────────────────────────────────

const TEAMS = [
  { name: 'SCR 1', color: '#3dff6e', division: 'District 1 Alsace'     },
  { name: 'SCR 2', color: '#5500ff', division: 'District 5 Alsace'     },
  { name: 'SCR 3', color: '#00bf63', division: 'District 7 Accession'  },
];

// Données FFF de référence (epreuves.fff.fr) — mises à jour manuellement
const FALLBACK_STATS = {
  'SCR 1': { rank: 5, totalTeams: 12, pts: 22, played: 18, won: 6,  drawn: 4, lost: 8, division: 'District 1 Alsace'    },
  'SCR 2': { rank: 2, totalTeams: 12, pts: 44, played: 18, won: 14, drawn: 3, lost: 1, division: 'District 5 Alsace'    },
  'SCR 3': { rank: 3, totalTeams: 6,  pts: 9,  played: 6,  won: 3,  drawn: 0, lost: 3, division: 'District 7 Accession' },
};


const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MOIS  = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

function formatDate(d, h) {
  if (!d) return '—';
  const dt = new Date(d);
  const str = `${JOURS[dt.getDay()]} ${dt.getDate()} ${MOIS[dt.getMonth()]}`;
  return h ? `${str} · ${String(h).slice(0, 5)}` : str;
}

// ── StatCard (saison en cours, données FFF) ────────────────────────────────────

function StatCard({ team, classData, upcoming }) {
  const { name, color, division: fallbackDiv } = team;
  const info = classData?.[name];

  let stats      = null;
  let rank       = null;
  let totalTeams = null;

  if (info?.rows?.length) {
    const idx = info.rows.findIndex(r => r.isSCR);
    if (idx !== -1) {
      const r = info.rows[idx];
      rank  = r.pos ?? r.rank ?? (idx + 1);
      // Le backend retourne les champs en français : victoires/nuls/defaites/joues
      stats = {
        won:    r.victoires ?? r.won    ?? 0,
        drawn:  r.nuls      ?? r.drawn  ?? 0,
        lost:   r.defaites  ?? r.lost   ?? 0,
        points: r.points    ?? r.pts    ?? 0,
        played: r.joues     ?? r.played ?? 0,
      };
      totalTeams = info.rows.length;
    }
  }

  // Fallback sur les valeurs FFF scrapées manuellement
  if (!stats) {
    const fb = FALLBACK_STATS[name];
    if (fb) {
      rank       = fb.rank;
      totalTeams = fb.totalTeams;
      stats      = { won: fb.won, drawn: fb.drawn, lost: fb.lost, points: fb.pts, played: fb.played };
    }
  } else if (FALLBACK_STATS[name]) {
    totalTeams = FALLBACK_STATS[name].totalTeams;
  }

  const division = info?.division || FALLBACK_STATS[name]?.division || fallbackDiv;
  const winPct   = stats?.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;

  // Couleurs en hex-alpha (syntaxe #RRGGBBAA valide en CSS moderne)
  const badgeBg     = `${color}18`;
  const badgeBorder = `${color}38`;

  return (
    <div className="stat-card">
      <div className="stat-card-top">
        <div
          className="stat-card-badge"
          style={{ color, backgroundColor: badgeBg, borderColor: badgeBorder }}
        >
          {name}
        </div>
        {rank != null ? (
          <div className="stat-card-rank">
            <span className="stat-card-rank-num">
              {rank}<sup>{rank === 1 ? 'er' : 'e'}</sup>
              {totalTeams && <span className="stat-card-rank-total">/{totalTeams}</span>}
            </span>
            <span className="stat-card-rank-div">{division}</span>
          </div>
        ) : (
          <span className="stat-card-rank-div" style={{ marginTop: 4 }}>{division}</span>
        )}
      </div>

      {stats ? (
        <>
          <div className="stat-card-record">
            <span className="stat-val" style={{ color }}>
              {stats.won}
            </span>
            <span className="stat-label" style={{ color }}>V</span>
            <span className="stat-sep">·</span>
            <span className="stat-val stat-n-val">{stats.drawn}</span>
            <span className="stat-label stat-n-val">N</span>
            <span className="stat-sep">·</span>
            <span className="stat-val stat-d-val">{stats.lost}</span>
            <span className="stat-label stat-d-val">D</span>
          </div>

          <div className="stat-card-pts">
            {stats.points}<span className="stat-pts-unit"> pts</span>
          </div>
        </>
      ) : (
        <div className="stat-card-placeholder">Import FFF en attente</div>
      )}

      {upcoming && (
        <div className="stat-card-next">
          <div className="stat-card-next-label">Prochain adversaire</div>
          <div className="stat-card-next-club">
            {upcoming.logo_adversaire_local && (
              <img
                src={`${API_BASE_URL}${upcoming.logo_adversaire_local}`}
                alt=""
                className="adv-logo"
              />
            )}
            <span className="stat-card-next-name">{upcoming.adversaire}</span>
          </div>
        </div>
      )}

      <div className="stat-bar">
        <div
          className="stat-bar-fill"
          style={{ '--bar-w': `${winPct}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ── TeamMatchCard (prochain match par équipe) ─────────────────────────────────

function TeamMatchCard({ team, upcoming }) {
  const { name, color } = team;

  return (
    <div className="team-card">
      <div className="team-card-strip" style={{ background: color }} />
      <div className="team-card-body">
        <div className="team-card-name" style={{ color }}>{name}</div>

        {upcoming ? (
          <>
            <div className="team-card-adv">
              {upcoming.logo_adversaire_local && (
                <img
                  src={`${API_BASE_URL}${upcoming.logo_adversaire_local}`}
                  alt=""
                  className="adv-logo"
                />
              )}
              <span>{upcoming.adversaire}</span>
            </div>
            <div className="team-card-meta">
              <span className="team-card-date">
                {formatDate(upcoming.date, upcoming.heure)}
              </span>
              <span className={`team-match-badge${upcoming.domicile !== false ? ' team-match-badge--dom' : ' team-match-badge--ext'}`}>
                {upcoming.domicile !== false ? 'Dom' : 'Ext'}
              </span>
            </div>
            {upcoming.lieu && (
              <div className="team-card-lieu">📍 {upcoming.lieu}</div>
            )}
          </>
        ) : (
          <div className="team-card-empty">Aucun match programmé</div>
        )}
      </div>
    </div>
  );
}

// ── Page Accueil ──────────────────────────────────────────────────────────────

export default function Accueil() {
  const [matchs,    setMatchs]    = useState(null);
  const [classData, setClassData] = useState(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      getPublicMatchs().catch(() => null),
      getClassementParEquipe().catch(() => null),
    ]).then(([matchsRes, classRes]) => {
      setMatchs(matchsRes?.data ?? null);
      setClassData(classRes?.data ?? null);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="home-page">

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero-glow" />
        <div className="hero-glow hero-glow--2" />
        <div className="container hero-content">
          <div className="hero-eyebrow">
            <span className="dot-live" />
            Saison 2024–25 · District d'Alsace
          </div>
          <h1 className="hero-title">
            SC <span className="hero-title-green">ROESCHWOOG</span>
          </h1>
          <p className="hero-subtitle">Génération · Planification · Publication</p>
        </div>
      </section>

      {/* ── Contenu ─────────────────────────────────────────────────────── */}
      <div className="container home-content">

        {/* Carousel par équipe */}
        <CarouselSection />

        {/* Stats saison */}
        <div className="section-block">
          <div className="section-header">
            <h2 className="section-heading">Saison en cours</h2>
            <p className="section-sub">Statistiques par équipe — données FFF</p>
          </div>
          {loading ? (
            <div className="spinner" />
          ) : (
            <div className="stats-row">
              {TEAMS.map(team => (
                <StatCard
                  key={team.name}
                  team={team}
                  classData={classData}
                  upcoming={(matchs?.upcoming || []).find(m => m.equipe === team.name) ?? null}
                />
              ))}
            </div>
          )}
        </div>

        {/* Prochains matchs */}
        <div className="section-block">
          <div className="section-header">
            <h2 className="section-heading">Prochains matchs</h2>
          </div>
          {loading ? (
            <div className="spinner" />
          ) : (
            <div className="teams-row">
              {TEAMS.map(team => (
                <TeamMatchCard
                  key={team.name}
                  team={team}
                  upcoming={(matchs?.upcoming || []).find(m => m.equipe === team.name) ?? null}
                />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
