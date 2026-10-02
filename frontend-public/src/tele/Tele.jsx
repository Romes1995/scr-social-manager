import { useEffect, useRef, useState } from 'react';
import { getTele } from '../services/api';
import { logoPastille } from '../accueil/visuels';
import Billet from '../accueil/Billet';
import Palette from '../accueil/Palette';
import Pastille from '../accueil/Pastille';
import { dateCourte, dateLongue, diffSignee, infoClassement, libelleEquipe } from '../accueil/format';
import { GRAIN_TELE, IMAGES_FIXES, ISSUES_TELE, VISUELS_TELE } from './visuelsTele';
import { heureParis, isoParis, msJusquAQuatreHeures } from './temps';
import '../accueil/Accueil.css';
import './Tele.css';

/**
 * Page télé du club-house (/tele), affichée par Anthias sur un Raspberry Pi 4.
 * Scène fixe 1920 × 1080 mise à l'échelle ; un écran par équipe, en boucle
 * (15 s par défaut, ?duree=N). Une seule requête : GET /api/public/tele,
 * rechargée toutes les 5 minutes ; la page se recharge entièrement à 4 h.
 */

const SCENE = { largeur: 1920, hauteur: 1080 };
const RAFRAICHISSEMENT_MS = 5 * 60 * 1000;
const NOUVEL_ESSAI_MS = 30 * 1000;
const FONDU_MS = 600;
const LIGNES_MAX = 14;                 // au-delà, les lignes du classement rétrécissent
const HAUTEUR_LIGNES = LIGNES_MAX * 49; // 44 px + 5 px d'écart

const TAILLES_BILLET = { nom: 28, nomMin: 18, pastille: 33 };

const dureeEcran = () => {
  const n = parseInt(new URLSearchParams(window.location.search).get('duree'), 10);
  return (Number.isFinite(n) && n >= 5 ? n : 15) * 1000;
};

// ── Mise à l'échelle de la scène ─────────────────────────────────────────────

function calculerEchelle() {
  const { innerWidth: l, innerHeight: h } = window;
  const echelle = Math.min(l / SCENE.largeur, h / SCENE.hauteur);
  return {
    echelle,
    x: (l - SCENE.largeur * echelle) / 2,
    y: (h - SCENE.hauteur * echelle) / 2,
  };
}

function useEchelle() {
  const [e, setE] = useState(calculerEchelle);
  useEffect(() => {
    const suivre = () => setE(calculerEchelle());
    window.addEventListener('resize', suivre);
    return () => window.removeEventListener('resize', suivre);
  }, []);
  return e;
}

// Image de la scène : fichier 1× ou 2× selon l'échelle d'affichage
function ImageScene({ v, echelle, className = '', alt = v.alt ?? '' }) {
  return (
    <img
      className={className}
      src={v.fichiers[0][0]}
      srcSet={v.fichiers.map(([src, px]) => `${src} ${px}w`).join(', ')}
      sizes={`${Math.ceil(v.largeur * echelle)}px`}
      width={v.largeur}
      height={v.hauteur}
      alt={alt}
    />
  );
}

// ── Données ───────────────────────────────────────────────────────────────────

// Préchargement de toutes les images (pas de chargement différé sur cette page)
const prechargees = new Set();
function precharger(urls) {
  for (const u of urls) {
    if (!u || prechargees.has(u)) continue;
    prechargees.add(u);
    const img = new Image();
    img.src = u;
  }
}

function imagesDesDonnees(data) {
  const logoScr = logoPastille({ mini: data.club?.logo_mini, logo: data.club?.logo });
  const logos = [
    logoScr,
    ...data.prochains.map(p => logoPastille({ mini: p.logo_adversaire_mini, logo: p.logo_adversaire })),
    ...data.equipes.flatMap(e => [
      ...e.resultats.map(r => logoPastille({ mini: r.logo_adversaire_mini, logo: r.logo_adversaire })),
      ...(e.classement?.lignes || []).map(l => logoPastille({ mini: l.logo_mini, logo: l.logo })),
    ]),
  ];
  return logos;
}

/**
 * Premier chargement : nouvel essai toutes les 30 s tant que l'API ne répond pas.
 * Ensuite : rechargement toutes les 5 minutes ; un échec garde les données affichées.
 */
