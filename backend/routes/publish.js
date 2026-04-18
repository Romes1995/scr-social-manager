const express = require('express');
const router  = express.Router();
const https   = require('https');
const pool    = require('../db');

// ─── Config Meta ──────────────────────────────────────────────────────────────

const PAGE_ID    = process.env.FACEBOOK_PAGE_ID;
const PAGE_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const IG_ID      = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

function metaConfigured() {
  return !!(PAGE_ID && PAGE_TOKEN && IG_ID);
}

// ─── Helper : appel Graph API ─────────────────────────────────────────────────

function graphPost(endpoint, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const options = {
      hostname: 'graph.facebook.com',
      path:     `/v19.0${endpoint}`,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) reject(new Error(`Meta API [${json.error.code}] ${json.error.message}`));
          else resolve(json);
        } catch { reject(new Error('Réponse Meta invalide')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Normalisation URL image ──────────────────────────────────────────────────
// L'API Meta exige une URL publique. En dev on utilise localhost → pas accessible
// depuis les serveurs Meta. Préférer une URL publique (ngrok, déploiement).

function resolvePublicUrl(imageUrl) {
  if (!imageUrl) throw new Error('image_url manquante');
  // Si déjà absolu et non-localhost → OK
  if (imageUrl.startsWith('http') && !imageUrl.includes('localhost')) return imageUrl;
  // Tenter une URL publique configurée
  const publicBase = process.env.PUBLIC_URL;
  if (publicBase) {
    const rel = imageUrl.replace(/^https?:\/\/[^/]+/, '');
    return `${publicBase}${rel}`;
  }
  throw new Error(
    'image_url doit être une URL publique (pas localhost). ' +
    'Définir PUBLIC_URL dans .env ou utiliser ngrok.'
  );
}

// ─── POST /api/publish/facebook ───────────────────────────────────────────────

router.post('/facebook', async (req, res) => {
  const { image_url, message, is_story = false } = req.body;

  if (!metaConfigured()) {
    return res.json({
      success: true,
      platform: 'facebook',
      status: 'mock_published',
      post_id: `mock_fb_${Date.now()}`,
      message: "Mode beta : publication simulée. Renseigner FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN et INSTAGRAM_BUSINESS_ACCOUNT_ID dans .env pour activer.",
    });
  }

  try {
    const url = resolvePublicUrl(image_url);
    let result;

    if (is_story) {
      // Stories Facebook via /photos avec published=false puis promote_to_story
      const upload = await graphPost(`/${PAGE_ID}/photos`, {
        url,
        published:        'false',
        temporary:        'true',
        access_token:     PAGE_TOKEN,
      });
      result = await graphPost(`/${PAGE_ID}/stories`, {
        photo_ids:    upload.id,
        access_token: PAGE_TOKEN,
      });
    } else {
      result = await graphPost(`/${PAGE_ID}/photos`, {
        url,
        message:      message || '',
        access_token: PAGE_TOKEN,
      });
    }

    console.log(`[Meta] Facebook publié — id: ${result.id || result.post_id}`);
    res.json({
      success:   true,
      platform:  'facebook',
      status:    'published',
      post_id:   result.id || result.post_id,
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('[Meta] Erreur Facebook :', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/publish/instagram ─────────────────────────────────────────────

router.post('/instagram', async (req, res) => {
  const { image_url, caption, is_story = false } = req.body;

  if (!metaConfigured()) {
    return res.json({
      success: true,
      platform: 'instagram',
      status: 'mock_published',
      post_id: `mock_ig_${Date.now()}`,
      message: "Mode beta : publication simulée. Renseigner les variables Meta dans .env pour activer.",
    });
  }

  try {
    const url = resolvePublicUrl(image_url);

    // Étape 1 : créer le container média
    const mediaParams = {
      image_url:    url,
      access_token: PAGE_TOKEN,
    };
    if (is_story) {
      mediaParams.media_type = 'STORIES';
    } else {
      mediaParams.caption = caption || '';
    }

    const container = await graphPost(`/${IG_ID}/media`, mediaParams);
    if (!container.id) throw new Error('Création container IG échouée');

    // Étape 2 : publier le container
    const publish = await graphPost(`/${IG_ID}/media_publish`, {
      creation_id:  container.id,
      access_token: PAGE_TOKEN,
    });

    console.log(`[Meta] Instagram publié — id: ${publish.id}`);
    res.json({
      success:   true,
      platform:  'instagram',
      status:    'published',
      post_id:   publish.id,
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('[Meta] Erreur Instagram :', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/publish/both ───────────────────────────────────────────────────

router.post('/both', async (req, res) => {
  const { image_url, message, caption, is_story = false } = req.body;

  if (!metaConfigured()) {
    return res.json({
      success: true,
      platforms: ['facebook', 'instagram'],
      status: 'mock_published',
      fb_post_id: `mock_fb_${Date.now()}`,
      ig_post_id: `mock_ig_${Date.now()}`,
      message: "Mode beta : publications simulées. Renseigner les variables Meta dans .env pour activer.",
    });
  }

  const results = { success: true, platforms: [] };
  const errors  = [];

  // Facebook
  try {
    const url = resolvePublicUrl(image_url);
    let fb;
    if (is_story) {
      const upload = await graphPost(`/${PAGE_ID}/photos`, {
        url, published: 'false', temporary: 'true', access_token: PAGE_TOKEN,
      });
      fb = await graphPost(`/${PAGE_ID}/stories`, {
        photo_ids: upload.id, access_token: PAGE_TOKEN,
      });
    } else {
      fb = await graphPost(`/${PAGE_ID}/photos`, {
        url, message: message || '', access_token: PAGE_TOKEN,
      });
    }
    results.fb_post_id = fb.id || fb.post_id;
    results.platforms.push('facebook');
    console.log(`[Meta] Facebook publié — id: ${results.fb_post_id}`);
  } catch (err) {
    errors.push(`Facebook: ${err.message}`);
    console.error('[Meta] Erreur Facebook :', err.message);
  }

  // Instagram
  try {
    const url = resolvePublicUrl(image_url);
    const mediaParams = { image_url: url, access_token: PAGE_TOKEN };
    if (is_story) mediaParams.media_type = 'STORIES';
    else          mediaParams.caption    = caption || message || '';

    const container = await graphPost(`/${IG_ID}/media`, mediaParams);
    const publish   = await graphPost(`/${IG_ID}/media_publish`, {
      creation_id: container.id, access_token: PAGE_TOKEN,
    });
    results.ig_post_id = publish.id;
    results.platforms.push('instagram');
    console.log(`[Meta] Instagram publié — id: ${publish.id}`);
  } catch (err) {
    errors.push(`Instagram: ${err.message}`);
    console.error('[Meta] Erreur Instagram :', err.message);
  }

  if (errors.length > 0) results.errors = errors;
  if (results.platforms.length === 0) results.success = false;

  res.status(results.success ? 200 : 500).json({ ...results, timestamp: new Date() });
});

// ─── GET /api/publish/programmes ─────────────────────────────────────────────

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

// ─── DELETE /api/publish/programmes/:id ──────────────────────────────────────

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
