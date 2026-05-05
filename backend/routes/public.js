const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { getClassementFFF } = require('../services/fffClassementScraper');

// GET /api/public/score-live — matchs en cours avec logos
router.get('/score-live', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*,
        (SELECT c.logo_url FROM clubs c
         WHERE c.logo_url IS NOT NULL
           AND LOWER(TRIM(c.nom)) = LOWER(TRIM(m.adversaire))
         LIMIT 1) AS logo_adversaire_local
      FROM matches m
      WHERE m.statut = 'en_cours'
      ORDER BY m.date DESC, m.heure DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/matchs — prochains matchs + résultats récents
router.get('/matchs', async (req, res) => {
  try {
    const [upcomingRes, resultsRes] = await Promise.all([
      pool.query(`
        SELECT m.id, m.equipe, m.adversaire, m.date, m.heure, m.lieu, m.domicile, m.division,
          (SELECT c.logo_url FROM clubs c
           WHERE c.logo_url IS NOT NULL
             AND LOWER(TRIM(c.nom)) = LOWER(TRIM(m.adversaire))
           LIMIT 1) AS logo_adversaire_local
        FROM matches m
        WHERE m.statut = 'programme' AND m.date >= CURRENT_DATE
        ORDER BY m.date ASC, m.heure ASC
        LIMIT 30
      `),
      pool.query(`
        SELECT id, equipe, adversaire, date, domicile, division, score_scr, score_adv, buteurs
        FROM matches
        WHERE statut = 'termine'
        ORDER BY date DESC
        LIMIT 15
      `),
    ]);
    res.json({ upcoming: upcomingRes.rows, results: resultsRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/buteurs — classement buteurs SCR, regroupé par joueur toutes équipes confondues
router.get('/buteurs', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        sub.buteur,
        COUNT(*)::int                                                    AS buts,
        ARRAY_AGG(DISTINCT sub.equipe ORDER BY sub.equipe)              AS equipes,
        (SELECT j.photo FROM joueurs j
         WHERE LOWER(TRIM(j.prenom || ' ' || j.nom)) = LOWER(TRIM(sub.buteur))
         LIMIT 1)                                                        AS joueur_photo
      FROM (
        SELECT UNNEST(buteurs) AS buteur, equipe
        FROM matches
        WHERE statut = 'termine' AND cardinality(buteurs) > 0
      ) sub
      WHERE sub.buteur IS NOT NULL AND TRIM(sub.buteur) <> ''
      GROUP BY sub.buteur
      ORDER BY buts DESC, sub.buteur ASC
      LIMIT 50
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('BUTEURS ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/classement — classement calculé depuis les matchs enregistrés
router.get('/classement', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        adversaire                                                           AS equipe,
        COUNT(*)::int                                                        AS joues,
        SUM(CASE WHEN score_adv > score_scr THEN 1 ELSE 0 END)::int        AS victoires,
        SUM(CASE WHEN score_adv = score_scr THEN 1 ELSE 0 END)::int        AS nuls,
        SUM(CASE WHEN score_adv < score_scr THEN 1 ELSE 0 END)::int        AS defaites,
        SUM(score_adv)::int                                                  AS buts_pour,
        SUM(score_scr)::int                                                  AS buts_contre,
        (SUM(score_adv) - SUM(score_scr))::int                             AS diff,
        SUM(CASE WHEN score_adv > score_scr THEN 3
                 WHEN score_adv = score_scr THEN 1 ELSE 0 END)::int        AS points,
        false                                                                AS "isSCR"
      FROM matches
      WHERE statut = 'termine'
        AND division ILIKE '%district%'
      GROUP BY adversaire

      UNION ALL

      SELECT
        equipe                                                               AS equipe,
        COUNT(*)::int                                                        AS joues,
        SUM(CASE WHEN score_scr > score_adv THEN 1 ELSE 0 END)::int        AS victoires,
        SUM(CASE WHEN score_scr = score_adv THEN 1 ELSE 0 END)::int        AS nuls,
        SUM(CASE WHEN score_scr < score_adv THEN 1 ELSE 0 END)::int        AS defaites,
        SUM(score_scr)::int                                                  AS buts_pour,
        SUM(score_adv)::int                                                  AS buts_contre,
        (SUM(score_scr) - SUM(score_adv))::int                             AS diff,
        SUM(CASE WHEN score_scr > score_adv THEN 3
                 WHEN score_scr = score_adv THEN 1 ELSE 0 END)::int        AS points,
        true                                                                 AS "isSCR"
      FROM matches
      WHERE statut = 'termine'
        AND division ILIKE '%district%'
      GROUP BY equipe

      ORDER BY points DESC, diff DESC, buts_pour DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/buteurs-par-equipe — buts par joueur par équipe SCR (pas le total toutes équipes)
router.get('/buteurs-par-equipe', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        sub.equipe,
        sub.buteur,
        COUNT(*)::int AS buts,
        (SELECT j.photo FROM joueurs j
         WHERE LOWER(TRIM(j.prenom || ' ' || j.nom)) = LOWER(TRIM(sub.buteur))
         LIMIT 1) AS joueur_photo
      FROM (
        SELECT UNNEST(buteurs) AS buteur, equipe
        FROM matches
        WHERE statut = 'termine' AND cardinality(buteurs) > 0
      ) sub
      WHERE sub.buteur IS NOT NULL AND TRIM(sub.buteur) <> ''
      GROUP BY sub.equipe, sub.buteur
      ORDER BY sub.equipe, buts DESC, sub.buteur ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Fallback DB : calcul depuis les matchs en base (une seule équipe) ──────────
async function classementFromDB(equipe) {
  const divRes = await pool.query(
    `SELECT division FROM matches
     WHERE equipe = $1 AND statut = 'termine' AND division IS NOT NULL
     GROUP BY division ORDER BY COUNT(*) DESC LIMIT 1`,
    [equipe]
  );
  const division = divRes.rows[0]?.division || null;
  if (!division) return { division: null, rows: [] };

  const classRes = await pool.query(`
    SELECT
      equipe,
      SUM(pts)::int             AS points,
      SUM(joues)::int           AS joues,
      SUM(vic)::int             AS victoires,
      SUM(nul)::int             AS nuls,
      SUM(def)::int             AS defaites,
      SUM(bp)::int              AS buts_pour,
      SUM(bc)::int              AS buts_contre,
      (SUM(bp) - SUM(bc))::int  AS diff,
      BOOL_OR(is_scr)           AS "isSCR"
    FROM (
      SELECT adversaire AS equipe, false AS is_scr,
        CASE WHEN score_adv > score_scr THEN 3 WHEN score_adv = score_scr THEN 1 ELSE 0 END AS pts,
        1 AS joues,
        CASE WHEN score_adv > score_scr THEN 1 ELSE 0 END AS vic,
        CASE WHEN score_adv = score_scr THEN 1 ELSE 0 END AS nul,
        CASE WHEN score_adv < score_scr THEN 1 ELSE 0 END AS def,
        score_adv AS bp, score_scr AS bc
      FROM matches WHERE equipe = $1 AND statut = 'termine' AND division = $2

      UNION ALL

      SELECT equipe, true AS is_scr,
        CASE WHEN score_scr > score_adv THEN 3 WHEN score_scr = score_adv THEN 1 ELSE 0 END AS pts,
        1 AS joues,
        CASE WHEN score_scr > score_adv THEN 1 ELSE 0 END AS vic,
        CASE WHEN score_scr = score_adv THEN 1 ELSE 0 END AS nul,
        CASE WHEN score_scr < score_adv THEN 1 ELSE 0 END AS def,
        score_scr AS bp, score_adv AS bc
      FROM matches WHERE equipe = $1 AND statut = 'termine' AND division = $2
    ) sub
    GROUP BY equipe
    ORDER BY points DESC, diff DESC, buts_pour DESC
  `, [equipe, division]);

  console.log(`[classement] ${equipe} → fallback DB (${classRes.rows.length} équipes)`);
  return { division, rows: classRes.rows };
}

// GET /api/public/classement-par-equipe
// Tente le scraping FFF en priorité, bascule sur le calcul DB par équipe si échec.
// ?refresh=1 force un re-scrape immédiat (invalide le cache).
router.get('/classement-par-equipe', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1';
    const SCR_EQUIPES  = ['SCR 1', 'SCR 2', 'SCR 3'];

    // ── Tentative FFF scraper ────────────────────────────────────────────────
    const scraped = await getClassementFFF({ forceRefresh });

    // ── Fusionner : scraper si OK, DB sinon ──────────────────────────────────
    const result = {};
    await Promise.all(SCR_EQUIPES.map(async (equipe) => {
      if (scraped[equipe]?.rows?.length > 0) {
        result[equipe] = scraped[equipe];          // données FFF réelles
      } else {
        result[equipe] = await classementFromDB(equipe); // calcul maison
      }
    }));

    res.json(result);
  } catch (err) {
    console.error('[classement-par-equipe]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/carousel/:teamId (1 | 2 | 3)
// Retourne en une requête : dernier résultat, classement, meilleur buteur, prochain match
router.get('/carousel/:teamId', async (req, res) => {
  const num = parseInt(req.params.teamId, 10);
  if (![1, 2, 3].includes(num)) {
    return res.status(400).json({ error: 'teamId doit être 1, 2 ou 3' });
  }
  const equipe = `SCR ${num}`;

  try {
    const [lastRes, topRes, nextRes] = await Promise.all([

      // Dernier résultat
      pool.query(`
        SELECT m.*,
          (SELECT c.logo_url FROM clubs c
           WHERE c.logo_url IS NOT NULL AND LOWER(TRIM(c.nom)) = LOWER(TRIM(m.adversaire))
           LIMIT 1) AS logo_adversaire_local
        FROM matches m
        WHERE m.equipe = $1 AND m.statut = 'termine'
        ORDER BY m.date DESC, m.heure DESC NULLS LAST
        LIMIT 1
      `, [equipe]),

      // Meilleur buteur de l'équipe (avec photo si dispo dans joueurs)
      pool.query(`
        SELECT
          sub.buteur                                                         AS nom,
          COUNT(*)::int                                                      AS buts,
          (SELECT j.photo    FROM joueurs j
           WHERE LOWER(TRIM(j.prenom || ' ' || j.nom)) = LOWER(TRIM(sub.buteur))
              OR LOWER(TRIM(j.nom    || ' ' || j.prenom)) = LOWER(TRIM(sub.buteur))
           LIMIT 1)                                                          AS photo,
          (SELECT j.categorie FROM joueurs j
           WHERE LOWER(TRIM(j.prenom || ' ' || j.nom)) = LOWER(TRIM(sub.buteur))
              OR LOWER(TRIM(j.nom    || ' ' || j.prenom)) = LOWER(TRIM(sub.buteur))
           LIMIT 1)                                                          AS categorie
        FROM (
          SELECT UNNEST(buteurs) AS buteur
          FROM matches
          WHERE equipe = $1 AND statut = 'termine' AND cardinality(buteurs) > 0
        ) sub
        WHERE sub.buteur IS NOT NULL AND TRIM(sub.buteur) <> ''
        GROUP BY sub.buteur
        ORDER BY buts DESC
        LIMIT 1
      `, [equipe]),

      // Prochain match
      pool.query(`
        SELECT m.*,
          (SELECT c.logo_url FROM clubs c
           WHERE c.logo_url IS NOT NULL AND LOWER(TRIM(c.nom)) = LOWER(TRIM(m.adversaire))
           LIMIT 1) AS logo_adversaire_local
        FROM matches m
        WHERE m.equipe = $1 AND m.statut = 'programme' AND m.date >= CURRENT_DATE
        ORDER BY m.date ASC, m.heure ASC NULLS LAST
        LIMIT 1
      `, [equipe]),
    ]);

    // Classement : FFF scraper en cache si dispo, DB en fallback
    let ranking = null;
    try {
      const scraped = await getClassementFFF();
      ranking = (scraped[equipe]?.rows?.length > 0)
        ? scraped[equipe]
        : await classementFromDB(equipe);
    } catch {
      ranking = await classementFromDB(equipe);
    }

    res.json({
      equipe,
      lastResult: lastRes.rows[0]  || null,
      ranking,
      topScorer:  topRes.rows[0]   || null,
      nextMatch:  nextRes.rows[0]  || null,
    });
  } catch (err) {
    console.error('[carousel]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
