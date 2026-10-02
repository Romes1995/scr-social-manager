/**
 * Classements de championnat FFF (API DOFA) stockés en base
 *
 * refreshClassements() : récupère le classement de chaque équipe SCR engagée en
 *   championnat et le remplace en base, en une transaction par équipe. Si la
 *   récupération ou le contrôle échoue, l'ancien classement reste en place.
 *   Réutilisable par une tâche planifiée. Chaque club du classement est rattaché
 *   ou créé dans clubs par son cl_no (services/clubsFff.js).
 * lireClassements()    : lecture seule depuis la base (routes publiques).
 *
 * Rien n'est codé en dur : la saison se déduit de la date et la poule de chaque
 * équipe se déduit de ses matchs de championnat (competition_type = 'CH').
 */

const pool = require('../db');
const club = require('../config/club');
const {
  getWithRetry, sleep, toTitleCase, normalizeName, DOFA_BASE, DOFA_HEADERS, SCR_CL_NO,
} = require('./fffImport');
const { assurerClubs, nomClub, sqlLogoParNom } = require('./clubsFff');

// ── Saison ────────────────────────────────────────────────────────────────────

// Saison FFF en cours : à partir de juillet, nouvelle saison (oct. 2026 → 2026)
function saisonCourante(date = new Date()) {
  const [annee, mois] = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit',
  }).format(date).split('-').map(Number);
  return mois >= 7 ? annee : annee - 1;
}

const bornesSaison = (saison) => [`${saison}-07-01`, `${saison + 1}-06-30`];

// ── Poules ────────────────────────────────────────────────────────────────────

// Poule de championnat de chaque équipe SCR : celle de son dernier match CH déjà
// passé, à défaut celle de son prochain (gère un changement de poule en saison).
async function trouverPoules(saison) {
  const [debut, fin] = bornesSaison(saison);
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (equipe)
            equipe, division, fff_cp_no, fff_phase_no, fff_poule_no, poule_nom
       FROM matches
      WHERE competition_type = 'CH'
        AND fff_cp_no IS NOT NULL AND fff_phase_no IS NOT NULL AND fff_poule_no IS NOT NULL
        AND date BETWEEN $1 AND $2
      ORDER BY equipe,
               (date <= CURRENT_DATE) DESC,
               CASE WHEN date <= CURRENT_DATE THEN date END DESC,
               date ASC`,
    [debut, fin]
  );
  return rows;
}

// ── Récupération et contrôle ──────────────────────────────────────────────────

async function fetchClassementDOFA(poule) {
  const url = `${DOFA_BASE}/api/compets/${poule.fff_cp_no}/phases/${poule.fff_phase_no}`
            + `/poules/${poule.fff_poule_no}/classement_journees`;
  const resp = await getWithRetry(url, { timeout: 15000, headers: DOFA_HEADERS });
  return resp.data?.['hydra:member'] || [];
}

// Journée affichée : valeur la plus fréquente de « matchs joués » dans la poule
// (la plus grande en cas d'égalité). Le cj_no FFF n'est pas fiable : un match
// avancé ou reporté le fait sauter (ex. cj_no 11 après 3 journées).
function journeeLaPlusFrequente(lignes) {
  const freq = new Map();
  for (const l of lignes) freq.set(l.joues, (freq.get(l.joues) || 0) + 1);
  let meilleure = null;
  let meilleureFreq = 0;
  for (const [joues, n] of freq) {
    if (n > meilleureFreq || (n === meilleureFreq && joues > meilleure)) {
      meilleure = joues;
      meilleureFreq = n;
    }
  }
  return meilleure;
}

const ENTIERS = [
  'rang', 'points', 'joues', 'victoires', 'nuls', 'defaites',
  'forfaits', 'penalites', 'buts_pour', 'buts_contre', 'club_cl_no',
];

// Convertit et contrôle le JSON DOFA ; lève une erreur si le classement est inexploitable
function parseClassement(members, logos) {
  if (!Array.isArray(members) || members.length === 0) {
    throw new Error('classement vide');
  }

  const lignes = members.map(x => {
    const club = toTitleCase(x.equipe?.short_name || '');
    const l = {
      rang:           x.rank,
      club,
      club_cl_no:     x.equipe?.club?.cl_no,
      club_equipe_no: x.equipe?.code ?? x.equipe?.number ?? 1,
      points:         x.point_count,
      joues:          x.total_games_count,
      victoires:      x.won_games_count,
      nuls:           x.draw_games_count,
      defaites:       x.lost_games_count,
      forfaits:       x.forfeits_games_count ?? 0,
      penalites:      x.penalty_point_count ?? 0,
      buts_pour:      x.goals_for_count,
      buts_contre:    x.goals_against_count,
      is_scr:         x.equipe?.club?.cl_no === SCR_CL_NO,
      fff_journee_no: x.cj_no ?? null,
      classement_date: x.date ? String(x.date).slice(0, 10) : null,
    };
    // goals_diff DOFA est une valeur absolue : on recalcule la différence signée
    l.diff     = l.buts_pour - l.buts_contre;
    l.logo_url = l.is_scr ? null : (logos.get(club) || null);
    l.autres_noms = [x.equipe?.short_name_ligue, x.equipe?.short_name_federation]
      .filter(Boolean).map(normalizeName);

    if (!club) throw new Error(`club sans nom (rang ${x.rank})`);
    for (const k of ENTIERS) {
      if (!Number.isInteger(l[k])) throw new Error(`valeur non numérique : ${k} = ${JSON.stringify(l[k])} (${club})`);
    }
    return l;
  });

  if (!lignes.some(l => l.is_scr)) throw new Error('ligne SCR absente du classement');

  lignes.sort((a, b) => a.rang - b.rang);
  return lignes;
}

// Logos adversaires connus, par nom (matches.adversaire = short_name en Title Case)
async function chargerLogos() {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (adversaire) adversaire, logo_adversaire
       FROM matches
      WHERE logo_adversaire IS NOT NULL
      ORDER BY adversaire, date DESC`
  );
  return new Map(rows.map(r => [r.adversaire, r.logo_adversaire]));
}

