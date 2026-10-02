const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const pool    = require('../db');

// ─── Config Meta ──────────────────────────────────────────────────────────────

const API_VERSION = process.env.META_API_VERSION || 'v21.0';
const GRAPH_BASE   = `https://graph.facebook.com/${API_VERSION}`;

const PAGE_ID    = process.env.FACEBOOK_PAGE_ID;
const PAGE_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const IG_ID      = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Mode par plateforme : META_MODE_FACEBOOK / META_MODE_INSTAGRAM = 'mock' | 'live'
// (défaut 'mock' si absent). En 'live' déclaré sans config → erreur explicite
// plutôt qu'un retour silencieux en mock.

function getFacebookMode() {
  const mode = (process.env.META_MODE_FACEBOOK || 'mock').toLowerCase();
  if (mode === 'live' && !(PAGE_ID && PAGE_TOKEN)) {
    throw new Error(
      'META_MODE_FACEBOOK=live mais FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN manquant(s) dans .env'
    );
  }
  return mode === 'live' ? 'live' : 'mock';
}

function getInstagramMode() {
  const mode = (process.env.META_MODE_INSTAGRAM || 'mock').toLowerCase();
  if (mode === 'live' && !(PAGE_TOKEN && IG_ID)) {
    throw new Error(
      'META_MODE_INSTAGRAM=live mais INSTAGRAM_BUSINESS_ACCOUNT_ID / FACEBOOK_PAGE_ACCESS_TOKEN manquant(s) dans .env'
    );
  }
  return mode === 'live' ? 'live' : 'mock';
}

// ─── Helpers Graph API ─────────────────────────────────────────────────────────

// Appel JSON classique (x-www-form-urlencoded) — endpoints sans upload binaire
// (media container IG, media_publish, photo_stories avec un photo_id existant…)
async function graphPost(endpoint, params) {
  const res  = await fetch(`${GRAPH_BASE}${endpoint}`, {
    method: 'POST',
    body:   new URLSearchParams(params),
  });
  let json;
  try { json = await res.json(); }
  catch { throw new Error(`Réponse Meta invalide (HTTP ${res.status})`); }
  if (json.error) throw new Error(`Meta API [${json.error.code}] ${json.error.message}`);
  return json;
}

// Upload multipart d'un fichier local — POST /{page-id}/photos avec `source`
async function graphUploadPhoto(endpoint, fields, filePath) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) form.append(key, String(value));
  }
  const buf = fs.readFileSync(filePath);
  form.append('source', new Blob([buf]), path.basename(filePath));

  const res = await fetch(`${GRAPH_BASE}${endpoint}`, { method: 'POST', body: form });
  let json;
  try { json = await res.json(); }
  catch { throw new Error(`Réponse Meta invalide (HTTP ${res.status})`); }
  if (json.error) throw new Error(`Meta API [${json.error.code}] ${json.error.message}`);
  return json;
}

// ─── Résolution de l'image ─────────────────────────────────────────────────────

// Facebook : upload binaire → on a besoin du fichier local sur disque
// (image_url pointe toujours vers /uploads/... servi par ce même backend).
function resolveLocalFilePath(imageUrl) {
  if (!imageUrl) throw new Error('image_url manquante');
  const match = imageUrl.match(/\/uploads\/(.+)$/);
  if (!match) throw new Error(`image_url doit pointer vers /uploads/... (reçu : ${imageUrl})`);
  const filePath = path.join(UPLOADS_DIR, decodeURIComponent(match[1]));
  if (!filePath.startsWith(UPLOADS_DIR)) throw new Error('Chemin image invalide');
  if (!fs.existsSync(filePath)) throw new Error(`Fichier introuvable : ${filePath}`);
  return filePath;
}

// Instagram : l'API exige une URL publique que les serveurs Meta vont chercher
// eux-mêmes — impossible en local (localhost), pas de contournement par upload.
function resolvePublicUrl(imageUrl) {
  if (!imageUrl) throw new Error('image_url manquante');
  if (imageUrl.startsWith('http') && !imageUrl.includes('localhost')) return imageUrl;
  const publicBase = process.env.PUBLIC_URL;
  if (publicBase) {
    const rel = imageUrl.replace(/^https?:\/\/[^/]+/, '');
    return `${publicBase}${rel}`;
  }
  throw new Error(
    'Instagram exige une image_url publique (pas localhost). ' +
    'Définir PUBLIC_URL dans .env ou déployer/ngrok.'
  );
}

