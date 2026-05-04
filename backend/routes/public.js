const express = require('express');
const router  = express.Router();
const pool    = require('../db');

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
        SELECT id, equipe, adversaire, date, heure, lieu, domicile, division
        FROM matches
        WHERE statut = 'programme' AND date >= CURRENT_DATE
        ORDER BY date ASC, heure ASC
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

// GET /api/public/buteurs — classement buteurs SCR (depuis matches.buteurs TEXT[])
router.get('/buteurs', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        sub.buteur,
        sub.equipe,
        COUNT(*)::int                                        AS buts,
        (SELECT j.photo FROM joueurs j
         WHERE LOWER(TRIM(j.prenom || ' ' || j.nom)) = LOWER(TRIM(sub.buteur))
         LIMIT 1)                                           AS joueur_photo
      FROM (
        SELECT UNNEST(buteurs) AS buteur, equipe
        FROM matches
        WHERE statut = 'termine' AND cardinality(buteurs) > 0
      ) sub
      WHERE sub.buteur IS NOT NULL AND TRIM(sub.buteur) <> ''
      GROUP BY sub.buteur, sub.equipe
      ORDER BY buts DESC, sub.buteur ASC
      LIMIT 50
    `);
    res.json(result.rows);
  } catch (err) {
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

module.exports = router;
