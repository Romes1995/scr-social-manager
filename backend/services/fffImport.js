/**
 * Import des matchs SCR depuis l'API FFF DOFA (api-dofa.fff.fr)
 *
 * importFFF() est réutilisable (route POST /api/fff/save, future tâche planifiée).
 * Règles :
 *  - clé de rapprochement : fff_match_id (= ma_no) ; une ligne existante sans
 *    fff_match_id est rattachée sur (equipe, date, adversaire), puis sur
 *    (equipe, date, nom normalisé) ; aucune ligne n'est créée si un
 *    rattachement est possible ;
 *  - la FFF fait foi sur le score : un score FFF publié écrase le score app ;
 *  - buteurs n'est jamais modifié ;
 *  - chaque club adverse est rattaché ou créé dans clubs par son cl_no
 *    (services/clubsFff.js), sans toucher à ses noms d'affichage ni à ses logos.
 */

const axios = require('axios');
const pool  = require('../db');

// API FFF DOFA (publique, sans authentification)
const DOFA_BASE = 'https://api-dofa.fff.fr';
const SCR_CL_NO = 2131;   // Numéro interne FFF du SC Roeschwoog (≠ affiliation 504189)

const DOFA_HEADERS = {
  'Accept': 'application/json, */*',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'fr-FR,fr;q=0.9',
  'Referer': 'https://www.fff.fr/',
  'Origin': 'https://www.fff.fr',
};