// ─── Historique ─────────────────────────────────────────────────────────────

async function logPublication({ match_id = null, platform, type, meta_post_id = null, statut, erreur = null, image_url = null }) {
  try {
    await pool.query(
      `INSERT INTO publications_historique (match_id, platform, type, meta_post_id, statut, erreur, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [match_id, platform, type, meta_post_id, statut, erreur, image_url]
    );
  } catch (e) {
    console.error('[Meta] Erreur enregistrement historique :', e.message);
  }
}

// ─── Vidéo de célébration (hors périmètre) — toujours mock ────────────────────

async function publishVideoMock({ platform, video_url, match_id }) {
  const post_id = `mock_${platform === 'facebook' ? 'fb' : 'ig'}_video_${Date.now()}`;
  await logPublication({
    match_id, platform, type: 'story_video',
    meta_post_id: post_id, statut: 'mock', image_url: video_url,
  });
  return {
    status: 'mock_published',
    post_id,
    message: 'Publication vidéo hors périmètre pour l’instant : simulée.',
  };
}

// ─── Facebook : photo (post) ou story ──────────────────────────────────────────

async function publishFacebookPhoto({ image_url, message, is_story, test, match_id }) {
  const type = is_story ? 'story' : (test ? 'post_test' : 'post');

  if (getFacebookMode() === 'mock') {
    const post_id = `mock_fb_${Date.now()}`;
    await logPublication({ match_id, platform: 'facebook', type, meta_post_id: post_id, statut: 'mock', image_url });
    return {
      status: 'mock_published',
      post_id,
      message: 'Mode mock : publication simulée. Passer META_MODE_FACEBOOK=live dans .env pour activer.',
    };
  }

  const filePath = resolveLocalFilePath(image_url);

  if (is_story) {
    // Étape 1 : upload de la photo, non publiée sur le fil
    const upload = await graphUploadPhoto(`/${PAGE_ID}/photos`, {
      published:    'false',
      access_token: PAGE_TOKEN,
    }, filePath);

    // Étape 2 : transformer la photo uploadée en story de Page
    const story = await graphPost(`/${PAGE_ID}/photo_stories`, {
      photo_id:     upload.id,
      access_token: PAGE_TOKEN,
    });

    const post_id = story.post_id || story.id || upload.id;
    await logPublication({ match_id, platform: 'facebook', type, meta_post_id: post_id, statut: 'publie', image_url });
    return { status: 'published', post_id };
  }

  // Post classique — test=true : upload mais non publié sur la Page (validation du flux)
  const fields = { message: message || '', access_token: PAGE_TOKEN };
  if (test) fields.published = 'false';

  const result  = await graphUploadPhoto(`/${PAGE_ID}/photos`, fields, filePath);
  const post_id = result.post_id || result.id;

  await logPublication({
    match_id, platform: 'facebook', type,
    meta_post_id: post_id, statut: test ? 'test' : 'publie', image_url,
  });
  return { status: test ? 'test_published' : 'published', post_id };
}

// ─── Instagram : image (post) ou story ─────────────────────────────────────────

async function publishInstagramPhoto({ image_url, caption, is_story, match_id }) {
  const type = is_story ? 'story' : 'post';

  if (getInstagramMode() === 'mock') {
    const post_id = `mock_ig_${Date.now()}`;
    await logPublication({ match_id, platform: 'instagram', type, meta_post_id: post_id, statut: 'mock', image_url });
    return {
      status: 'mock_published',
      post_id,
      message: 'Mode mock : publication simulée. Passer META_MODE_INSTAGRAM=live dans .env pour activer (nécessite une image_url publique — voir PUBLIC_URL).',
    };
  }

  const url = resolvePublicUrl(image_url);
  const mediaParams = { image_url: url, access_token: PAGE_TOKEN };
  if (is_story) mediaParams.media_type = 'STORIES';
  else          mediaParams.caption    = caption || '';

  const container = await graphPost(`/${IG_ID}/media`, mediaParams);
  if (!container.id) throw new Error('Création container IG échouée');

  const publish = await graphPost(`/${IG_ID}/media_publish`, {
    creation_id:  container.id,
    access_token: PAGE_TOKEN,
  });

  await logPublication({ match_id, platform: 'instagram', type, meta_post_id: publish.id, statut: 'publie', image_url: url });
  return { status: 'published', post_id: publish.id };
}

// ─── POST /api/publish/facebook ───────────────────────────────────────────────

router.post('/facebook', async (req, res) => {
  const { image_url, video_url, message, is_story = false, test = false, match_id = null } = req.body;

  try {
    if (video_url) {
      const result = await publishVideoMock({ platform: 'facebook', video_url, match_id });
      return res.json({ success: true, platform: 'facebook', ...result, timestamp: new Date() });
    }

    const result = await publishFacebookPhoto({ image_url, message, is_story, test: !!test, match_id });
    console.log(`[Meta] Facebook ${result.status} — id: ${result.post_id}`);
    res.json({ success: true, platform: 'facebook', ...result, timestamp: new Date() });
  } catch (err) {
    console.error('[Meta] Erreur Facebook :', err.message);
    await logPublication({
      match_id, platform: 'facebook', type: is_story ? 'story' : 'post',
      statut: 'erreur', erreur: err.message, image_url,
    });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/publish/instagram ─────────────────────────────────────────────

router.post('/instagram', async (req, res) => {
  const { image_url, video_url, caption, is_story = false, match_id = null } = req.body;

  try {
    if (video_url) {
      const result = await publishVideoMock({ platform: 'instagram', video_url, match_id });
      return res.json({ success: true, platform: 'instagram', ...result, timestamp: new Date() });
    }

    const result = await publishInstagramPhoto({ image_url, caption, is_story, match_id });
    console.log(`[Meta] Instagram ${result.status} — id: ${result.post_id}`);
    res.json({ success: true, platform: 'instagram', ...result, timestamp: new Date() });
  } catch (err) {
    console.error('[Meta] Erreur Instagram :', err.message);
    await logPublication({
      match_id, platform: 'instagram', type: is_story ? 'story' : 'post',
      statut: 'erreur', erreur: err.message, image_url,
    });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/publish/both ───────────────────────────────────────────────────
// Chaque plateforme suit son propre mode (mock/live) et son propre résultat :
// un échec Instagram ne doit pas empêcher/annuler la publication Facebook.

router.post('/both', async (req, res) => {
  const { image_url, video_url, message, caption, is_story = false, match_id = null } = req.body;

  const out = { success: true, facebook: null, instagram: null };

  // Facebook
  try {
    const result = video_url
      ? await publishVideoMock({ platform: 'facebook', video_url, match_id })
      : await publishFacebookPhoto({ image_url, message, is_story, test: false, match_id });
    out.facebook = { success: true, ...result };
  } catch (err) {
    console.error('[Meta] Erreur Facebook :', err.message);
    await logPublication({
      match_id, platform: 'facebook', type: is_story ? 'story' : 'post',
      statut: 'erreur', erreur: err.message, image_url,
    });
    out.facebook = { success: false, error: err.message };
  }

  // Instagram
  try {
    const result = video_url
      ? await publishVideoMock({ platform: 'instagram', video_url, match_id })
      : await publishInstagramPhoto({ image_url, caption: caption || message, is_story, match_id });
    out.instagram = { success: true, ...result };
  } catch (err) {
    console.error('[Meta] Erreur Instagram :', err.message);
    await logPublication({
      match_id, platform: 'instagram', type: is_story ? 'story' : 'post',
      statut: 'erreur', erreur: err.message, image_url,
    });
    out.instagram = { success: false, error: err.message };
  }

  out.success = out.facebook.success || out.instagram.success;
  res.status(out.success ? 200 : 500).json({ ...out, timestamp: new Date() });
});

// ─── GET /api/publish/historique ───────────────────────────────────────────────

router.get('/historique', async (req, res) => {
  try {
    const { platform, statut, match_id, limit = 100 } = req.query;
    const conditions = [];
    const params = [];

    if (platform) { params.push(platform); conditions.push(`platform = $${params.length}`); }
    if (statut)   { params.push(statut);   conditions.push(`statut = $${params.length}`); }
    if (match_id) { params.push(match_id); conditions.push(`match_id = $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(Math.min(parseInt(limit, 10) || 100, 500));

    const result = await pool.query(
      `SELECT * FROM publications_historique ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
