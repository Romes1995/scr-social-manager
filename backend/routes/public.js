const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { lireClassements } = require('../services/fffClassement');
const { getAccueil, getTele } = require('../services/accueilPublic');
const {
  nommerAdversaire, SQL_JOIN_CLUB_ADVERSAIRE, SQL_LOGO_ADVERSAIRE_LOCAL, SQL_NOMS_ADVERSAIRE,
} = require('../services/clubsFff');

// Les champs `adversaire` passent par le nom d'affichage du club (clubsFff.nomClub) ;
// logo_adversaire_local est relié par cl_no, puis par nom.

// GET /api/public/accueil — tout ce qu'affiche la page d'accueil, en une requête.
// Lecture seule en base (cache mémoire, vidé après chaque tâche FFF).
router.get('/accueil', async (req, res) => {
  try {
    const data = await getAccueil();
    res.set('Cache-Control', 'public, max-age=60');
    res.json(data);
  } catch (err) {
    console.error('[accueil]', err);
    res.status(500).json({ error: 'Service momentanément indisponible' });
  }
});

// GET /api/public/tele — page télé du club-house : prochains matchs et, par équipe,
// 3 derniers résultats FFF et classement complet. Même cache que l'accueil.
router.get('/tele', async (req, res) => {
  try {
    const data = await getTele();
    res.set('Cache-Control', 'public, max-age=60');
    res.json(data);
  } catch (err) {
    console.error('[tele]', err);
    res.status(500).json({ error: 'Service momentanément indisponible' });
  }
});

// GET /api/public/score-live — matchs en cours avec logos
router.get('/score-live', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, ${SQL_NOMS_ADVERSAIRE},
        ${SQL_LOGO_ADVERSAIRE_LOCAL} AS logo_adversaire_local
      FROM matches m
      ${SQL_JOIN_CLUB_ADVERSAIRE}
      WHERE m.statut = 'en_cours'
      ORDER BY m.date DESC, m.heure DESC
    `);
    res.json(result.rows.map(r => nommerAdversaire(r)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/matchs — prochains matchs + résultats récents
router.get('/matchs', async (req, res) => {
  try {
    const [upcomingRes, resultsRes] = await Promise.all([
      pool.query(`
        SELECT m.id, m.equipe, m.adversaire, m.adversaire_equipe_no, m.date, m.heure, m.lieu, m.domicile, m.division,
          ${SQL_NOMS_ADVERSAIRE},
          ${SQL_LOGO_ADVERSAIRE_LOCAL} AS logo_adversaire_local
        FROM matches m
        ${SQL_JOIN_CLUB_ADVERSAIRE}
        WHERE m.statut = 'programme' AND m.date >= CURRENT_DATE
        ORDER BY m.date ASC, m.heure ASC
        LIMIT 30
      `),
      pool.query(`
        SELECT m.id, m.equipe, m.adversaire, m.adversaire_equipe_no, m.date, m.domicile, m.division,
          m.score_scr, m.score_adv, m.buteurs, ${SQL_NOMS_ADVERSAIRE}
        FROM matches m
        ${SQL_JOIN_CLUB_ADVERSAIRE}
        WHERE m.statut = 'termine'
        ORDER BY m.date DESC
        LIMIT 15
      `),
    ]);
    res.json({
      upcoming: upcomingRes.rows.map(r => nommerAdversaire(r)),
      results:  resultsRes.rows.map(r => nommerAdversaire(r)),
    });
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
      WHERE sub.buteur IS NOT NULL AND TRIM(sub.buteur) <> '' AND LOWER(TRIM(sub.buteur)) <> 'csc'
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
      WHERE sub.buteur IS NOT NULL AND TRIM(sub.buteur) <> '' AND LOWER(TRIM(sub.buteur)) <> 'csc'
      GROUP BY sub.equipe, sub.buteur
      ORDER BY sub.equipe, buts DESC, sub.buteur ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/classement-par-equipe
// Lecture seule en base (table classements, alimentée par refreshClassements).
// Aucun appel FFF n'est déclenché par un visiteur.
router.get('/classement-par-equipe', async (req, res) => {
  try {
    res.json(await lireClassements());
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
          ${SQL_NOMS_ADVERSAIRE},
          ${SQL_LOGO_ADVERSAIRE_LOCAL} AS logo_adversaire_local
        FROM matches m
        ${SQL_JOIN_CLUB_ADVERSAIRE}
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
        WHERE sub.buteur IS NOT NULL AND TRIM(sub.buteur) <> '' AND LOWER(TRIM(sub.buteur)) <> 'csc'
        GROUP BY sub.buteur
        ORDER BY buts DESC
        LIMIT 1
      `, [equipe]),

      // Prochain match
      pool.query(`
        SELECT m.*,
          ${SQL_NOMS_ADVERSAIRE},
          ${SQL_LOGO_ADVERSAIRE_LOCAL} AS logo_adversaire_local
        FROM matches m
        ${SQL_JOIN_CLUB_ADVERSAIRE}
        WHERE m.equipe = $1 AND m.statut = 'programme' AND m.date >= CURRENT_DATE
        ORDER BY m.date ASC, m.heure ASC NULLS LAST
        LIMIT 1
      `, [equipe]),
    ]);

    // Classement : lu en base (table classements)
    const ranking = (await lireClassements({ equipe }))[equipe] ?? null;

    res.json({
      equipe,
      lastResult: nommerAdversaire(lastRes.rows[0]) || null,
      ranking,
      topScorer:  topRes.rows[0]   || null,
      nextMatch:  nommerAdversaire(nextRes.rows[0]) || null,
    });
  } catch (err) {
    console.error('[carousel]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