function useDonneesTele() {
  const [data, setData] = useState(null);
  const aDesDonnees = useRef(false);

  useEffect(() => {
    let actif = true;
    let minuteur = null;

    const charger = () => getTele()
      .then(({ data: d }) => {
        if (!actif) return;
        precharger(imagesDesDonnees(d));
        aDesDonnees.current = true;
        setData(d);
        minuteur = setTimeout(charger, RAFRAICHISSEMENT_MS);
      })
      .catch(err => {
        if (!actif) return;
        console.warn('[tele] données non rechargées, dernières données conservées :', err.message);
        // Pas encore de données : nouvel essai rapide ; sinon, au prochain cycle normal
        minuteur = setTimeout(charger, aDesDonnees.current ? RAFRAICHISSEMENT_MS : NOUVEL_ESSAI_MS);
      });

    precharger(IMAGES_FIXES);
    charger();
    return () => { actif = false; clearTimeout(minuteur); };
  }, []);

  return data;
}

// Rechargement complet de la page chaque nuit à 4 h (heure de Paris) : mémoire libérée
function useRechargementNocturne() {
  useEffect(() => {
    const t = setTimeout(() => window.location.reload(), msJusquAQuatreHeures());
    return () => clearTimeout(t);
  }, []);
}

// Heure de Paris, mise à jour à chaque changement de minute
function useMinute() {
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => {
    let intervalle = null;
    const tic = () => setMaintenant(new Date());
    const debut = setTimeout(() => { tic(); intervalle = setInterval(tic, 60 * 1000); }, 60 * 1000 - (Date.now() % 60000) + 50);
    return () => { clearTimeout(debut); clearInterval(intervalle); };
  }, []);
  return maintenant;
}

// ── En-tête ───────────────────────────────────────────────────────────────────

function EnTeteTele({ equipes, active, cycle, duree, echelle }) {
  const maintenant = useMinute();
  const { h, m } = heureParis(maintenant);

  return (
    <header className="tv-entete">
      <div className="tv-marque">
        <ImageScene v={VISUELS_TELE.logoScrDore} echelle={echelle} />
        <h1 className="tv-nom-club"><ImageScene v={VISUELS_TELE.nomClub} echelle={echelle} /></h1>
      </div>

      <ol className="tv-equipes" aria-label="Équipe affichée">
        {equipes.map((e, i) => (
          <li key={e} className={`tv-equipe${i === active ? ' tv-equipe-active' : ''}`}>
            <span className="tv-equipe-nom">{libelleEquipe(e)}</span>
            <span className="tv-barre">
              {/* Remplissage de l'écran en cours sur toute sa durée ; écrans passés : barre pleine */}
              <span
                key={i === active ? `a-${cycle}` : 'repos'}
                className={`tv-barre-remplie${i === active ? ' tv-barre-en-cours' : i < active ? ' tv-barre-pleine' : ''}`}
                style={i === active ? { animationDuration: `${duree}ms` } : undefined}
              />
            </span>
          </li>
        ))}
      </ol>

      <div className="tv-horloge">
        <span className="tv-heure">{h} h {m}</span>
        <span className="tv-date">{dateLongue(isoParis(maintenant))}</span>
      </div>
    </header>
  );
}

// ── Colonne 1 : prochains matchs ─────────────────────────────────────────────

// Un seul billet par équipe : son premier match de la fenêtre. L'API trie déjà
// par équipe (1, 2, 3) puis par date et heure ; l'accueil, lui, les montre tous.
function premierParEquipe(matchs) {
  const vues = new Set();
  return matchs.filter(m => !vues.has(m.equipe) && vues.add(m.equipe));
}

