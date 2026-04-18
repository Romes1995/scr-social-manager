const express = require('express');
const router = express.Router();
const axios = require('axios');
const pool = require('../db');
const { ensureAdversaireClub } = require('../utils/ensureClub');

const FFF_URL = process.env.FFF_URL || 'https://epreuves.fff.fr/competition/club/504189-s-c-roeschwoog/information.html';
const FFF_CLCOD = '504189'; // Code club SCR Roeschwoog

const HTTP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
};

// Mappe le eqCod FFF vers le nom d'équipe SCR
function getEquipeName(eqCod) {
  const map = { '1': 'SCR 1', '2': 'SCR 2', '3': 'SCR 3' };
  return map[String(eqCod)] || `SCR ${eqCod}`;
}

// Extrait le JSON ng-state embarqué dans la page Angular SSR
function extractNgState(html) {
  const match = html.match(/<script[^>]*id="ng-state"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  return JSON.parse(match[1]);
}

// Parse les matchs depuis le ng-state et les clés API FFF
function parseMatchesFromNgState(ngState) {
  const matchs = [];

  // Chercher toutes les clés contenant des matchs
  const matchKeys = Object.keys(ngState).filter(k => k.includes('/matches?'));

  for (const key of matchKeys) {
    const body = ngState[key]?.body;
    if (!body || !body['hydra:member']) continue;

    for (const item of body['hydra:member']) {
      const d = item.donneesFormatees;
      if (!d) continue;

      // Filtrer uniquement les matchs à venir
      if (d.maStatutLib !== 'à venir') continue;

      const recevant = d.recevant;
      const visiteur = d.visiteur;

      // Identifier quel côté est SCR
      const scrEstRecevant = recevant?.club?.clCod === FFF_CLCOD;
      const scrEstVisiteur = visiteur?.club?.clCod === FFF_CLCOD;
      if (!scrEstRecevant && !scrEstVisiteur) continue;

      const scrSide = scrEstRecevant ? recevant : visiteur;
      const advSide = scrEstRecevant ? visiteur : recevant;

      // Date et heure
      const dateObj = new Date(d.date);
      const dateStr = dateObj.toISOString().slice(0, 10);
      const heureStr = dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

      matchs.push({
        equipe: getEquipeName(scrSide?.equipe?.eqCod),
        adversaire: toTitleCase(advSide?.club?.nom || 'Inconnu'),
        logo_adversaire: advSide?.club?.logo || null,
        date: dateStr,
        heure: heureStr,
        domicile: scrEstRecevant,
        division: d.competition?.donneesFormatees?.nom || null,
        fff_match_id: d.maNo || item.id,
      });
    }
  }

  // Dédupliquer par fff_match_id
  const seen = new Set();
  return matchs.filter(m => {
    if (seen.has(m.fff_match_id)) return false;
    seen.add(m.fff_match_id);
    return true;
  });
}

// Met en forme le nom de club (ex: "GAMBSHEIM AS" → "As Gambsheim")
function toTitleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// Récupère les matchs FFF sur plusieurs mois via l'API directe
async function fetchMatchesFromAPI(clNo, token) {
  const now = new Date();
  const debut = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10) + 'T00:00:00+00:00';
  const fin = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString().slice(0, 10) + 'T23:59:59+00:00';

  const url = `https://epreuves.fff.fr/api/data/matches?dateDebut=${encodeURIComponent(debut)}&dateFin=${encodeURIComponent(fin)}&clNo=${clNo}&itemsPerPage=50&pagination=true`;

  const response = await axios.get(url, {
    timeout: 10000,
    headers: {
      ...HTTP_HEADERS,
      'Accept': 'application/json',
      'X-Security-Token': token,
      'Referer': FFF_URL,
    },
  });

  return response.data;
}

