const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const pool    = require('../db');
const XLSX    = require('xlsx');

// Répertoire pour les vidéos de célébration
const CELEBRATIONS_DIR = path.join(__dirname, '..', 'uploads', 'celebrations');
if (!fs.existsSync(CELEBRATIONS_DIR)) fs.mkdirSync(CELEBRATIONS_DIR, { recursive: true });

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