function ColonneBillets({ prochains: tous, fenetre, equipeActive, logoScr, echelle }) {
  const prochains = premierParEquipe(tous);
  const ceWeekEnd = Boolean(fenetre?.est_ce_week_end) && prochains.length > 0;
  const titre = ceWeekEnd ? VISUELS_TELE.titreCeWeekEndAuStade
    : prochains.length === 1 ? VISUELS_TELE.titreProchainMatch
    : VISUELS_TELE.titreProchainsMatchs;
  const enAvant = prochains.some(p => p.equipe === equipeActive);

  return (
    <section className="tv-col tv-col-billets">
      <h2 className="tv-titre"><ImageScene v={titre} echelle={echelle} /></h2>
      {prochains.length === 0 ? (
        <p className="tv-vide">Pas de match programmé pour le moment.</p>
      ) : (
        <div className="tv-billets">
          {prochains.map(m => {
            const etat = !enAvant ? '' : m.equipe === equipeActive ? ' tv-billet-actif' : ' tv-billet-retrait';
            return (
              <div key={`${m.equipe}-${m.date}-${m.heure}`} className={`tv-billet${etat}`}>
                <Billet match={m} logoScr={logoScr} tailles={TAILLES_BILLET} interactif={false} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── Colonne 2 : 3 derniers résultats de l'équipe ─────────────────────────────

const delaiPalette = (ligne, palette) => 0.25 + 0.3 * ligne + 0.15 * palette;

function ResultatTele({ r, index, retournee, logoScr }) {
  const issue = ISSUES_TELE[r.issue];
  const logoAdv = logoPastille({ mini: r.logo_adversaire_mini, logo: r.logo_adversaire });
  const aTab = r.tab_domicile != null && r.tab_exterieur != null;
  const ligne = (nom, scr, score, palette) => (
    <>
      <span className={`tv-res-nom${scr ? ' tv-scr' : ''}`}>
        <Pastille src={scr ? logoScr : logoAdv} taille={29} lazy={false} />
        <span className="tv-res-nom-texte">{nom}</span>
      </span>
      <Palette valeur={score} delai={delaiPalette(index, palette)} retournee={retournee} />
    </>
  );

  return (
    <li className="tv-res">
      <div className="tv-res-haut">
        <p className="tv-res-quand">
          {dateCourte(r.date)} · {r.competition_court || r.competition}{r.journee && r.competition_type === 'CH' ? `, J${r.journee}` : ''}
        </p>
        {issue && <img className="tv-res-issue" src={issue.src} width={issue.largeur} height={29} alt={issue.alt} />}
      </div>
      <div className="tv-res-score">
        {ligne(r.equipe_domicile, r.domicile, r.score_domicile, 0)}
        {ligne(r.equipe_exterieur, !r.domicile, r.score_exterieur, 1)}
      </div>
      {aTab && <p className="tv-res-tab">Tirs au but : {r.tab_domicile}-{r.tab_exterieur}</p>}
    </li>
  );
}

function ColonneResultats({ equipe, resultats, active, logoScr, echelle }) {
  // Les palettes se retournent à chaque apparition de l'écran
  const [retournee, setRetournee] = useState(false);
  useEffect(() => {
    if (!active) {
      const t = setTimeout(() => setRetournee(false), FONDU_MS);   // remises à plat une fois l'écran masqué
      return () => clearTimeout(t);
    }
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setRetournee(true)));
    return () => cancelAnimationFrame(id);
  }, [active]);

  const n = resultats.length;
  const sousTitre = n === 1 ? `Le dernier match de l'${libelleEquipe(equipe)}`
    : `Les ${n} derniers matchs de l'${libelleEquipe(equipe)}`;

  return (
    <section className="tv-col tv-col-resultats">
      <h2 className="tv-titre"><ImageScene v={VISUELS_TELE.titreResultats} echelle={echelle} /></h2>
      {n === 0 ? (
        <p className="tv-vide">Aucun résultat officiel pour l'instant.</p>
      ) : (
        <>
          <p className="tv-sous-titre">{sousTitre}</p>
          <ul className="tv-panneau">
            {resultats.map((r, i) => (
              <ResultatTele key={`${r.date}-${r.adversaire}`} r={r} index={i} retournee={retournee} logoScr={logoScr} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// ── Colonne 3 : classement complet ───────────────────────────────────────────

function ColonneClassement({ equipe, classement, echelle }) {
  const lignes = classement?.lignes || [];
  // Plus de 14 lignes : hauteur réduite pour que tout tienne
  const hauteur = lignes.length > LIGNES_MAX ? Math.floor(HAUTEUR_LIGNES / lignes.length) - 5 : 44;

  return (
    <section className="tv-col tv-col-classement" style={{ '--tv-ligne': `${hauteur}px` }}>
      <h2 className="tv-titre"><ImageScene v={VISUELS_TELE.titreClassements} echelle={echelle} /></h2>
      {lignes.length === 0 ? (
        <p className="tv-vide">{classement?.message || 'Classement pas encore disponible.'}</p>
      ) : (
        <>
          <p className="tv-sous-titre">{infoClassement(classement)}</p>
          <div className="tv-cl" role="table" aria-label={`Classement ${libelleEquipe(equipe)}`}>
            <div className="tv-cl-entete" role="row">
              <span role="columnheader">#</span>
              <span role="columnheader">Club</span>
              <span role="columnheader" className="tv-cl-num">J</span>
              <span role="columnheader" className="tv-cl-num">Diff</span>
              <span role="columnheader" className="tv-cl-num">Pts</span>
            </div>
            {lignes.map(l => (
              <div key={`${l.rang}-${l.club}-${l.club_equipe_no}`} role="row" className={`tv-cl-ligne${l.is_scr ? ' tv-cl-scr' : ''}`}>
                <span role="cell" className="tv-cl-rang">{l.rang}</span>
                <span role="cell" className="tv-cl-club">
                  <Pastille src={logoPastille({ mini: l.logo_mini, logo: l.logo })} taille={26} bordure={!l.is_scr} lazy={false} />
                  <span className="tv-cl-club-nom">{l.nom_affiche}</span>
                </span>
                <span role="cell" className="tv-cl-num">{l.joues}</span>
                <span role="cell" className="tv-cl-num">{diffSignee(l.diff)}</span>
                <span role="cell" className="tv-cl-pts">{l.points}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Tele() {
  const { echelle, x, y } = useEchelle();
  const data = useDonneesTele();
  const [duree] = useState(dureeEcran);
  const [rotation, setRotation] = useState({ active: 0, cycle: 0 });

  useRechargementNocturne();

  // Page plein écran : pas de défilement ni de curseur
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('tv-plein-ecran');
    return () => html.classList.remove('tv-plein-ecran');
  }, []);

  const equipes = data?.equipes || [];
  const nbEcrans = equipes.length;

  // Rotation : Équipe 1 → 2 → 3 → 1…
  useEffect(() => {
    if (nbEcrans === 0) return undefined;
    const t = setInterval(() => {
      setRotation(r => ({ active: (r.active + 1) % nbEcrans, cycle: r.cycle + 1 }));
    }, duree);
    return () => clearInterval(t);
  }, [nbEcrans, duree]);

  const active = nbEcrans ? rotation.active % nbEcrans : 0;
  const logoScr = data ? logoPastille({ mini: data.club?.logo_mini, logo: data.club?.logo }) : null;

  return (
    <div className="tv">
      <div
        className="tv-scene"
        style={{ transform: `translate(${x}px, ${y}px) scale(${echelle})`, '--tv-grain': `url(${GRAIN_TELE})` }}
      >
        {!data ? (
          // API muette au premier chargement : écran d'attente, nouvel essai toutes les 30 s
          <div className="tv-attente">
            <ImageScene v={{ ...VISUELS_TELE.logoScrDore, largeur: 160, hauteur: 175 }} echelle={echelle} />
            <ImageScene v={VISUELS_TELE.slogan} echelle={echelle} />
          </div>
        ) : (
          <>
            <EnTeteTele equipes={equipes.map(e => e.equipe)} active={active} cycle={rotation.cycle} duree={duree} echelle={echelle} />
            <main className="tv-contenu">
              <ColonneBillets prochains={data.prochains} fenetre={data.fenetre}
                equipeActive={equipes[active]?.equipe} logoScr={logoScr} echelle={echelle} />
              {/* Écrans des équipes superposés : fondu enchaîné sur l'opacité */}
              <div className="tv-ecrans">
                {equipes.map((e, i) => (
                  <div key={e.equipe} className={`tv-ecran${i === active ? ' tv-ecran-actif' : ''}`} aria-hidden={i !== active}>
                    <ColonneResultats equipe={e.equipe} resultats={e.resultats} active={i === active} logoScr={logoScr} echelle={echelle} />
                    <ColonneClassement equipe={e.equipe} classement={e.classement} echelle={echelle} />
                  </div>
                ))}
              </div>
            </main>
          </>
        )}
      </div>
    </div>
  );
}

