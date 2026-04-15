const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/joueurs
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM joueurs ORDER BY nom ASC, prenom ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/joueurs/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM joueurs WHERE id=$1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Joueur non trouvé' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/joueurs
router.post('/', async (req, res) => {
  try {
    const { nom, prenom } = req.body;
    if (!nom || !prenom) return res.status(400).json({ error: 'nom et prenom sont requis' });

    const result = await pool.query(
      'INSERT INTO joueurs (nom, prenom) VALUES ($1, $2) RETURNING *',
      [nom.trim(), prenom.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/joueurs/:id
router.put('/:id', async (req, res) => {
  try {
    const { nom, prenom } = req.body;
    if (!nom || !prenom) return res.status(400).json({ error: 'nom et prenom sont requis' });

    const result = await pool.query(
      'UPDATE joueurs SET nom=$1, prenom=$2 WHERE id=$3 RETURNING *',
      [nom.trim(), prenom.trim(), req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Joueur non trouvé' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/joueurs/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM joueurs WHERE id=$1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Joueur non trouvé' });
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
