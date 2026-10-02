/**
 * Données de la page d'accueil publique (GET /api/public/accueil)
 *
 * Une seule réponse : prochains matchs (week-end ou jour du prochain match) et
 * leur résumé, derniers résultats officiels FFF, classements et identité du club.
 * Lecture seule en base, aucun appel à la FFF. Toutes les dates sont calculées
 * en heure de Paris.
 *
 * Cache mémoire : vidé par invaliderCache() à la fin de chaque tâche FFF
 * (services/scheduler.js), avec une durée de vie maximale de 10 minutes.
 */

const pool = require('../db');
const club = require('../config/club');
const { lireClassements, saisonCourante } = require('./fffClassement');
const { miniSiDisponible } = require('../utils/logoMini');
const {
  nommerAdversaire, SQL_JOIN_CLUB_ADVERSAIRE, SQL_LOGO_ADVERSAIRE, SQL_NOMS_ADVERSAIRE,
} = require('./clubsFff');

const TZ           = 'Europe/Paris';
const CACHE_TTL_MS = 10 * 60 * 1000;

// ── Dates (heure de Paris) ────────────────────────────────────────────────────

// Date du jour à Paris au format 'YYYY-MM-DD'
const dateParis = (d = new Date()) => new Intl.DateTimeFormat('fr-CA', { timeZone: TZ }).format(d);

