const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const pool = require('../db');

// Config multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `template_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers PNG/JPG sont acceptés'));
    }
  },
});

// GET /api/templates
router.get('/', async (req, res) => {
  try {
    const { type, equipe } = req.query;
    let query = 'SELECT * FROM templates';
    const params = [];
    const conditions = [];

    if (type) {
      params.push(type);
      conditions.push(`type = $${params.length}`);
    }
    if (equipe) {
      params.push(equipe);
      conditions.push(`equipe = $${params.length}`);
    }

    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/templates/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM templates WHERE id=$1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Template non trouvé' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/templates - Upload + création
router.post('/', upload.single('fichier'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier image requis' });

    const { nom, type, equipe, zones } = req.body;
    if (!nom || !type) return res.status(400).json({ error: 'nom et type sont requis' });

    let parsedZones = [];
    if (zones) {
      try {
        parsedZones = typeof zones === 'string' ? JSON.parse(zones) : zones;
      } catch {
        return res.status(400).json({ error: 'Format zones invalide (JSON attendu)' });
      }
    }

    const fichier = `/uploads/${req.file.filename}`;
    const result = await pool.query(
      'INSERT INTO templates (nom, type, equipe, fichier, zones) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [nom.trim(), type, equipe || null, fichier, JSON.stringify(parsedZones)]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/templates/:id - Modifier métadonnées
router.put('/:id', async (req, res) => {
  try {
    const { nom, type, equipe, zones } = req.body;
    if (!nom || !type) return res.status(400).json({ error: 'nom et type sont requis' });

    let parsedZones = [];
    if (zones) {
      try {
        parsedZones = typeof zones === 'string' ? JSON.parse(zones) : zones;
      } catch {
        return res.status(400).json({ error: 'Format zones invalide' });
      }
    }

    const result = await pool.query(
      'UPDATE templates SET nom=$1, type=$2, equipe=$3, zones=$4 WHERE id=$5 RETURNING *',
      [nom.trim(), type, equipe || null, JSON.stringify(parsedZones), req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Template non trouvé' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/templates/:id/generer - Générer image avec texte
router.post('/:id/generer', async (req, res) => {
  try {
    const templateRes = await pool.query('SELECT * FROM templates WHERE id=$1', [req.params.id]);
    if (templateRes.rows.length === 0) return res.status(404).json({ error: 'Template non trouvé' });

    const template = templateRes.rows[0];
    const { valeurs } = req.body; // { zone_id: "texte" }

    const templatePath = path.join(__dirname, '..', template.fichier);
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ error: 'Fichier template introuvable' });
    }

    const zones = template.zones || [];

    // Générer les overlays SVG pour chaque zone
    const svgOverlays = zones.map((zone, idx) => {
      const texte = (valeurs && valeurs[zone.id || idx]) || zone.placeholder || '';
      if (!texte) return null;

      const escapedText = texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<text
        x="${zone.x + (zone.width || 200) / 2}"
        y="${zone.y + (zone.height || 40) / 2 + 5}"
        font-family="${zone.font || 'Arial'}"
        font-size="${zone.fontSize || 32}"
        font-weight="${zone.bold ? 'bold' : 'normal'}"
        fill="${zone.color || '#ffffff'}"
        text-anchor="middle"
        dominant-baseline="middle"
      >${escapedText}</text>`;
    }).filter(Boolean);

    // Récupérer les dimensions de l'image
    const metadata = await sharp(templatePath).metadata();
    const width = metadata.width || 1080;
    const height = metadata.height || 1080;

    const svgBuffer = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        ${svgOverlays.join('\n')}
      </svg>
    `);

    const outputFilename = `generated_${Date.now()}.png`;
    const outputPath = path.join(__dirname, '..', 'uploads', outputFilename);

    await sharp(templatePath)
      .composite([{ input: svgBuffer, top: 0, left: 0 }])
      .toFile(outputPath);

    res.json({
      success: true,
      fichier: `/uploads/${outputFilename}`,
      url: `http://localhost:${process.env.PORT || 3001}/uploads/${outputFilename}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/templates/:id
router.delete('/:id', async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM templates WHERE id=$1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Template non trouvé' });

    // Supprimer le fichier physique
    const filePath = path.join(__dirname, '..', existing.rows[0].fichier);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await pool.query('DELETE FROM templates WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