const RESULTATS = ['GA', 'PE', 'NU'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function toTitleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// "16H00" → "16:00", "" → null
function parseHeure(time) {
  if (!time) return null;
  const clean = time.replace('H', ':').trim();
  return /^\d{2}:\d{2}$/.test(clean) ? clean : null;
}

// Minuscules, sans accents ni ponctuation : "Strg Neuhof C.S" → "strg neuhof c s"
function normalizeName(str) {
  return String(str || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Drapeaux DOFA dont les valeurs « vraies » n'ont pas encore été observées :
// tout ce qui n'est ni "", ni "N", ni null est considéré comme vrai et loggé.
function isTruthyFlag(value, label, maNo) {
  if (value === null || value === undefined || value === '' || value === 'N') return false;
  console.warn(`[FFF] ma_no=${maNo} ${label} = ${JSON.stringify(value)} (traité comme vrai)`);
  return true;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// L'API DOFA est derrière Akamai et bloque parfois une requête ponctuelle
// (403 "Application momentanément indisponible") sans que le club ne soit
// réellement banni : une seconde tentative après un court délai suffit.
async function getWithRetry(url, options) {
  try {
    return await axios.get(url, options);
  } catch (err) {
    const status = err.response?.status;
    if (status === 403 || status >= 500) {
      console.warn(`[FFF] HTTP ${status} sur ${url}, nouvelle tentative dans 2s…`);
      await sleep(2000);
      return axios.get(url, options);
    }
    throw err;
  }
}

// ── Récupération DOFA ─────────────────────────────────────────────────────────

// Récupère TOUS les matchs du club SCR (toutes pages, toute la saison)
async function fetchAllMatchesDOFA() {
  const allRaw = [];
  let url = `${DOFA_BASE}/api/clubs/${SCR_CL_NO}/matchs?page=1`;

  console.log(`[FFF] Récupération des matchs SCR (cl_no=${SCR_CL_NO}) depuis ${DOFA_BASE}…`);

  while (url) {
    const resp = await getWithRetry(url, { timeout: 10000, headers: DOFA_HEADERS });

    const data    = resp.data;
    const members = data['hydra:member'] || [];
    allRaw.push(...members);

    const nextPath = data['hydra:view']?.['hydra:next'];
    url = nextPath ? `${DOFA_BASE}${nextPath}` : null;

    console.log(`[FFF]   page chargée : ${members.length} matchs (total cumulé : ${allRaw.length})`);

    // Pause de 1 à 2 s entre deux pages pour ménager Akamai
    if (url) await sleep(1000 + Math.random() * 1000);
  }

  console.log(`[FFF] Total matchs bruts récupérés : ${allRaw.length}`);
  return allRaw;
}

// Convertit un match brut DOFA en objet prêt pour la BDD (null si non exploitable)
function parseMatch(raw) {
  const scrIsHome = raw.home?.club?.cl_no === SCR_CL_NO;
  const scrSide   = scrIsHome ? raw.home : raw.away;
  const advSide   = scrIsHome ? raw.away : raw.home;

  if (!scrSide || !advSide) return null;   // SCR exempt ou match incomplet

  // `code` est le rang réel de l'équipe (1/2/3), `number` est inversé pour les réserves
  const teamNumber = scrSide.code ?? scrSide.number ?? 1;

  const hasScore = raw.home_score !== null && raw.home_score !== undefined
                && raw.away_score !== null && raw.away_score !== undefined;

  const terrain = raw.terrain || null;
  const resu    = scrIsHome ? raw.home_resu : raw.away_resu;
  const maNo    = raw.ma_no;

  return {
    fff_match_id:     maNo,
    equipe:           `SCR ${teamNumber}`,
    adversaire:       toTitleCase(advSide.short_name || 'Inconnu'),
    adversaire_noms:  [advSide.short_name, advSide.short_name_ligue, advSide.short_name_federation]
                        .filter(Boolean).map(normalizeName),
    adversaire_cl_no:     advSide.club?.cl_no ?? null,
    adversaire_equipe_no: advSide.code ?? advSide.number ?? null,
    logo_adversaire:  advSide.club?.logo || null,
    date:             new Date(raw.date).toISOString().slice(0, 10),
    heure:            parseHeure(raw.time),
    domicile:         scrIsHome,
    division:         raw.competition?.name || null,
    competition_type: raw.competition?.type || null,
    journee:          raw.poule_journee?.number ?? null,
    fff_cp_no:        raw.competition?.cp_no ?? null,
    fff_phase_no:     raw.phase?.number ?? null,
    fff_poule_no:     raw.poule?.stage_number ?? null,
    poule_nom:        raw.poule?.name || null,

    lieu:             terrain ? [terrain.name, terrain.city].filter(Boolean).join(', ') || null : null,
    terrain_nom:      terrain?.name     || null,
    terrain_adresse:  terrain?.address  || null,
    terrain_cp:       terrain?.zip_code || null,
    terrain_ville:    terrain?.city     || null,

    has_score:        hasScore,
    score_scr:        hasScore ? (scrIsHome ? raw.home_score : raw.away_score) : null,
    score_adv:        hasScore ? (scrIsHome ? raw.away_score : raw.home_score) : null,
    // tab_domicile / tab_exterieur = équipe qui reçoit / qui se déplace (comme la FFF)
    tab_domicile:     raw.home_nb_tir_but ?? null,
    tab_exterieur:    raw.away_nb_tir_but ?? null,
    fff_resultat:     RESULTATS.includes(resu) ? resu : null,
    statut:           hasScore ? 'termine' : 'programme',

    forfait_scr: isTruthyFlag(scrIsHome ? raw.home_is_forfeit : raw.away_is_forfeit, 'forfait SCR', maNo),
    forfait_adv: isTruthyFlag(scrIsHome ? raw.away_is_forfeit : raw.home_is_forfeit, 'forfait adversaire', maNo),
    reporte:     isTruthyFlag(raw.seems_postponed, 'seems_postponed', maNo)
              || isTruthyFlag(raw.initial_date, 'initial_date', maNo),

    fff_updated_at: raw.external_updated_at || null,
  };
}

// Parse et filtre les matchs bruts (SCR uniquement, sans doublon de ma_no)
function parseAll(rawMatches) {
  const matchs  = [];
  const skipped = [];
  const seen    = new Set();

  for (const raw of rawMatches) {
    const scrIsHome = raw.home?.club?.cl_no === SCR_CL_NO;
    const scrIsAway = raw.away?.club?.cl_no === SCR_CL_NO;
    if (!scrIsHome && !scrIsAway) continue;

    const parsed = parseMatch(raw);
    if (!parsed) {
      skipped.push({ fff_match_id: raw.ma_no, raison: 'SCR exempt ou adversaire absent' });
      console.log(`[FFF] ma_no=${raw.ma_no} ignoré (SCR exempt ou adversaire absent)`);
      continue;
    }
    if (seen.has(parsed.fff_match_id)) continue;
    seen.add(parsed.fff_match_id);
    matchs.push(parsed);
  }

  matchs.sort((a, b) => new Date(a.date) - new Date(b.date));
  return { matchs, skipped };
}

// ── Rapprochement ─────────────────────────────────────────────────────────────

// Retourne { row, how } ou { row: null, how: 'ambigu', candidats } ou { row: null }
async function findExisting(client, m) {
  let r = await client.query(
    'SELECT * FROM matches WHERE fff_match_id = $1 FOR UPDATE', [m.fff_match_id]);
  if (r.rows[0]) return { row: r.rows[0], how: 'fff_match_id' };

  r = await client.query(
    `SELECT * FROM matches
      WHERE fff_match_id IS NULL AND equipe = $1 AND date = $2 AND adversaire = $3
      FOR UPDATE`,
    [m.equipe, m.date, m.adversaire]);
  if (r.rows.length === 1) return { row: r.rows[0], how: 'exact' };

  r = await client.query(
    `SELECT * FROM matches
      WHERE fff_match_id IS NULL AND equipe = $1 AND date = $2
      FOR UPDATE`,
    [m.equipe, m.date]);
  const candidats = r.rows.filter(row => m.adversaire_noms.includes(normalizeName(row.adversaire)));
  if (candidats.length === 1) return { row: candidats[0], how: 'normalise' };
  if (candidats.length > 1)   return { row: null, how: 'ambigu', candidats: candidats.map(c => c.id) };

  return { row: null, how: null };
}

// ── Écriture d'un match ───────────────────────────────────────────────────────

async function insertMatch(client, m) {
  const { rows } = await client.query(
    `INSERT INTO matches
       (equipe, adversaire, logo_adversaire, date, heure, lieu, domicile, division, statut,
        score_scr, score_adv, tab_domicile, tab_exterieur, score_source, score_fff_at, fff_resultat,
        fff_match_id, journee, competition_type,
        terrain_nom, terrain_adresse, terrain_cp, terrain_ville,
        forfait_scr, forfait_adv, reporte, fff_updated_at,
        fff_cp_no, fff_phase_no, fff_poule_no, poule_nom,
        adversaire_cl_no, adversaire_equipe_no)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,
             $28,$29,$30,$31,$32,$33)
     RETURNING id`,
    [
      m.equipe, m.adversaire, m.logo_adversaire, m.date, m.heure, m.lieu, m.domicile, m.division,
      m.statut,
      m.has_score ? m.score_scr : null, m.has_score ? m.score_adv : null,
      m.has_score ? m.tab_domicile : null, m.has_score ? m.tab_exterieur : null,
      m.has_score ? 'fff' : null,
      m.has_score ? new Date() : null,
      m.has_score ? m.fff_resultat : null,
      m.fff_match_id, m.journee, m.competition_type,
      m.terrain_nom, m.terrain_adresse, m.terrain_cp, m.terrain_ville,
      m.forfait_scr, m.forfait_adv, m.reporte, m.fff_updated_at,
      m.fff_cp_no, m.fff_phase_no, m.fff_poule_no, m.poule_nom,
      m.adversaire_cl_no, m.adversaire_equipe_no,
    ]
  );
  return rows[0].id;
}

// Met à jour une ligne existante. Retourne la liste des changements de score éventuels.
async function updateMatch(client, row, m) {
  const sets   = [];
  const params = [];
  const set = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
  const setCoalesce = (col, val) => { params.push(val); sets.push(`${col} = COALESCE($${params.length}, ${col})`); };

  // Toujours repris de la FFF (un report met à jour date/heure de la même ligne)
  set('fff_match_id',   m.fff_match_id);
  set('date',           m.date);
  set('domicile',       m.domicile);
  set('forfait_scr',    m.forfait_scr);
  set('forfait_adv',    m.forfait_adv);
  set('reporte',        m.reporte);
  set('fff_updated_at', m.fff_updated_at);
  setCoalesce('heure',            m.heure);
  setCoalesce('division',         m.division);
  setCoalesce('logo_adversaire',  m.logo_adversaire);
  setCoalesce('journee',          m.journee);
  setCoalesce('competition_type', m.competition_type);
  setCoalesce('fff_cp_no',        m.fff_cp_no);
  setCoalesce('fff_phase_no',     m.fff_phase_no);
  setCoalesce('fff_poule_no',     m.fff_poule_no);
  setCoalesce('poule_nom',        m.poule_nom);
  setCoalesce('adversaire_cl_no',     m.adversaire_cl_no);
  setCoalesce('adversaire_equipe_no', m.adversaire_equipe_no);

  // Terrain : uniquement si la FFF en fournit un (terrain peut être null)
  if (m.terrain_nom || m.terrain_ville) {
    set('lieu',            m.lieu);
    set('terrain_nom',     m.terrain_nom);
    set('terrain_adresse', m.terrain_adresse);
    set('terrain_cp',      m.terrain_cp);
    set('terrain_ville',   m.terrain_ville);
  }

  // Score : la FFF fait foi dès qu'elle a publié un score ; sinon on ne touche à rien
  let scoreChange = null;
  if (m.has_score) {
    const changed = row.score_scr     !== m.score_scr
                 || row.score_adv     !== m.score_adv
                 || row.tab_domicile  !== m.tab_domicile
                 || row.tab_exterieur !== m.tab_exterieur;

    set('score_scr',     m.score_scr);
    set('score_adv',     m.score_adv);
    set('tab_domicile',  m.tab_domicile);
    set('tab_exterieur', m.tab_exterieur);
    set('statut',        'termine');
    set('score_source',  'fff');
    set('fff_resultat',  m.fff_resultat);
    // Horodatage : nouveau score, ou première confirmation FFF d'un score app
    if (changed || row.score_source !== 'fff') sets.push('score_fff_at = NOW()');

    if (changed || row.score_source !== 'fff' || row.statut !== 'termine') {
      scoreChange = {
        avant: { score: `${row.score_scr}-${row.score_adv}`, tab: row.tab_domicile == null ? null : `${row.tab_domicile}-${row.tab_exterieur}`, source: row.score_source, statut: row.statut },
        apres: { score: `${m.score_scr}-${m.score_adv}`,     tab: m.tab_domicile   == null ? null : `${m.tab_domicile}-${m.tab_exterieur}`,     source: 'fff',            statut: 'termine' },
        modifie: changed,
      };
    }
  }

  // Informations de suivi : équipe ou adversaire différents ne sont jamais réécrits
  if (row.equipe !== m.equipe) {
    console.warn(`[FFF] ma_no=${m.fff_match_id} : équipe en base "${row.equipe}" ≠ FFF "${m.equipe}" (conservée)`);
  }
  if (row.date && String(row.date) !== m.date) {
    console.log(`[FFF] ma_no=${m.fff_match_id} : date ${row.date} → ${m.date} (report)`);
  }

  sets.push('updated_at = NOW()');
  params.push(row.id);
  await client.query(`UPDATE matches SET ${sets.join(', ')} WHERE id = $${params.length}`, params);

  return scoreChange;
}

// ── Point d'entrée ────────────────────────────────────────────────────────────

/**
 * Importe la saison SCR depuis DOFA.
 * dryRun = true : même traitement, mais chaque transaction est annulée (aperçu).
 */
async function importFFF({ dryRun = false } = {}) {
  const rawMatches = await fetchAllMatchesDOFA();
  const { matchs, skipped } = parseAll(rawMatches);

  const report = {
    dryRun,
    total: matchs.length,
    created: [], updated: [], scoreChanges: [], ambiguous: [], errors: [],
    clubs: null,
    skipped,
    matchs,
  };

  for (const m of matchs) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await findExisting(client, m);

      if (found.how === 'ambigu') {
        // Rattachement impossible à trancher : on ne crée surtout pas de ligne
        report.ambiguous.push({ fff_match_id: m.fff_match_id, candidats: found.candidats });
        console.warn(`[FFF] ma_no=${m.fff_match_id} ambigu (lignes ${found.candidats.join(', ')}), ignoré`);
        await client.query('ROLLBACK');
        continue;
      }

      if (found.row) {
        const scoreChange = await updateMatch(client, found.row, m);
        report.updated.push({ id: found.row.id, fff_match_id: m.fff_match_id, rattachement: found.how });
        if (scoreChange) report.scoreChanges.push({ id: found.row.id, fff_match_id: m.fff_match_id, ...scoreChange });
      } else {
        const id = await insertMatch(client, m);
        report.created.push({ id, fff_match_id: m.fff_match_id, equipe: m.equipe, date: m.date, adversaire: m.adversaire });
      }

      await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      report.errors.push({ fff_match_id: m.fff_match_id, adversaire: m.adversaire, error: err.message });
      console.error(`[FFF] ma_no=${m.fff_match_id} (${m.adversaire}) :`, err.message);
    } finally {
      client.release();
    }
  }

  if (!dryRun) {
    // require différé : clubsFff.js dépend lui-même de ce module
    const { assurerClubs } = require('./clubsFff');
    report.clubs = await assurerClubs(matchs.map(m => ({
      cl_no: m.adversaire_cl_no, nom: m.adversaire, autresNoms: m.adversaire_noms,
    })));
  }

  console.log(
    `[FFF] Import${dryRun ? ' (aperçu)' : ''} : ${report.created.length} créé(s), ` +
    `${report.updated.length} mis à jour, ${report.scoreChanges.length} score(s) FFF appliqué(s), ` +
    `${report.ambiguous.length} ambigu(s), ${report.errors.length} erreur(s)` +
    (report.clubs ? ` ; clubs : ${report.clubs.crees.length} créé(s), ${report.clubs.rattaches.length} rattaché(s), ` +
                    `${report.clubs.renommes.length} renommé(s), ${report.clubs.ambigus.length} ambigu(s)` : '')
  );
  return report;
}

module.exports = {
  importFFF, fetchAllMatchesDOFA, parseMatch, normalizeName, toTitleCase,
  getWithRetry, sleep, DOFA_BASE, DOFA_HEADERS, SCR_CL_NO,
};
