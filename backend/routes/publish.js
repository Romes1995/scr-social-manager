const express = require('express');
const router = express.Router();
const pool = require('../db');

// POST /api/publish/facebook - Mock (beta)
router.post('/facebook', async (req, res) => {
  const { match_id, image_url, message, template_id } = req.body;

  // Simuler un délai réseau
  await new Promise(r => setTimeout(r, 500));

  // Log de la tentative de publication
  console.log(`[META MOCK] Publication Facebook - Match: ${match_id}, Image: ${image_url}`);

  res.json({
    success: true,
    platform: 'facebook',
    status: 'mock_published',
    post_id: `mock_fb_${Date.now()}`,
    message: '⚠️ Mode beta : publication simulée. Connecter l\'API Meta Graph pour activer.',
    timestamp: new Date(),
  });
});

// POST /api/publish/instagram - Mock (beta)
router.post('/instagram', async (req, res) => {
  const { match_id, image_url, caption, template_id } = req.body;

  await new Promise(r => setTimeout(r, 500));

  console.log(`[META MOCK] Publication Instagram - Match: ${match_id}, Image: ${image_url}`);

  res.json({
    success: true,
    platform: 'instagram',
    status: 'mock_published',
    post_id: `mock_ig_${Date.now()}`,
    message: '⚠️ Mode beta : publication simulée. Connecter l\'API Meta Graph pour activer.',
    timestamp: new Date(),
  });
});

// POST /api/publish/both - Publier sur les deux
router.post('/both', async (req, res) => {
  await new Promise(r => setTimeout(r, 800));

  res.json({
    success: true,
    platforms: ['facebook', 'instagram'],
    status: 'mock_published',
    fb_post_id: `mock_fb_${Date.now()}`,
    ig_post_id: `mock_ig_${Date.now()}`,
    message: '⚠️ Mode beta : publications simulées sur Facebook et Instagram.',
    timestamp: new Date(),
  });
});

// GET /api/publish/programmes - Publications programmées
router.get('/programmes', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT pp.*, m.equipe, m.adversaire, m.date, m.heure
      FROM publications_programmees pp
      JOIN matches m ON pp.match_id = m.id
      ORDER BY pp.heure_publication ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/publish/programmes/:id
router.delete('/programmes/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM publications_programmees WHERE id=$1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Publication non trouvée' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
