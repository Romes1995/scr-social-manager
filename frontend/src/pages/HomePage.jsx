import { useState, useEffect, useCallback } from 'react';
import photo1 from '../assets/photos/photo1.png';
import photo2 from '../assets/photos/photo2.png';
import photo3 from '../assets/photos/photo3.png';
import photo4 from '../assets/photos/photo4.png';
import photo5 from '../assets/photos/photo5.png';
import { importFFF } from '../services/api';
import './HomePage.css';

// ── Config ────────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

const JOURS  = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
const MOIS   = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

const TEAM_COLOR = { 'SCR 1': '#4ac878', 'SCR 2': '#f5c518', 'SCR 3': '#a78bfa' };
const TEAM_DIV   = { 'SCR 1': 'District 1', 'SCR 2': 'District 5', 'SCR 3': 'District 7' };

const NAV_GROUPS = [
  { label: 'Accueil',     tab: 'home' },
  { label: 'Générations', tab: 'programme',  children: [
    { label: 'Programme',   tab: 'programme',   icon: '📅' },
    { label: 'Match Day',   tab: 'matchday',    icon: '🏟️' },
    { label: 'Convocation', tab: 'convocation', icon: '📨' },
  ]},
  { label: 'Score Live',  tab: 'score_live' },
  { label: 'Publications',tab: 'resultats', children: [
    { label: 'Résultats', tab: 'resultats', icon: '🏆' },
    { label: 'Listes',    tab: 'listes',    icon: '📋' },
  ]},
  { label: 'Gestion',     tab: 'templates', children: [
    { label: 'Templates', tab: 'templates', icon: '🎨' },
  ]},
];