// ── Remplacement en base ──────────────────────────────────────────────────────

async function remplacerClassement(saison, poule, lignes, journee) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM classements WHERE equipe = $1 AND saison = $2', [poule.equipe, saison]);

    for (const l of lignes) {
      await client.query(
        `INSERT INTO classements
           (equipe, saison, division, fff_cp_no, fff_phase_no, fff_poule_no, poule_nom,
            rang, club, club_cl_no, club_equipe_no, logo_url,
            points, joues, victoires, nuls, defaites, forfaits, penalites,
            buts_pour, buts_contre, diff, is_scr,
            journee, fff_journee_no, classement_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
                 $20,$21,$22,$23,$24,$25,$26)`,
        [
          poule.equipe, saison, poule.division, poule.fff_cp_no, poule.fff_phase_no,
          poule.fff_poule_no, poule.poule_nom,
          l.rang, l.club, l.club_cl_no, l.club_equipe_no, l.logo_url,
          l.points, l.joues, l.victoires, l.nuls, l.defaites, l.forfaits, l.penalites,
          l.buts_pour, l.buts_contre, l.diff, l.is_scr,
          journee, l.fff_journee_no, l.classement_date,
        ]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ── Point d'entrée ────────────────────────────────────────────────────────────

/**
 * Rafraîchit les classements de toutes les équipes SCR engagées en championnat.
 * `fetcher` est injectable (tests : simulation d'une panne de la source FFF).
 */
async function refreshClassements({ fetcher = fetchClassementDOFA } = {}) {
  const saison = saisonCourante();
  const poules = await trouverPoules(saison);
  const logos  = await chargerLogos();
  const equipes = {};
  const clubsVus = [];

  if (poules.length === 0) {
    console.warn(`[Classement] Aucune poule de championnat en base pour la saison ${saison} (lancer l'import FFF)`);
  }

  for (const [i, poule] of poules.entries()) {
    if (i > 0) await sleep(1000 + Math.random() * 1000);   // 1 à 2 s entre deux appels DOFA
    try {
      const members = await fetcher(poule);
      const lignes  = parseClassement(members, logos);
      const journee = journeeLaPlusFrequente(lignes);
      await remplacerClassement(saison, poule, lignes, journee);
      clubsVus.push(...lignes.filter(l => !l.is_scr)
        .map(l => ({ cl_no: l.club_cl_no, nom: l.club, autresNoms: l.autres_noms })));

      const scr = lignes.find(l => l.is_scr);
      equipes[poule.equipe] = { ok: true, lignes: lignes.length, journee, rang_scr: scr.rang };
      console.log(`[Classement] ✅ ${poule.equipe} (${poule.division}, ${poule.poule_nom}) : ${lignes.length} clubs, journée ${journee}, SCR ${scr.rang}e`);
    } catch (err) {
      const status = err.response?.status;
      const erreur = status ? `HTTP ${status} : ${err.message}` : err.message;
      equipes[poule.equipe] = { ok: false, erreur };
      console.error(`[Classement] ❌ ${poule.equipe} : ${erreur} (ancien classement conservé)`);
    }
  }

  // Clubs rencontrés : rattachés ou créés après coup (n'affecte pas les classements)
  const clubs = await assurerClubs(clubsVus);
  if (clubs.crees.length || clubs.rattaches.length || clubs.renommes.length || clubs.ambigus.length) {
    console.log(`[Classement] Clubs : ${clubs.crees.length} créé(s), ${clubs.rattaches.length} rattaché(s), ` +
                `${clubs.renommes.length} renommé(s), ${clubs.ambigus.length} ambigu(s)`);
  }

  return { saison, equipes, clubs };
}

// ── Lecture (routes publiques) ────────────────────────────────────────────────

const MESSAGE_ABSENT = 'Classement pas encore récupéré depuis la FFF';

/**
 * Classements en base, au format historique de /classement-par-equipe :
 * { "SCR 1": { division, poule, journee, mis_a_jour, rows: [{ rank, equipe, points, … }] } }
 * Une équipe engagée en championnat mais sans classement en base renvoie rows: []
 * et un message.
 */
async function lireClassements({ equipe = null } = {}) {
  const saison = saisonCourante();

  const { rows } = await pool.query(
    // Logo affiché : logo du club SCR (config/club.js) pour SCR ; sinon logo local
    // (clubs, par cl_no puis par nom comme les matchs) ; à défaut, logo FFF stocké.
    `SELECT cl.*,
            CASE WHEN cl.is_scr THEN $3
                 ELSE COALESCE(ca.logo_url, ${sqlLogoParNom('cl.club')}, cl.logo_url)
            END AS logo_affiche,
            ca.nom_affiche AS ca_nom_affiche, ca.nom_court AS ca_nom_court, ca.nom_fff AS ca_nom_fff
       FROM classements cl
       LEFT JOIN clubs ca ON ca.fff_cl_no = cl.club_cl_no AND NOT cl.is_scr
      WHERE cl.saison = $1 AND ($2::text IS NULL OR cl.equipe = $2)
      ORDER BY cl.equipe, cl.rang`,
    [saison, equipe, club.logo]
  );

  const result = {};

  // Équipes engagées en championnat cette saison : présentes même sans classement
  const equipesAttendues = (await trouverPoules(saison)).map(p => p.equipe)
    .filter(e => equipe === null || e === equipe);
  for (const e of equipesAttendues) {
    result[e] = { division: null, poule: null, journee: null, mis_a_jour: null, rows: [], message: MESSAGE_ABSENT };
  }

  for (const r of rows) {
    if (!result[r.equipe] || result[r.equipe].rows.length === 0) {
      result[r.equipe] = {
        division:   r.division,
        poule:      r.poule_nom,
        journee:    r.journee,
        mis_a_jour: r.recupere_at,
        rows:       [],
      };
    }
    // equipe : nom d'affichage du club (sinon nom FFF), avec le numéro d'équipe s'il est > 1 ;
    // ligne SCR : nom de config/club.js (« SC Roeschwoog 2 »), comme dans les résultats
    const nomsClub = r.is_scr
      ? { nom: club.nom }
      : { nom_affiche: r.ca_nom_affiche, nom_court: r.ca_nom_court, nom_fff: r.ca_nom_fff, nom: r.club };
    result[r.equipe].rows.push({
      rank:        r.rang,
      equipe:      nomClub(nomsClub, r.club_equipe_no),
      equipe_court: nomClub(nomsClub, r.club_equipe_no, { court: true }),
      club:        r.club,
      club_equipe_no: r.club_equipe_no,
      logo:        r.logo_affiche,
      points:      r.points,
      joues:       r.joues,
      victoires:   r.victoires,
      nuls:        r.nuls,
      defaites:    r.defaites,
      buts_pour:   r.buts_pour,
      buts_contre: r.buts_contre,
      diff:        r.diff,
      isSCR:       r.is_scr,
    });
  }

  return result;
}

module.exports = {
  refreshClassements, lireClassements, saisonCourante, journeeLaPlusFrequente, MESSAGE_ABSENT,
};
