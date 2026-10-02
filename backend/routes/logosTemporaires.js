/**
 * Logos temporaires (Octobre Rose, Movember, maillot spécial…)
 *
 *   GET    /api/logos-temporaires              liste
 *   POST   /api/logos-temporaires              multipart : logo (PNG), club_ids (JSON, 'SCR' = SCR),
 *                                              nom_evenement, date_debut, date_fin
 *                                              → une ligne par club, même fichier
 *   PUT    /api/logos-temporaires/:id          multipart : champs + logo optionnel
 *   DELETE /api/logos-temporaires/:id          supprime la ligne (+ PNG si plus référencé)
 *   PATCH  /api/logos-temporaires/:id/toggle   active / désactive
 */
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const pool    = require('../db');

const TEMP_DIR = path.join(process.cwd(), 'uploads', 'logos', 'temporaires');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TEMP_DIR),
    filename:    (req, file, cb) => {
      const base = path.basename(file.originalname, path.extname(file.originalname))
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 40);
      cb(null, `temp_${Date.now()}_${base}.png`);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.png' && file.mimetype === 'image/png') cb(null, true);
    else cb(new Error('Seuls les fichiers PNG sont acceptés'));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Multer avec erreur renvoyée en 400 JSON (au lieu du handler global 500)
const uploadLogo = (req, res, next) =>
  upload.single('logo')(req, res, err => (err ? res.status(400).json({ error: err.message }) : next()));

const fileUrl = (filename) => `/uploads/logos/temporaires/${filename}`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function validateFields({ nom_evenement, date_debut, date_fin }) {
  if (!nom_evenement || !String(nom_evenement).trim()) return 'Le nom de l\'événement est requis';
  if (!DATE_RE.test(date_debut || '') || !DATE_RE.test(date_fin || '')) return 'Dates de début et de fin requises (AAAA-MM-JJ)';
  if (date_fin < date_debut) return 'La date de fin doit être postérieure ou égale à la date de début';
  return null;
}

// 'SCR' / '' / null → null (SCR) ; sinon entier
function parseClubId(v) {
  if (v === null || v === undefined || v === '' || String(v).toUpperCase() === 'SCR') return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? undefined : n;
}

// Supprime un PNG temporaire s'il n'est plus référencé nulle part
async function removeFileIfUnused(url) {
  if (!url || !url.startsWith('/uploads/logos/temporaires/')) return;
  const { rows: [r] } = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM logos_temporaires WHERE fichier = $1)
     + (SELECT COUNT(*) FROM clubs WHERE logo_url = $1 OR logo_monochrome_url = $1)
     + (SELECT COUNT(*) FROM templates WHERE fichier = $1) AS refs`,
    [url]
  );
  if (Number(r.refs) > 0) return;
  const p = path.join(process.cwd(), url);
  try { if (fs.existsSync(p)) fs.unlinkSync(p); }
  catch (err) { console.warn('[logos-temporaires] suppression fichier échouée :', err.message); }
}

// Supprime un upload qui n'a pas abouti (validation KO)
function discardUpload(req) {
  if (req.file) fs.unlink(req.file.path, () => {});
}

const SELECT_LIST = `
  SELECT lt.*, c.nom AS club_nom,
         CASE WHEN lt.club_id IS NULL THEN '/uploads/logos/scr.png'
              ELSE (SELECT c2.logo_url FROM clubs c2
                    WHERE LOWER(TRIM(c2.nom)) = LOWER(TRIM(c.nom)) AND c2.logo_url IS NOT NULL
                    ORDER BY c2.id LIMIT 1)
         END AS logo_defaut
  FROM logos_temporaires lt
  LEFT JOIN clubs c ON c.id = lt.club_id`;

// ─── GET /api/logos-temporaires ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `${SELECT_LIST} ORDER BY lt.date_debut DESC, (lt.club_id IS NOT NULL), c.nom ASC, lt.id DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/logos-temporaires ─────────────────────────────────────────────
router.post('/', uploadLogo, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier PNG requis' });

  const error = validateFields(req.body);
  if (error) { discardUpload(req); return res.status(400).json({ error }); }

  // club_ids : JSON '["SCR", 12]' ou valeur simple (club_id)
  let raw = req.body.club_ids ?? req.body.club_id ?? 'SCR';
  try { raw = JSON.parse(raw); } catch { /* valeur simple */ }
  const ids = [...new Set((Array.isArray(raw) ? raw : [raw]).map(parseClubId))];
  if (ids.length === 0 || ids.includes(undefined)) {
    discardUpload(req);
    return res.status(400).json({ error: 'Club(s) invalide(s)' });
  }

  const { nom_evenement, date_debut, date_fin } = req.body;
  const fichier = fileUrl(req.file.filename);
  const client  = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = [];
    for (const clubId of ids) {
      const { rows: [row] } = await client.query(
        `INSERT INTO logos_temporaires (club_id, nom_evenement, fichier, date_debut, date_fin)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [clubId, String(nom_evenement).trim(), fichier, date_debut, date_fin]
      );
      created.push(row);
    }
    await client.query('COMMIT');
    res.status(201).json({ success: true, created });
  } catch (err) {
    await client.query('ROLLBACK');
    discardUpload(req);
    res.status(err.code === '23503' ? 400 : 500).json({ error: err.code === '23503' ? 'Club introuvable' : err.message });
  } finally {
    client.release();
  }
});

// ─── PUT /api/logos-temporaires/:id ──────────────────────────────────────────
router.put('/:id', uploadLogo, async (req, res) => {
  try {
    const { rows: [current] } = await pool.query('SELECT * FROM logos_temporaires WHERE id=$1', [req.params.id]);
    if (!current) { discardUpload(req); return res.status(404).json({ error: 'Logo temporaire non trouvé' }); }

    const fields = {
      nom_evenement: req.body.nom_evenement ?? current.nom_evenement,
      date_debut:    req.body.date_debut    ?? current.date_debut,
      date_fin:      req.body.date_fin      ?? current.date_fin,
    };
    const error = validateFields(fields);
    if (error) { discardUpload(req); return res.status(400).json({ error }); }

    const clubId = 'club_id' in req.body ? parseClubId(req.body.club_id) : current.club_id;
    if (clubId === undefined) { discardUpload(req); return res.status(400).json({ error: 'Club invalide' }); }

    const fichier = req.file ? fileUrl(req.file.filename) : current.fichier;
    const { rows: [row] } = await pool.query(
      `UPDATE logos_temporaires
       SET club_id=$1, nom_evenement=$2, fichier=$3, date_debut=$4, date_fin=$5
       WHERE id=$6 RETURNING *`,
      [clubId, String(fields.nom_evenement).trim(), fichier, fields.date_debut, fields.date_fin, req.params.id]
    );
    if (req.file) await removeFileIfUnused(current.fichier);
    res.json(row);
  } catch (err) {
    discardUpload(req);
    res.status(err.code === '23503' ? 400 : 500).json({ error: err.code === '23503' ? 'Club introuvable' : err.message });
  }
});

// ─── PATCH /api/logos-temporaires/:id/toggle ─────────────────────────────────
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { rows: [row] } = await pool.query(
      'UPDATE logos_temporaires SET actif = NOT COALESCE(actif, true) WHERE id=$1 RETURNING *',
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Logo temporaire non trouvé' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/logos-temporaires/:id ───────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rows: [row] } = await pool.query('DELETE FROM logos_temporaires WHERE id=$1 RETURNING *', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Logo temporaire non trouvé' });
    await removeFileIfUnused(row.fichier);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
