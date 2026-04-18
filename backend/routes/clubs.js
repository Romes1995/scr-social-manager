const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const pool    = require('../db');

const LOGOS_DIR = path.join(__dirname, '..', 'uploads', 'logos');
if (!fs.existsSync(LOGOS_DIR)) fs.mkdirSync(LOGOS_DIR, { recursive: true });

const imageFilter = (req, file, cb) => {
  const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
  if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
  else cb(new Error('Seuls PNG/JPG/WEBP sont acceptés'));
};

// Multer logo SCR fixe
const uploadScr = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, LOGOS_DIR),
    filename:    (req, file, cb) => cb(null, 'scr.png'),
  }),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Multer logo SCR monochrome
const uploadScrMono = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, LOGOS_DIR),
    filename:    (req, file, cb) => cb(null, 'scr_monochrome.png'),
  }),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Multer logo club par id
const uploadClub = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, LOGOS_DIR),
    filename:    (req, file, cb) => cb(null, `club_${req.params.id}.png`),
  }),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Multer import en masse — jusqu'à 30 fichiers
const uploadBulk = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, LOGOS_DIR),
    filename:    (req, file, cb) => {
      const ts   = Date.now();
      const base = path.basename(file.originalname, path.extname(file.originalname))
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 40);
      cb(null, `import_${ts}_${base}.png`);
    },
  }),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 30 },
});

// ─── GET /api/clubs ───────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clubs ORDER BY nom ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/clubs/scr-logo — Upload logo SCR (fixe) ───────────────────────
router.post('/scr-logo', uploadScr.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier logo requis' });
  res.json({ success: true, logo_url: '/uploads/logos/scr.png' });
});

// ─── POST /api/clubs/scr-logo-monochrome — Upload logo SCR monochrome ────────
router.post('/scr-logo-monochrome', uploadScrMono.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier logo requis' });
  res.json({ success: true, logo_url: '/uploads/logos/scr_monochrome.png' });
});

// ─── POST /api/clubs/bulk-upload — Import logos en masse ─────────────────────
router.post('/bulk-upload', uploadBulk.array('logos', 30), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Aucun fichier reçu' });
  }
  const files = req.files.map(f => ({
    originalName: f.originalname,
    url:          `/uploads/logos/${f.filename}`,
    filename:     f.filename,
  }));
  res.json({ success: true, files });
});

// ─── POST /api/clubs/save-logo-associations — Sauvegarder les associations ───
// Body : { associations: [{ url, colorClubId, monoClubId }] }
router.post('/save-logo-associations', async (req, res) => {
  const { associations } = req.body;
  if (!Array.isArray(associations) || associations.length === 0) {
    return res.status(400).json({ error: 'Aucune association fournie' });
  }

  const updated = [];
  const errors  = [];

  for (const assoc of associations) {
    const { url, colorClubId, monoClubId } = assoc;
    if (!url) continue;

    if (colorClubId) {
      try {
        // Récupérer le nom de base, puis propager à toutes les équipes
        const clubRow = await pool.query('SELECT nom FROM clubs WHERE id=$1', [colorClubId]);
        if (clubRow.rows.length > 0) {
          const nom = clubRow.rows[0].nom;
          await pool.query(
            'UPDATE clubs SET logo_url=$1 WHERE LOWER(TRIM(nom))=LOWER($2)',
            [url, nom]
          );
          updated.push({ club: nom, type: 'couleur', url });
        }
      } catch (err) {
        errors.push({ url, type: 'couleur', error: err.message });
      }
    }

    if (monoClubId) {
      try {
        const clubRow = await pool.query('SELECT nom FROM clubs WHERE id=$1', [monoClubId]);
        if (clubRow.rows.length > 0) {
          const nom = clubRow.rows[0].nom;
          await pool.query(
            'UPDATE clubs SET logo_monochrome_url=$1 WHERE LOWER(TRIM(nom))=LOWER($2)',
            [url, nom]
          );
          updated.push({ club: nom, type: 'monochrome', url });
        }
      } catch (err) {
        errors.push({ url, type: 'monochrome', error: err.message });
      }
    }
  }

  res.json({ success: true, updated: updated.length, details: updated, errors });
});

// ─── GET /api/clubs/:id ───────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clubs WHERE id=$1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Club non trouvé' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/clubs ──────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { nom, logo_url, logo_monochrome_url, equipe } = req.body;
    if (!nom) return res.status(400).json({ error: 'nom est requis' });
    const result = await pool.query(
      'INSERT INTO clubs (nom, logo_url, logo_monochrome_url, equipe) VALUES ($1, $2, $3, $4) RETURNING *',
      [nom.trim(), logo_url || null, logo_monochrome_url || null, equipe || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/clubs/:id/logo — Upload logo couleur (propagé à tout le club) ──
router.post('/:id/logo', uploadClub.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier logo requis' });
  const logoUrl = `/uploads/logos/club_${req.params.id}.png`;
  try {
    // Récupérer le nom de base du club
    const clubRow = await pool.query('SELECT nom FROM clubs WHERE id=$1', [req.params.id]);
    if (clubRow.rows.length === 0) return res.status(404).json({ error: 'Club non trouvé' });
    const nom = clubRow.rows[0].nom;

    // Appliquer le logo à TOUTES les équipes du même club (même nom)
    await pool.query(
      'UPDATE clubs SET logo_url=$1 WHERE LOWER(TRIM(nom))=LOWER($2)',
      [logoUrl, nom]
    );

    const updated = await pool.query('SELECT * FROM clubs WHERE id=$1', [req.params.id]);
    res.json({ success: true, club: updated.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/clubs/:id ───────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { nom, logo_url, logo_monochrome_url, equipe } = req.body;
    if (!nom) return res.status(400).json({ error: 'nom est requis' });
    const result = await pool.query(
      'UPDATE clubs SET nom=$1, logo_url=$2, logo_monochrome_url=$3, equipe=$4 WHERE id=$5 RETURNING *',
      [nom.trim(), logo_url || null, logo_monochrome_url || null, equipe || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Club non trouvé' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/clubs/:id ────────────────────────────────────────────────────
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