// GET /api/fff/import
router.get('/import', async (req, res) => {
  try {
    // 1. Charger la page HTML de la FFF
    const pageResponse = await axios.get(FFF_URL, {
      timeout: 15000,
      headers: HTTP_HEADERS,
      responseType: 'text',
    });

    const html = pageResponse.data;

    // 2. Extraire le ng-state Angular SSR (données embarquées)
    const ngState = extractNgState(html);
    if (!ngState) {
      return res.status(502).json({
        error: 'Impossible d\'extraire les données de la page FFF',
        detail: 'Le format de la page a peut-être changé (ng-state introuvable)',
      });
    }

    // 3. Parser les matchs à venir depuis le ng-state (mois courant)
    let matchs = parseMatchesFromNgState(ngState);

    // 4. Si token disponible, enrichir avec les mois suivants via l'API directe
    const token = ngState['VLJAXE'];
    const clNoKey = Object.keys(ngState).find(k => k.includes('clNo='));
    const clNoMatch = clNoKey?.match(/clNo=(\d+)/);
    const clNo = clNoMatch?.[1];

    let source = 'ng-state';

    if (token && clNo) {
      try {
        const apiData = await fetchMatchesFromAPI(clNo, token);
        const apiMembers = apiData?.['hydra:member'] || [];

        // Construire un ng-state partiel pour réutiliser parseMatchesFromNgState
        const fakeState = {
          [`analog_/api/data/matches_extended?clNo=${clNo}`]: { body: { 'hydra:member': apiMembers } },
        };
        const moreMatchs = parseMatchesFromNgState(fakeState);

        // Fusionner sans doublon
        const existingIds = new Set(matchs.map(m => m.fff_match_id));
        let added = 0;
        for (const m of moreMatchs) {
          if (!existingIds.has(m.fff_match_id)) {
            matchs.push(m);
            existingIds.add(m.fff_match_id);
            added++;
          }
        }
        if (added > 0) source = 'ng-state + api';
      } catch (apiErr) {
        // L'API directe a échoué (token expiré), on garde les données du ng-state
        console.warn('[FFF] API directe inaccessible, ng-state suffisant:', apiErr.message);
      }
    }

    // Trier par date
    matchs.sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({
      success: true,
      matchs,
      count: matchs.length,
      source,
    });

  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
      return res.status(503).json({ error: 'Impossible de joindre le site FFF', detail: err.message });
    }
    console.error('[FFF Import]', err.message);
    res.status(500).json({ error: 'Erreur lors du scraping FFF', detail: err.message });
  }
});

// POST /api/fff/save - Sauvegarder les matchs importés en base
router.post('/save', async (req, res) => {
  const { matchs } = req.body;

  if (!Array.isArray(matchs) || matchs.length === 0) {
    return res.status(400).json({ error: 'Liste de matchs vide ou invalide' });
  }

  const saved    = [];
  const skipped  = [];
  const errors   = [];

  for (const match of matchs) {
    try {
      // Déduplication : même équipe + adversaire + date
      if (match.date) {
        const dup = await pool.query(
          `SELECT id FROM matches WHERE LOWER(equipe)=LOWER($1) AND LOWER(adversaire)=LOWER($2) AND date=$3`,
          [match.equipe || 'SCR 1', match.adversaire, match.date]
        );
        if (dup.rows.length > 0) {
          skipped.push({ adversaire: match.adversaire, date: match.date });
          continue;
        }
      }

      const result = await pool.query(
        `INSERT INTO matches (equipe, adversaire, logo_adversaire, date, heure, domicile, division, statut)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'programme')
         RETURNING *`,
        [
          match.equipe || 'SCR 1',
          match.adversaire,
          match.logo_adversaire || null,
          match.date || null,
          match.heure || null,
          match.domicile !== false,
          match.division || null,
        ]
      );
      saved.push(result.rows[0]);
      // Auto-créer le club adversaire en arrière-plan
      ensureAdversaireClub(match.adversaire);
    } catch (err) {
      errors.push({ match: match.adversaire, error: err.message });
    }
  }

  res.json({ success: true, saved: saved.length, skipped: skipped.length, errors });
});

module.exports = router;
