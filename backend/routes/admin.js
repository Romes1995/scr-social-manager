const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const scheduler = require('../services/scheduler');

// GET /api/admin/taches — 30 dernières exécutions des tâches FFF (taches_log)
router.get('/taches', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, tache, declencheur, debut, fin, succes, resume, erreur,
              EXTRACT(EPOCH FROM (fin - debut))::int AS duree_s
         FROM taches_log
        ORDER BY debut DESC, id DESC
        LIMIT 30`
    );
    res.json({
      planification_active: scheduler.cronActive(),
      en_cours:   scheduler.etat(),
      executions: rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