const SLIDES = [
  {
    accent:   '#4ac878',
    eyebrow:  'Programme du week-end',
    title:    ['PROCHAIN', 'RENDEZ-VOUS'],
    subtitle: 'Suivez les 3 équipes SCR en temps réel',
    bullets:  ['3 équipes en compétition', 'Score Live intégré', 'Partage réseaux sociaux'],
    cta1:     { label: 'Programme',  tab: 'programme'  },
    cta2:     { label: 'Score Live', tab: 'score_live' },
    photo:    photo1,
  },
  {
    accent:   '#f5c518',
    eyebrow:  'Bilan de la saison',
    title:    ['RÉSULTATS &', 'CLASSEMENTS'],
    subtitle: 'Résultats et statistiques mis à jour automatiquement',
    bullets:  ['Import FFF en un clic', 'Classements par équipe', 'Top buteurs'],
    cta1:     { label: 'Résultats',  tab: 'resultats' },
    cta2:     { label: 'Import FFF', tab: null, action: 'import' },
    photo:    photo2,
  },
  {
    accent:   '#a78bfa',
    eyebrow:  'Communication digitale',
    title:    ['GÉNÉREZ', 'VOS VISUELS'],
    subtitle: 'Créez vos publications réseaux sociaux en secondes',
    bullets:  ['Matchday & Convocations', 'Templates personnalisables', 'Génération automatique'],
    cta1:     { label: 'Générer',   tab: 'programme' },
    cta2:     { label: 'Templates', tab: 'templates' },
    photo:    photo3,
  },
  {
    accent:   '#4ac878',
    eyebrow:  'Équipe & Effectif',
    title:    ['GESTION DE', "L'EFFECTIF"],
    subtitle: 'Convocations, listes et suivi des joueurs SCR',
    bullets:  ['Convocations automatiques', 'Photos et profils joueurs', 'Export et partage'],
    cta1:     { label: 'Convocations', tab: 'convocation' },
    cta2:     { label: 'Listes',       tab: 'listes' },
    photo:    photo4,
  },
  {
    accent:   '#f5c518',
    eyebrow:  'Match Day',
    title:    ['LE JOUR DU', 'MATCH'],
    subtitle: 'Tout pour le jour J : affiches, score live et résultats',
    bullets:  ['Affiche Match Day', 'Score Live en direct', 'Résumé post-match'],
    cta1:     { label: 'Match Day',  tab: 'matchday'    },
    cta2:     { label: 'Score Live', tab: 'score_live'  },
    photo:    photo5,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '?';
  const dt = d instanceof Date ? d : new Date(d);
  return `${JOURS[dt.getUTCDay()]} ${String(dt.getUTCDate()).padStart(2,'0')} ${MOIS[dt.getUTCMonth()]}`;
}
function fmtHeure(h) {
  if (!h) return '';
  const [hh, mm] = String(h).slice(0,5).split(':');
  return `${hh}h${mm}`;
}
function initials(name = '') {
  const p = name.trim().split(' ');
  return p.length >= 2 ? `${p[0][0]}. ${p.slice(1).join(' ')}` : name;
}

// ── SVG Écusson SCR ───────────────────────────────────────────────────────────

function ScrCrest({ size = 38 }) {
  const h = Math.round(size * 1.2);
  return (
    <svg width={size} height={h} viewBox="0 0 40 48" fill="none" aria-hidden="true">
      <path d="M20 2L38 9V27Q38 41 20 46Q2 41 2 27V9Z"
        fill="#0d2218" stroke="#4ac878" strokeWidth="1.5" />
      <path d="M20 6L34 12V27Q34 38 20 43Q6 38 6 27V12Z"
        fill="#091a10" />
      <line x1="6" y1="23" x2="34" y2="23" stroke="#f5c518" strokeWidth="0.6" opacity="0.7" />
      <text x="20" y="20" textAnchor="middle"
        fontFamily="Bebas Neue,Arial Narrow,Arial" fontSize="11" letterSpacing="1"
        fill="#4ac878">SCR</text>
      <text x="20" y="33" textAnchor="middle"
        fontFamily="Bebas Neue,Arial Narrow,Arial" fontSize="7" letterSpacing="0.5"
        fill="#f5c518">1905</text>
      <circle cx="13" cy="27" r="1.5" fill="#f5c518" opacity="0.7" />
      <circle cx="27" cy="27" r="1.5" fill="#f5c518" opacity="0.7" />
    </svg>
  );
}

// ── TopNav ────────────────────────────────────────────────────────────────────

function HomeNav({ activeTab, setActiveTab }) {
  const [openMenu,   setOpenMenu]   = useState(null);
  const [importing,  setImporting]  = useState(false);
  const [toast,      setToast]      = useState(null);

  useEffect(() => {
    if (!openMenu) return;
    const close = (e) => {
      if (!e.target.closest('.hn-dropdown-wrap')) setOpenMenu(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [openMenu]);

  const go = (tab) => { if (tab) setActiveTab(tab); setOpenMenu(null); };

  const doImport = async () => {
    setImporting(true);
    try {
      const r = await importFFF();
      const nb = r.data?.nouveaux ?? r.data?.importes ?? '?';
      setToast({ ok: true, msg: `${nb} match(s) importé(s)` });
    } catch {
      setToast({ ok: false, msg: 'Erreur import FFF' });
    } finally {
      setImporting(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const activeGroup = NAV_GROUPS.find(g =>
    g.tab === activeTab || g.children?.some(c => c.tab === activeTab)
  )?.tab;

  return (
    <>
      <nav className="hn">
        <div className="hn-inner">
          {/* Écusson */}
          <button className="hn-brand" onClick={() => go('home')}>
            <ScrCrest size={36} />
            <span className="hn-brand-text">
              <span className="hn-brand-name">SCR Social Manager</span>
              <span className="hn-brand-sub">SC Roeschwoog</span>
            </span>
          </button>

          {/* Onglets */}
          <div className="hn-links">
            {NAV_GROUPS.map((g) => {
              const isActive = activeGroup === g.tab;
              if (!g.children) {
                return (
                  <button key={g.tab}
                    className={`hn-link${isActive ? ' hn-link--on' : ''}`}
                    onClick={() => go(g.tab)}>
                    {g.label}
                  </button>
                );
              }
              const isOpen = openMenu === g.tab;
              return (
                <div key={g.tab} className="hn-dropdown-wrap">
                  <button
                    className={`hn-link hn-link--arrow${isActive ? ' hn-link--on' : ''}${isOpen ? ' hn-link--open' : ''}`}
                    onClick={() => setOpenMenu(isOpen ? null : g.tab)}
                  >
                    {g.label}
                    <svg className="hn-chevron" width="9" height="5" viewBox="0 0 9 5">
                      <path d="M1 1l3.5 3L8 1" stroke="currentColor" strokeWidth="1.4"
                        fill="none" strokeLinecap="round" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="hn-dropdown">
                      {g.children.map(c => (
                        <button key={c.tab}
                          className={`hn-dropdown-item${activeTab === c.tab ? ' hn-dropdown-item--on' : ''}`}
                          onClick={() => go(c.tab)}>
                          <span>{c.icon}</span> {c.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="hn-actions">
            <button className="hn-btn hn-btn--ghost" onClick={doImport} disabled={importing}>
              {importing ? '⏳' : '⬇'} Import FFF
            </button>
            <button className="hn-btn hn-btn--gold" onClick={() => go('resultats')}>
              + Publier
            </button>
          </div>
        </div>
      </nav>

      {toast && (
        <div className={`hn-toast${toast.ok ? ' hn-toast--ok' : ' hn-toast--err'}`}>
          {toast.ok ? '✅' : '❌'} {toast.msg}
        </div>
      )}
    </>
  );
}

// ── HeroSlider ────────────────────────────────────────────────────────────────

function HeroSlider({ setActiveTab, onImport }) {
  const [cur,     setCur]     = useState(0);
  const [paused,  setPaused]  = useState(false);
  const [exiting, setExiting] = useState(false);

  const goTo = useCallback((idx) => {
    setExiting(true);
    setTimeout(() => { setCur(idx); setExiting(false); }, 300);
  }, []);

  const next = useCallback(() => goTo((cur + 1) % SLIDES.length), [cur, goTo]);
  const prev = useCallback(() => goTo((cur - 1 + SLIDES.length) % SLIDES.length), [cur, goTo]);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(next, 4500);
    return () => clearInterval(id);
  }, [paused, next]);

  const s = SLIDES[cur];

  const handleCta = (cta) => {
    if (cta.action === 'import') { onImport(); return; }
    if (cta.tab) setActiveTab(cta.tab);
  };

  return (
    <section
      className="hero"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Accent bar */}
      <div className="hero-accent-bar" />

      {/* Slide content */}
      <div className={`hero-slide${exiting ? ' hero-slide--exit' : ''}`}>
        {/* Overlay gradient */}
        <div className="hero-overlay" />

        {/* Photo droite */}
        <div className="hero-photo-area">
          <img src={s.photo} alt="" className="hero-photo" draggable={false} />
        </div>

        {/* Texte gauche */}
        <div className="hero-content">
          <p className="hero-eyebrow" style={{ color: s.accent }}>{s.eyebrow}</p>
          <h1 className="hero-title">
            {s.title.map((line, i) => <span key={i}>{line}<br /></span>)}
          </h1>
          <p className="hero-subtitle">{s.subtitle}</p>
          <ul className="hero-bullets">
            {s.bullets.map((b, i) => (
              <li key={i} style={{ '--dot': s.accent }}>{b}</li>
            ))}
          </ul>
          <div className="hero-ctas">
            <button className="hero-cta hero-cta--primary"
              style={{ background: s.accent, color: '#060a07' }}
              onClick={() => handleCta(s.cta1)}>
              {s.cta1.label} →
            </button>
            <button className="hero-cta hero-cta--ghost"
              style={{ borderColor: s.accent, color: s.accent }}
              onClick={() => handleCta(s.cta2)}>
              {s.cta2.label}
            </button>
          </div>
        </div>
      </div>

      {/* Prev / Next */}
      <button className="hero-arrow hero-arrow--prev" onClick={prev} aria-label="Précédent">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M11 4L6 9l5 5" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <button className="hero-arrow hero-arrow--next" onClick={next} aria-label="Suivant">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M7 4l5 5-5 5" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Dots */}
      <div className="hero-dots">
        {SLIDES.map((sl, i) => (
          <button key={i} className={`hero-dot${i === cur ? ' hero-dot--on' : ''}`}
            style={i === cur ? { background: sl.accent } : {}}
            onClick={() => { setPaused(true); goTo(i); }}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>

      {/* Progress bar */}
      {!paused && (
        <div key={`prog-${cur}`} className="hero-progress"
          style={{ '--accent': s.accent }} />
      )}
    </section>
  );
}

// ── ClubLogo : local → CDN → initiales ───────────────────────────────────────

function clubInitials(nom = '') {
  return (nom.trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()) || '?';
}

function ClubLogo({ localPath, cdnUrl, nom, size = 44 }) {
  const sources = [
    localPath ? `${API_BASE}${localPath}` : null,
    cdnUrl    || null,
  ].filter(Boolean);

  const [idx, setIdx] = useState(0);

  // reset quand les sources changent (changement de match)
  useEffect(() => { setIdx(0); }, [localPath, cdnUrl]);

  if (idx >= sources.length) {
    return (
      <div className="club-logo-fallback" style={{ width: size, height: size }}>
        {clubInitials(nom)}
      </div>
    );
  }
  return (
    <img
      src={sources[idx]}
      className="mc-logo"
      alt={nom || ''}
      style={{ width: size, height: size }}
      onError={() => setIdx(i => i + 1)}
    />
  );
}

// ── MatchCard ─────────────────────────────────────────────────────────────────

function MatchCard({ match }) {
  const dom   = match.domicile !== false;
  const color = TEAM_COLOR[match.equipe] || '#4ac878';

  // SCR : logo local géré par l'app (/uploads/logos/scr.png)
  const scrLogo  = { localPath: '/uploads/logos/scr.png', cdnUrl: null,               nom: match.equipe };
  const advLogo  = { localPath: match.logo_adversaire_local,  cdnUrl: match.logo_adversaire, nom: match.adversaire };
  const leftLogo  = dom ? scrLogo  : advLogo;
  const rightLogo = dom ? advLogo  : scrLogo;

  return (
    <article className="mc">
      <div className="mc-division" style={{ color }}>{match.division || match.equipe}</div>
      <div className="mc-date">{fmtDate(match.date)} · {fmtHeure(match.heure)}</div>
      <div className="mc-teams">
        <div className="mc-team">
          <div className="mc-logo-wrap">
            <ClubLogo {...leftLogo} size={38} />
          </div>
          <span className="mc-name">{dom ? match.equipe : match.adversaire}</span>
        </div>
        <span className="mc-vs">VS</span>
        <div className="mc-team">
          <div className="mc-logo-wrap">
            <ClubLogo {...rightLogo} size={38} />
          </div>
          <span className="mc-name">{dom ? match.adversaire : match.equipe}</span>
        </div>
      </div>
      {match.lieu && <div className="mc-lieu">📍 {match.lieu}</div>}
      <span className={`mc-badge mc-badge--${dom ? 'dom' : 'ext'}`}>
        {dom ? '🏠 Domicile' : '✈️ Extérieur'}
      </span>
    </article>
  );
}

// ── StandingCard ──────────────────────────────────────────────────────────────

function StandingCard({ teamNum }) {
  const teamName = `SCR ${teamNum}`;
  const color    = TEAM_COLOR[teamName];
  const fallback = { equipe: teamName, joues:0, victoires:0, nuls:0, defaites:0,
                     buts_pour:0, buts_contre:0, diff:0, points:0, division:null, forme:[] };

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/matches/standings`)
      .then(r => r.json())
      .then(rows => {
        const row = Array.isArray(rows) ? rows.find(r => r.equipe === teamName) : null;
        setData(row || fallback);
      })
      .catch(() => setData(fallback))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamName]);

  const d = data || fallback;

  return (
    <div className="sc" style={{ '--c': color }}>
      <div className="sc-header">
        <div>
          <div className="sc-team">{teamName}</div>
          <div className="sc-div">{d.division || TEAM_DIV[teamName]}</div>
        </div>
        <div className="sc-pts">{loading ? '—' : d.points}<span>pts</span></div>
      </div>

      {loading ? (
        <div className="sc-loader"><div className="sc-spin" /></div>
      ) : (
        <>
          <div className="sc-stats">
            {[['J', d.joues], ['V', d.victoires, 'win'], ['N', d.nuls, 'draw'], ['D', d.defaites, 'loss'],
              ['Bp', d.buts_pour], ['Bc', d.buts_contre]].map(([k, v, cls]) => (
              <div key={k} className={`sc-stat${cls ? ` sc-stat--${cls}` : ''}`}>
                <span className="sc-stat-v">{v}</span>
                <span className="sc-stat-k">{k}</span>
              </div>
            ))}
          </div>

          {/* Row SCR surlignée */}
          <div className="sc-scr-row">
            <span className="sc-scr-label">{teamName}</span>
            <span className="sc-scr-diff" style={{ color: d.diff >= 0 ? '#4ac878' : '#f87171' }}>
              {d.diff > 0 ? '+' : ''}{d.diff}
            </span>
            <span className="sc-scr-pts" style={{ color }}>{d.points} pts</span>
          </div>

          {d.forme.length > 0 && (
            <div className="sc-forme">
              {[...d.forme].reverse().map((r, i) => (
                <span key={i} className={`sc-dot sc-dot--${r}`}>{r}</span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── ScorerAvatar : photo joueur ou initiales ──────────────────────────────────

function ScorerAvatar({ photoPath, nom, color }) {
  const [failed, setFailed] = useState(false);
  const ini = (nom || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();

  useEffect(() => { setFailed(false); }, [photoPath]);

  if (!photoPath || failed) {
    return (
      <div className="tsc-avatar tsc-avatar--initials" style={{ borderColor: color }}>
        <span style={{ color }}>{ini}</span>
      </div>
    );
  }
  return (
    <img
      src={`${API_BASE}${photoPath}`}
      className="tsc-avatar"
      alt={nom}
      style={{ borderColor: color }}
      onError={() => setFailed(true)}
    />
  );
}

// ── TopScorersCarousel ────────────────────────────────────────────────────────

function TopScorersCarousel() {
  const [scorers, setScorers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cur,     setCur]     = useState(0);
  const [paused,  setPaused]  = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/matches/top-scorers?limit=6`)
      .then(r => r.json())
      .then(rows => setScorers(Array.isArray(rows) ? rows : []))
      .catch(() => setScorers([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (paused || scorers.length <= 1) return;
    const id = setInterval(() => setCur(c => (c + 1) % scorers.length), 3000);
    return () => clearInterval(id);
  }, [paused, scorers.length]);

  // reset slide index si les données changent
  useEffect(() => { setCur(0); }, [scorers.length]);

  return (
    <div className="ts"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="ts-header">
        <span className="ts-title">Top Buteurs</span>
        <span className="ts-season">Saison 2024-25</span>
      </div>

      {loading ? (
        <div className="sc-loader"><div className="sc-spin" /></div>
      ) : scorers.length === 0 ? (
        <div className="ts-empty">Aucun buteur enregistré</div>
      ) : (
        <>
          {/* Slide carrousel */}
          {scorers.map((s, i) => {
            const color = TEAM_COLOR[s.equipe] || '#4ac878';
            return (
              <div
                key={`${s.buteur}-${s.equipe}`}
                className={`tsc-slide${i === cur ? ' tsc-slide--on' : ''}`}
                aria-hidden={i !== cur}
              >
                <div className="tsc-rank-badge">#{i + 1}</div>
                <ScorerAvatar photoPath={s.joueur_photo} nom={s.buteur} color={color} />
                <div className="tsc-info">
                  <span className="tsc-name">{s.buteur}</span>
                  <span className="tsc-team" style={{ color }}>{s.equipe}</span>
                </div>
                <div className="tsc-goals">
                  <span className="tsc-goals-num" style={{ color }}>{s.buts}</span>
                  <span className="tsc-goals-label">but{s.buts > 1 ? 's' : ''}</span>
                </div>
              </div>
            );
          })}

          {/* Dots */}
          <div className="tsc-dots">
            {scorers.map((_, i) => {
              const color = TEAM_COLOR[scorers[i].equipe] || '#4ac878';
              return (
                <button
                  key={i}
                  className={`tsc-dot${i === cur ? ' tsc-dot--on' : ''}`}
                  style={i === cur ? { background: color } : {}}
                  onClick={() => { setPaused(true); setCur(i); }}
                  aria-label={`Buteur ${i + 1}`}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── HomePage ──────────────────────────────────────────────────────────────────

export default function HomePage({ activeTab, setActiveTab }) {
  const [matches,  setMatches]  = useState([]);
  const [mLoading, setMLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [toast,    setToast]    = useState(null);

  useEffect(() => {
    setMLoading(true);
    fetch(`${API_BASE}/api/matches?upcoming=true&limit=3`)
      .then(r => r.json())
      .then(rows => setMatches(Array.isArray(rows) ? rows : []))
      .catch(() => setMatches([]))
      .finally(() => setMLoading(false));
  }, []);

  const doImport = async () => {
    setImporting(true);
    try {
      const r = await importFFF();
      const nb = r.data?.nouveaux ?? r.data?.importes ?? '?';
      setToast({ ok: true, msg: `${nb} match(s) importé(s)` });
    } catch {
      setToast({ ok: false, msg: 'Erreur import FFF' });
    } finally {
      setImporting(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  return (
    <div className="hp">
      {/* ── Topnav ── */}
      <HomeNav activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* ── Hero ── */}
      <HeroSlider setActiveTab={setActiveTab} onImport={doImport} />

      {/* ── Matchs ── */}
      <section className="hp-sec">
        <div className="hp-wrap">
          <header className="hp-sec-head">
            <h2 className="hp-sec-title">
              <span className="hp-accent">▮</span> Prochains matchs
            </h2>
            <button className="hp-more" onClick={() => setActiveTab('programme')}>
              Tout voir →
            </button>
          </header>
          {mLoading ? (
            <div className="hp-loading"><div className="hp-spin" /></div>
          ) : matches.length === 0 ? (
            <div className="hp-empty">Aucun match programmé</div>
          ) : (
            <div className="hp-matches-grid">
              {matches.map(m => <MatchCard key={m.id} match={m} />)}
            </div>
          )}
        </div>
      </section>

      {/* ── Infos 4 colonnes ── */}
      <section className="hp-sec hp-sec--dark">
        <div className="hp-wrap">
          <header className="hp-sec-head">
            <h2 className="hp-sec-title">
              <span className="hp-accent" style={{ color: '#f5c518' }}>▮</span> Classements & Buteurs
            </h2>
          </header>
          <div className="hp-info-grid">
            <StandingCard teamNum={1} />
            <StandingCard teamNum={2} />
            <StandingCard teamNum={3} />
            <TopScorersCarousel />
          </div>
        </div>
      </section>

      {/* ── Footer bar ── */}
      <footer className="hp-footer">
        <span className="hp-footer-title">SC ROESCHWOOG · SOCIAL MANAGER · SAISON 2024-25</span>
        <div className="hp-footer-stats">
          <span>3 équipes</span>
          <span className="hp-footer-sep">·</span>
          <span onClick={() => setActiveTab('templates')} style={{ cursor: 'pointer' }}>
            Templates
          </span>
          <span className="hp-footer-sep">·</span>
          <span onClick={() => setActiveTab('resultats')} style={{ cursor: 'pointer' }}>
            Publications
          </span>
        </div>
      </footer>

      {toast && (
        <div className={`hn-toast${toast.ok ? ' hn-toast--ok' : ' hn-toast--err'}`}>
          {toast.ok ? '✅' : '❌'} {toast.msg}
        </div>
      )}
    </div>
  );
}