function ajouterJours(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const jourSemaine = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();   // 0 = dimanche

// Fenêtre d'affichage des prochains matchs autour d'un jour de match :
// vendredi, samedi ou dimanche → du vendredi au dimanche de ce week-end ; sinon ce seul jour
function fenetreAutour(jour) {
  const j = jourSemaine(jour);
  if (j === 5 || j === 6 || j === 0) {
    const vendredi = ajouterJours(jour, -((j + 2) % 7));
    return { debut: vendredi, fin: ajouterJours(vendredi, 2), weekEnd: true };
  }
  return { debut: jour, fin: jour, weekEnd: false };
}

// Samedi et dimanche à venir ; un dimanche, seul le jour même compte (samedi = null)
function weekEnd(aujourdhui) {
  const j = jourSemaine(aujourdhui);
  if (j === 6) return { samedi: aujourdhui, dimanche: ajouterJours(aujourdhui, 1) };
  if (j === 0) return { samedi: null, dimanche: aujourdhui };
  return { samedi: ajouterJours(aujourdhui, 6 - j), dimanche: ajouterJours(aujourdhui, 7 - j) };
}

// ── Mise en forme ─────────────────────────────────────────────────────────────

// "SCR 2" → "SC Roeschwoog 2" ; "SCR 1" → "SC Roeschwoog"
function nomEquipeScr(equipe) {
  const n = parseInt(String(equipe).replace(/\D/g, ''), 10);
  return n > 1 ? `${club.nom} ${n}` : club.nom;
}

function competitionCourt(nom) {
  if (!nom) return null;
  return /^COUPE DE FRANCE/i.test(nom) ? 'Coupe de France' : nom;
}

function lienItineraire(t) {
  if (!t.adresse) return null;
  const q = [t.nom, t.adresse, [t.cp, t.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

const heureCourte = (h) => (h ? String(h).slice(0, 5) : null);

// ── Requêtes ──────────────────────────────────────────────────────────────────

// Logo adversaire : logo local (clubs, par cl_no puis par nom) sinon logo FFF du match.
// Les logos temporaires (Octobre Rose…) sont volontairement ignorés.
// Nom adversaire : nom d'affichage du club (clubsFff.nomClub), appliqué par nommerAdversaire().

// Premier jour à venir ayant un match programmé, toutes équipes confondues
const SQL_PREMIER_JOUR = `
  SELECT MIN(date)::text AS jour FROM matches WHERE statut = 'programme' AND date >= $1::date`;

// Matchs programmés de la fenêtre (jours passés exclus), reportés compris,
// dans l'ordre des équipes (SCR 1, 2, 3) quelle que soit l'heure
const SQL_PROCHAINS = `
  SELECT m.equipe, m.division, m.competition_type, m.journee, m.date, m.heure, m.domicile,
         m.adversaire, m.adversaire_equipe_no, ${SQL_NOMS_ADVERSAIRE}, ${SQL_LOGO_ADVERSAIRE} AS logo,
         m.terrain_nom, m.terrain_adresse, m.terrain_cp, m.terrain_ville, m.reporte
    FROM matches m
    ${SQL_JOIN_CLUB_ADVERSAIRE}
   WHERE m.statut = 'programme' AND m.date BETWEEN GREATEST($1::date, $2::date) AND $3::date
   ORDER BY m.equipe, m.date, m.heure NULLS LAST`;

// Dernier score officiel FFF (amicaux et scores non publiés exclus d'office)
const SQL_RESULTATS = `
  SELECT DISTINCT ON (m.equipe)
         m.equipe, m.division, m.competition_type, m.date, m.domicile,
         m.adversaire, m.adversaire_equipe_no, ${SQL_NOMS_ADVERSAIRE}, ${SQL_LOGO_ADVERSAIRE} AS logo,
         m.score_scr, m.score_adv, m.tab_domicile, m.tab_exterieur
    FROM matches m
    ${SQL_JOIN_CLUB_ADVERSAIRE}
   WHERE m.score_source = 'fff' AND m.date <= $1::date
   ORDER BY m.equipe, m.date DESC, m.heure DESC NULLS LAST`;


// ── Construction ──────────────────────────────────────────────────────────────

// Noms complets et courts des deux équipes, dans l'ordre domicile / extérieur.
// SCR : config/club.js (« SC Roeschwoog 2 ») ; adversaire : nom d'affichage (nommerAdversaire).
function equipesDuMatch(r) {
  const scr = nomEquipeScr(r.equipe);
  const [dom, ext]           = r.domicile ? [scr, r.adversaire] : [r.adversaire, scr];
  const [domCourt, extCourt] = r.domicile ? [scr, r.adversaire_court] : [r.adversaire_court, scr];
  return {
    equipe_domicile:        dom,
    equipe_exterieur:       ext,
    equipe_domicile_court:  domCourt,
    equipe_exterieur_court: extCourt,
  };
}

function formaterProchain(ligne) {
  const r = nommerAdversaire(ligne, { court: true });
  const terrain = { nom: r.terrain_nom, adresse: r.terrain_adresse, cp: r.terrain_cp, ville: r.terrain_ville };
  return {
    equipe:            r.equipe,
    competition:       r.division,
    competition_court: competitionCourt(r.division),
    competition_type:  r.competition_type,
    journee:           r.journee,
    date:              r.date,
    heure:             heureCourte(r.heure),
    domicile:          r.domicile,
    adversaire:        r.adversaire,
    adversaire_court:  r.adversaire_court,
    logo_adversaire:   r.logo,
    logo_adversaire_mini: miniSiDisponible(r.logo),   // 64 px, logos locaux seulement
    ...equipesDuMatch(r),
    terrain,
    lien_itineraire:   lienItineraire(terrain),
    reporte:           r.reporte,
  };
}

function formaterResultat(ligne) {
  const r = nommerAdversaire(ligne, { court: true });
  const aTab = r.tab_domicile != null && r.tab_exterieur != null;
  const tabScr = aTab ? (r.domicile ? r.tab_domicile : r.tab_exterieur) : null;
  const tabAdv = aTab ? (r.domicile ? r.tab_exterieur : r.tab_domicile) : null;

  let issue = r.score_scr > r.score_adv ? 'victoire' : r.score_scr < r.score_adv ? 'defaite' : 'nul';
  let auxTab = false;
  if (issue === 'nul' && aTab && tabScr !== tabAdv) {
    auxTab = true;
    issue = tabScr > tabAdv ? 'victoire' : 'defaite';
  }

  return {
    equipe:            r.equipe,
    competition:       r.division,
    competition_court: competitionCourt(r.division),
    competition_type:  r.competition_type,
    date:              r.date,
    domicile:          r.domicile,
    adversaire:        r.adversaire,
    adversaire_court:  r.adversaire_court,
    logo_adversaire:   r.logo,
    logo_adversaire_mini: miniSiDisponible(r.logo),
    ...equipesDuMatch(r),
    score_domicile:    r.domicile ? r.score_scr : r.score_adv,
    score_exterieur:   r.domicile ? r.score_adv : r.score_scr,
    tab_domicile:      aTab ? r.tab_domicile : null,
    tab_exterieur:     aTab ? r.tab_exterieur : null,
    issue,
    aux_tab:           auxTab,
  };
}

function formaterClassements(classements) {
  const result = {};
  for (const [equipe, c] of Object.entries(classements)) {
    result[equipe] = {
      division:   c.division,
      poule:      c.poule,
      journee:    c.journee,
      mis_a_jour: c.mis_a_jour,
      lignes: c.rows.map(r => ({
        rang:           r.rank,
        club:           r.club,
        club_equipe_no: r.club_equipe_no,
        nom_affiche:    r.equipe,         // nom d'affichage (sinon FFF) + numéro d'équipe
        nom_court:      r.equipe_court,
        logo:           r.logo,
        logo_mini:      miniSiDisponible(r.logo),
        points:         r.points,
        joues:          r.joues,
        victoires:      r.victoires,
        nuls:           r.nuls,
        defaites:       r.defaites,
        buts_pour:      r.buts_pour,
        buts_contre:    r.buts_contre,
        diff:           r.diff,
        is_scr:         r.isSCR,
      })),
    };
    if (c.message) result[equipe].message = c.message;
  }
  return result;
}

/**
 * Construit la réponse sans cache.
 * `aujourdhui` ('YYYY-MM-DD') est injectable pour les tests ; par défaut, la date de Paris.
 */
async function construireAccueil({ aujourdhui = dateParis() } = {}) {
  const [premier, resultats, classements] = await Promise.all([
    pool.query(SQL_PREMIER_JOUR, [aujourdhui]),
    pool.query(SQL_RESULTATS, [aujourdhui]),
    lireClassements(),
  ]);

  // Fenêtre : week-end (vendredi-dimanche) ou jour isolé du prochain match
  const jour = premier.rows[0].jour;
  const f = jour ? fenetreAutour(jour) : null;
  const prochains = f ? (await pool.query(SQL_PROCHAINS, [aujourdhui, f.debut, f.fin])).rows : [];

  // « Ce week-end » : le week-end en cours ou le prochain samedi-dimanche
  const we = weekEnd(aujourdhui);
  const domicile = prochains.filter(m => m.domicile).length;
  const fenetre = {
    debut:           f?.debut ?? null,
    fin:             f?.fin ?? null,
    est_ce_week_end: Boolean(f?.weekEnd && f.fin === we.dimanche),
    matchs:          prochains.length,
    domicile,
    exterieur:       prochains.length - domicile,
  };

  const saison = saisonCourante(new Date(`${aujourdhui}T12:00:00Z`));

  return {
    // logo : logo SCR enregistré dans l'admin ; logo_mini : sa miniature 64 px (pastilles)
    club: { nom: club.nom, logo: club.logo, logo_mini: miniSiDisponible(club.logo), saison: `${saison}-${saison + 1}` },
    prochains:   prochains.map(formaterProchain),
    fenetre,
    resultats:   resultats.rows.map(formaterResultat),
    classements: formaterClassements(classements),
    genere_at:   new Date().toISOString(),
  };
}

// ── Cache ─────────────────────────────────────────────────────────────────────

let cache = null;   // { data, at }

function invaliderCache() {
  cache = null;
}

// Réponse de la route publique : servie depuis le cache s'il est valide
async function getAccueil() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  const data = await construireAccueil();
  cache = { data, at: Date.now() };
  return data;
}

module.exports = { getAccueil, construireAccueil, invaliderCache };
