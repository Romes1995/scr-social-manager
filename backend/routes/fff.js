const express = require('express');
const router = express.Router();
const axios = require('axios');
const pool = require('../db');
const { ensureAdversaireClub } = require('../utils/ensureClub');

// API FFF DOFA (publique, sans authentification)
const DOFA_BASE = 'https://api-dofa.fff.fr';
const SCR_CL_NO = 2131;   // Numéro interne FFF du SC Roeschwoog (≠ affiliation 504189)
const SCR_AFF   = '504189';

function toTitleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// "16H00" → "16:00", "" → null
function parseHeure(time) {
  if (!time) return null;
  const clean = time.replace('H', ':').trim();
  return /^\d{2}:\d{2}$/.test(clean) ? clean : null;
}

// Convertit un match brut DOFA en objet prêt pour la BDD
function parseMatch(raw) {
  const scrIsHome = raw.home?.club?.cl_no === SCR_CL_NO;
  const scrSide   = scrIsHome ? raw.home : raw.away;
  const advSide   = scrIsHome ? raw.away : raw.home;

  if (!scrSide || !advSide) return null;

  // `code` est le rang réel de l'équipe (1/2/3), `number` est inversé pour les réserves
  const teamNumber = scrSide.code ?? scrSide.number ?? 1;
  const equipe     = `SCR ${teamNumber}`;

  const dateObj  = new Date(raw.date);
  const dateStr  = dateObj.toISOString().slice(0, 10);
  const heureStr = parseHeure(raw.time);

  const advName  = toTitleCase(advSide.short_name || 'Inconnu');
  const advLogo  = advSide.club?.logo || null;

  const hasScore  = raw.home_score !== null && raw.home_score !== undefined;
  const scoreScr  = hasScore ? (scrIsHome ? raw.home_score : raw.away_score) : null;
  const scoreAdv  = hasScore ? (scrIsHome ? raw.away_score : raw.home_score) : null;

  const statut = hasScore ? 'termine' : 'programme';

  const terrain = raw.terrain;
  const lieu = terrain
    ? [terrain.name, terrain.city].filter(Boolean).join(', ')
    : null;

  return {
    equipe,
    adversaire: advName,
    logo_adversaire: advLogo,
    date: dateStr,
    heure: heureStr,
    domicile: scrIsHome,
    division: raw.competition?.name || null,
    lieu,
    fff_match_id: raw.ma_no,
    score_scr: scoreScr,
    score_adv: scoreAdv,
    statut,
  };
}

// Récupère TOUS les matchs du club SCR (toutes pages, toute la saison)
async function fetchAllMatchesDOFA() {
  const allRaw = [];
  let url = `${DOFA_BASE}/api/clubs/${SCR_CL_NO}/matchs?page=1`;

  console.log(`[FFF] Récupération des matchs SCR (cl_no=${SCR_CL_NO}) depuis ${DOFA_BASE}…`);

  while (url) {
    const resp = await axios.get(url, {
      timeout: 10000,
      headers: {
        'Accept': 'application/json, */*',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Referer': 'https://www.fff.fr/',
        'Origin': 'https://www.fff.fr',
      },
    });

    const data    = resp.data;
    const members = data['hydra:member'] || [];
    allRaw.push(...members);

    const nextPath = data['hydra:view']?.['hydra:next'];
    url = nextPath ? `${DOFA_BASE}${nextPath}` : null;

    console.log(`[FFF]   page chargée : ${members.length} matchs (total cumulé : ${allRaw.length})`);
  }

  console.log(`[FFF] Total matchs bruts récupérés : ${allRaw.length}`);
  return allRaw;
}

