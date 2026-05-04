const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const sharp   = require('sharp');
const pool    = require('../db');
const XLSX    = require('xlsx');

// Répertoire pour les vidéos de célébration
const CELEBRATIONS_DIR = path.join(__dirname, '..', 'uploads', 'celebrations');
if (!fs.existsSync(CELEBRATIONS_DIR)) fs.mkdirSync(CELEBRATIONS_DIR, { recursive: true });

// Répertoire racine pour les images joueurs
const JOUEURS_DIR = path.join(__dirname, '..', 'uploads', 'joueurs');
if (!fs.existsSync(JOUEURS_DIR)) fs.mkdirSync(JOUEURS_DIR, { recursive: true });

// Multer pour les vidéos de célébration
const uploadCelebration = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, CELEBRATIONS_DIR),
    filename:    (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `celebration_${req.params.id}${ext}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.mp4', '.mov', '.avi', '.webm'].includes(ext)) cb(null, true);
    else cb(new Error('Seuls les fichiers MP4/MOV/AVI/WebM sont acceptés'));
  },
});

// Multer en mémoire pour le fichier Excel (pas besoin de l'écrire sur disque)
const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.ods'].includes(ext)) cb(null, true);
    else cb(new Error('Seuls les fichiers Excel (.xlsx/.xls) sont acceptés'));
  },
});

// GET /api/joueurs
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM joueurs ORDER BY nom ASC, prenom ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/joueurs/preview-excel — Lit le fichier Excel et retourne un aperçu
router.post('/preview-excel', uploadExcel.single('fichier'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier Excel requis' });

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const rows     = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) return res.status(400).json({ error: 'Feuille vide ou format invalide' });

    // Chercher les colonnes Prénom / Nom (insensible à la casse, accepte variantes)
    const firstRow  = rows[0];
    const colKeys   = Object.keys(firstRow);
    const findCol   = (labels) => colKeys.find(k => labels.some(l => k.toLowerCase().includes(l.toLowerCase())));

    const prenomCol = findCol(['prenom', 'prénom', 'firstname', 'first name', 'first_name']);
    const nomCol    = findCol(['nom', 'name', 'lastname', 'last name', 'last_name']);

    if (!prenomCol || !nomCol) {
      return res.status(400).json({
        error: 'Colonnes "Prénom" et "Nom" introuvables dans le fichier',
        colonnes_detectees: colKeys,
      });
    }

    const joueurs = rows
      .map(row => ({
        prenom: String(row[prenomCol] || '').trim(),
        nom:    String(row[nomCol]    || '').trim(),
      }))
      .filter(j => j.prenom && j.nom);

    if (joueurs.length === 0) return res.status(400).json({ error: 'Aucun joueur valide trouvé' });

    res.json({
      success:    true,
      total:      joueurs.length,
      prenom_col: prenomCol,
      nom_col:    nomCol,
      joueurs,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la lecture du fichier : ' + err.message });
  }
});

// POST /api/joueurs/confirm-import — Insère les joueurs en évitant les doublons
router.post('/confirm-import', async (req, res) => {
  const { joueurs } = req.body;
  if (!Array.isArray(joueurs) || joueurs.length === 0) {
    return res.status(400).json({ error: 'Liste vide' });
  }

  let inserted = 0;
  let skipped  = 0;
  const errors = [];

  for (const j of joueurs) {
    const prenom = String(j.prenom || '').trim();
    const nom    = String(j.nom    || '').trim();
    if (!prenom || !nom) { skipped++; continue; }

    try {
      const result = await pool.query(
        `INSERT INTO joueurs (prenom, nom) VALUES ($1, $2)
         ON CONFLICT DO NOTHING RETURNING id`,
        [prenom, nom]
      );
      if (result.rows.length > 0) inserted++;
      else skipped++; // doublon ignoré
    } catch (err) {
      // Doublon détecté par contrainte unique si elle existe, sinon erreur réelle
      if (err.code === '23505') skipped++;
      else errors.push({ prenom, nom, error: err.message });
    }
  }

  res.json({ success: true, inserted, skipped, errors });
});

// Multer en mémoire pour les images joueurs (Sharp redimensionne ensuite)
const uploadImages = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) cb(null, true);
    else cb(new Error('Seuls les fichiers image (JPG/PNG/WebP) sont acceptés'));
  },
}).fields([
  { name: 'photo',       maxCount: 1 },
  { name: 'celebration', maxCount: 1 },
]);

// PUT /api/joueurs/:id/images — Upload photo et/ou image de célébration
router.put('/:id/images', (req, res, next) => uploadImages(req, res, err => {
  if (err) return res.status(400).json({ error: err.message });
  next();
}), async (req, res) => {
  try {
    const id      = req.params.id;
    const files   = req.files || {};
    const updates = {};

    const playerDir = path.join(JOUEURS_DIR, String(id));
    if (!fs.existsSync(playerDir)) fs.mkdirSync(playerDir, { recursive: true });

    if (files.photo?.[0]) {
      const outPath = path.join(playerDir, 'photo.png');
      console.log('[upload] processPlayerPhoto appelé pour:', outPath);
      console.log('[upload] buffer size:', files.photo[0].buffer.length, 'bytes, mimetype:', files.photo[0].mimetype);

      const { data, info } = await sharp(files.photo[0].buffer)
        .resize(400, 400, { fit: 'contain', background: { r: 255, g: 0, b: 255, alpha: 1 } })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      console.log('[upload] image redimensionnée:', info.width, 'x', info.height, 'channels:', info.channels);

      let firstMagenta = null;
      let transparentCount = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r > 180 && g < 80 && b > 180) {
          if (!firstMagenta) {
            firstMagenta = { r, g, b, pixel: i / 4 };
            console.log('[upload] premier pixel magenta:', r, g, b, '@ pixel', i / 4);
          }
          data[i + 3] = 0;
          transparentCount++;
        }
      }
      if (!firstMagenta) console.log('[upload] aucun pixel magenta détecté');
      console.log('[upload] pixels rendus transparents:', transparentCount, '/', info.width * info.height);

      await sharp(Buffer.from(data), {
        raw: { width: info.width, height: info.height, channels: 4 },
      }).png().toFile(outPath);
      console.log('[upload] photo sauvegardée:', outPath);

      // Supprimer l'ancien fichier JPEG si présent
      const oldJpg = path.join(playerDir, 'photo.jpg');
      if (fs.existsSync(oldJpg)) fs.unlinkSync(oldJpg);

      updates.photo = `/uploads/joueurs/${id}/photo.png`;
    }

    if (files.celebration?.[0]) {
      const outPath = path.join(playerDir, 'celebration.jpg');
      await sharp(files.celebration[0].buffer)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toFile(outPath);
      updates.celebration_url = `/uploads/joueurs/${id}/celebration.jpg`;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Aucun fichier valide reçu' });
    }

    const setClauses = Object.keys(updates)
      .map((col, i) => `${col}=$${i + 1}`)
      .join(', ');
    const values = [...Object.values(updates), id];
    const result = await pool.query(
      `UPDATE joueurs SET ${setClauses} WHERE id=$${values.length} RETURNING *`,
      values
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Joueur non trouvé' });
    res.json({ success: true, joueur: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/joueurs/:id/celebration — Upload vidéo de célébration
router.post('/:id/celebration', uploadCelebration.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier vidéo requis' });
    const ext      = path.extname(req.file.originalname).toLowerCase();
    const videoUrl = `/uploads/celebrations/celebration_${req.params.id}${ext}`;
    const result   = await pool.query(
      'UPDATE joueurs SET video_celebration_url=$1 WHERE id=$2 RETURNING *',
      [videoUrl, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Joueur non trouvé' });
    res.json({ success: true, joueur: result.rows[0] });
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
    const { nom, prenom, ddn, categorie } = req.body;
    if (!nom || !prenom) return res.status(400).json({ error: 'nom et prenom sont requis' });
    const result = await pool.query(
      'INSERT INTO joueurs (nom, prenom, ddn, categorie) VALUES ($1, $2, $3, $4) RETURNING *',
      [nom.trim(), prenom.trim(), ddn || null, categorie || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/joueurs/:id
router.put('/:id', async (req, res) => {
  try {
    const { nom, prenom, ddn, categorie } = req.body;
    if (!nom || !prenom) return res.status(400).json({ error: 'nom et prenom sont requis' });
    const result = await pool.query(
      'UPDATE joueurs SET nom=$1, prenom=$2, ddn=$3, categorie=$4 WHERE id=$5 RETURNING *',
      [nom.trim(), prenom.trim(), ddn || null, categorie || null, req.params.id]
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
