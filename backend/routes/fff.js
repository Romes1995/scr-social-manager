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
      headers: { Accept: 'application/json' },
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
  const skipped = [];
  const updated = [];
  const errors  = [];

  for (const match of matchs) {
    try {
      // Déduplication : même équipe + adversaire + date
      if (match.date) {
        const dup = await pool.query(
          `SELECT id, statut FROM matches WHERE LOWER(equipe)=LOWER($1) AND LOWER(adversaire)=LOWER($2) AND date=$3`,
          [match.equipe || 'SCR 1', match.adversaire, match.date]
        );

        if (dup.rows.length > 0) {
          const existing = dup.rows[0];

          // Si le match existe en BDD comme 'programme' mais est maintenant 'termine', mettre à jour le score
          if (existing.statut === 'programme' && match.statut === 'termine'
              && match.score_scr !== null && match.score_adv !== null) {
            await pool.query(
              `UPDATE matches SET score_scr=$1, score_adv=$2, statut='termine', updated_at=NOW()
               WHERE id=$3`,
              [match.score_scr, match.score_adv, existing.id]
            );
            updated.push({ adversaire: match.adversaire, date: match.date });
          } else {
            skipped.push({ adversaire: match.adversaire, date: match.date });
          }
          continue;
        }
      }

      // Insertion selon le statut
      const statut = match.statut === 'termine' ? 'termine' : 'programme';
      const result = await pool.query(
        `INSERT INTO matches
           (equipe, adversaire, logo_adversaire, date, heure, domicile, division, statut,
            score_scr, score_adv)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          match.equipe     || 'SCR 1',
          match.adversaire,
          match.logo_adversaire || null,
          match.date       || null,
          match.heure      || null,
          match.domicile   !== false,
          match.division   || null,
          statut,
          match.score_scr  ?? null,
          match.score_adv  ?? null,
        ]
      );
      saved.push(result.rows[0]);
      ensureAdversaireClub(match.adversaire);
    } catch (err) {
      errors.push({ match: match.adversaire, error: err.message });
    }
  }

  res.json({
    success: true,
    saved: saved.length,
    updated: updated.length,
    skipped: skipped.length,
    errors,
  });
});

module.exports = router;