// GET /api/fff/import
router.get('/import', async (req, res) => {
  try {
    // 1. Récupérer tous les matchs de la saison depuis l'API DOFA
    const rawMatches = await fetchAllMatchesDOFA();

    // 2. Parser et filtrer (ne garder que les matchs impliquant SCR)
    const matchs = [];
    const seen   = new Set();

    for (const raw of rawMatches) {
      const scrIsHome    = raw.home?.club?.cl_no === SCR_CL_NO;
      const scrIsAway    = raw.away?.club?.cl_no === SCR_CL_NO;
      if (!scrIsHome && !scrIsAway) continue;

      const parsed = parseMatch(raw);
      if (!parsed) continue;

      if (seen.has(parsed.fff_match_id)) continue;
      seen.add(parsed.fff_match_id);

      matchs.push(parsed);
    }

    // 3. Trier par date croissante
    matchs.sort((a, b) => new Date(a.date) - new Date(b.date));

    const joues   = matchs.filter(m => m.statut === 'termine').length;
    const aVenir  = matchs.filter(m => m.statut === 'programme').length;

    console.log(`[FFF] Résultat : ${matchs.length} matchs (${joues} joués, ${aVenir} à venir)`);

    // Répartition par équipe
    const parEquipe = {};
    for (const m of matchs) {
      parEquipe[m.equipe] = (parEquipe[m.equipe] || 0) + 1;
    }
    console.log('[FFF] Par équipe :', parEquipe);

    res.json({
      success: true,
      matchs,
      count: matchs.length,
      joues,
      a_venir: aVenir,
      par_equipe: parEquipe,
      source: 'api-dofa.fff.fr',
    });

  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
      const msg = 'Impossible de joindre l\'API FFF (api-dofa.fff.fr)';
      console.error('[FFF Import]', msg, err.message);
      return res.status(503).json({ error: msg, detail: err.message });
    }
    console.error('[FFF Import] Erreur inattendue :', err.message);
    res.status(500).json({ error: 'Erreur lors de l\'import FFF', detail: err.message });
  }
});

// POST /api/fff/save - Sauvegarder les matchs importés en base
router.post('/save', async (req, res) => {
  const { matchs } = req.body;

  if (!Array.isArray(matchs) || matchs.length === 0) {
    return res.status(400).json({ error: 'Liste de matchs vide ou invalide' });
  }

  const saved   = [];
  const updated = [];
  const errors  = [];

  for (const match of matchs) {
    try {
      const statut = match.statut === 'termine' ? 'termine' : 'programme';
      const result = await pool.query(
        `INSERT INTO matches
           (equipe, adversaire, logo_adversaire, date, heure, lieu, domicile, division, statut,
            score_scr, score_adv)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (equipe, date, adversaire) DO UPDATE SET
           heure            = COALESCE(EXCLUDED.heure, matches.heure),
           lieu             = COALESCE(EXCLUDED.lieu,  matches.lieu),
           logo_adversaire  = COALESCE(EXCLUDED.logo_adversaire, matches.logo_adversaire),
           division         = COALESCE(EXCLUDED.division, matches.division),
           statut           = CASE
             WHEN matches.statut = 'programme' AND EXCLUDED.statut = 'termine'
             THEN 'termine'
             ELSE matches.statut
           END,
           score_scr        = CASE
             WHEN matches.statut = 'programme' AND EXCLUDED.statut = 'termine'
             THEN EXCLUDED.score_scr
             ELSE matches.score_scr
           END,
           score_adv        = CASE
             WHEN matches.statut = 'programme' AND EXCLUDED.statut = 'termine'
             THEN EXCLUDED.score_adv
             ELSE matches.score_adv
           END,
           updated_at       = NOW()
         RETURNING *, (xmax = 0) AS inserted`,
        [
          match.equipe           || 'SCR 1',
          match.adversaire,
          match.logo_adversaire  || null,
          match.date             || null,
          match.heure            || null,
          match.lieu             || null,
          match.domicile         !== false,
          match.division         || null,
          statut,
          match.score_scr        ?? null,
          match.score_adv        ?? null,
        ]
      );
      const row = result.rows[0];
      if (row.inserted) {
        saved.push(row);
        ensureAdversaireClub(match.adversaire);
      } else {
        updated.push({ adversaire: match.adversaire, date: match.date });
      }
    } catch (err) {
      errors.push({ match: match.adversaire, error: err.message });
    }
  }

  res.json({
    success: true,
    saved: saved.length,
    updated: updated.length,
    errors,
  });
});

// GET /api/fff/refresh-classement — vide le cache FFF et force un nouveau scraping
router.get('/refresh-classement', async (req, res) => {
  try {
    const { getClassementFFF, clearCache } = require('../services/fffClassementScraper');
    clearCache();
    const data = await getClassementFFF({ forceRefresh: true });
    const summary = {};
    for (const [team, val] of Object.entries(data)) {
      summary[team] = val
        ? { rows: val.rows.length, scrRow: val.rows.find(r => r.isSCR) ?? null, source: 'fff_scraper' }
        : { rows: 0, source: 'failed' };
    }
    res.json({ success: true, summary });
  } catch (err) {
    console.error('[refresh-classement]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
