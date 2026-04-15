const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/clubs
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clubs ORDER BY nom ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/clubs/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clubs WHERE id=$1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Club non trouvé' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clubs
router.post('/', async (req, res) => {
  try {
    const { nom, logo_url } = req.body;
    if (!nom) return res.status(400).json({ error: 'nom est requis' });

    const result = await pool.query(
      'INSERT INTO clubs (nom, logo_url) VALUES ($1, $2) RETURNING *',
      [nom.trim(), logo_url || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/clubs/:id
router.put('/:id', async (req, res) => {
  try {
    const { nom, logo_url } = req.body;
    if (!nom) return res.status(400).json({ error: 'nom est requis' });

    const result = await pool.query(
      'UPDATE clubs SET nom=$1, logo_url=$2 WHERE id=$3 RETURNING *',
      [nom.trim(), logo_url || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Club non trouvé' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/clubs/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM clubs WHERE id=$1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Club non trouvé' });
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
