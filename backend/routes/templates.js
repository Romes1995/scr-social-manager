const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const pool = require('../db');
const { generateProgramme, generateScoreLive, generateResultats, generateMatchDay: _generateMatchDay } = require('../utils/imageGenerator');

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

// GET /api/templates/score-live/status — doit être AVANT /:id
router.get('/score-live/status', (req, res) => {
  const status = [1, 2, 3].map(num => {
    const filePath = path.join(TEMPLATES_DIR, `score_live_scr${num}.png`);
    const exists   = fs.existsSync(filePath);
    const size     = exists ? fs.statSync(filePath).size : 0;
    return { num, filename: `score_live_scr${num}.png`, exists, size_kb: Math.round(size / 1024) };
  });
  res.json({ status });
});

// GET /api/templates/resultats/status — doit être AVANT /:id
router.get('/resultats/status', (req, res) => {
  const files = [
    { num: 1, filename: 'resultat_1match.png' },
    { num: 2, filename: 'resultat_2matchs.png' },
    { num: 3, filename: 'resultat_3matchs.png' },
  ].map(({ num, filename }) => {
    const filePath = path.join(TEMPLATES_DIR, filename);
    const exists   = fs.existsSync(filePath);
    const size     = exists ? fs.statSync(filePath).size : 0;
    return { num, filename, exists, size_kb: Math.round(size / 1024) };
  });
  res.json({ status: files });
});

// GET /api/templates/preset-info — infos sur les templates prédéfinis disponibles
router.get('/preset-info', async (req, res) => {
  try {
    const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

    const dbFile = async (type) => {
      const r = await pool.query(
        `SELECT fichier FROM templates WHERE type=$1 ORDER BY id DESC LIMIT 1`, [type]
      );
      if (!r.rows.length) return null;
      const diskPath = path.join(__dirname, '..', r.rows[0].fichier);
      return fs.existsSync(diskPath) ? r.rows[0].fichier : null;
    };

    const mdFile = await dbFile('matchday')
      || (fs.existsSync(path.join(UPLOADS_DIR, 'template_1776525499057.png'))
          ? '/uploads/template_1776525499057.png' : null);
    const slFile = await dbFile('score_live')
      || (fs.existsSync(path.join(TEMPLATES_DIR, 'score_live_scr1.png'))
          ? '/uploads/templates/score_live_scr1.png' : null);

    const rVariants = {};
    for (const n of [1, 2, 3]) {
      const suffix = n === 1 ? '1match' : `${n}matchs`;
      const fp = path.join(TEMPLATES_DIR, `resultat_${suffix}.png`);
      rVariants[n] = { fichier: fs.existsSync(fp) ? `/uploads/templates/resultat_${suffix}.png` : null };
    }

    const pVariants = {};
    for (const n of [1, 2, 3, 4]) {
      const suffix = n === 1 ? '1match' : `${n}matchs`;
      const fp = path.join(TEMPLATES_DIR, `programme_story_${suffix}.png`);
      pVariants[n] = { fichier: fs.existsSync(fp) ? `/uploads/templates/programme_story_${suffix}.png` : null };
    }

    res.json({
      matchday:  { fichier: mdFile, width: 1080, height: 1920 },
      score_live: { fichier: slFile, width: 1080, height: 1920 },
      resultats: { variants: rVariants, width: 940, height: 788 },
      programme: { variants: pVariants, width: 1080, height: 1920 },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/templates/preview-preset — génère un aperçu avec données fictives
router.post('/preview-preset', async (req, res) => {
  const { type, variant = 1 } = req.body;
  const n = Math.min(Math.max(parseInt(variant) || 1, 1), 4);

  const FAKE = {
    equipe: 'SCR 1', adversaire: 'AS Gambsheim',
    date: '2026-05-10', heure: '15:00', lieu: 'Roeschwoog', division: 'D1',
    domicile: true, score_scr: 2, score_adv: 1, buteurs: ['Dupont J.', 'Martin T.'],
  };
  const FAKES = [
    { ...FAKE, equipe: 'SCR 1', adversaire: 'AS Gambsheim' },
    { ...FAKE, equipe: 'SCR 2', adversaire: 'FC Beinheim',   score_scr: 1, score_adv: 1, domicile: false },
    { ...FAKE, equipe: 'SCR 3', adversaire: 'US Drusenheim', score_scr: 3, score_adv: 0 },
    { ...FAKE, equipe: 'SCR 1', adversaire: 'FC Lauterbourg', score_scr: 0, score_adv: 2 },
  ];

  try {
    const base = `http://localhost:${process.env.PORT || 3001}`;
    let url;
    if (type === 'matchday') {
      url = await _generateMatchDay(null, 1, FAKE);
    } else if (type === 'score_live') {
      url = await generateScoreLive(999, FAKE);
    } else if (type === 'resultats') {
      url = await generateResultats(FAKES.slice(0, Math.min(n, 3)));
    } else if (type === 'programme') {
      const result = await generateProgramme(FAKES.slice(0, Math.min(n, 4)));
      url = result.story;
    } else {
      return res.status(400).json({ error: 'Type invalide' });
    }
    res.json({ success: true, url: base + url });
  } catch (err) {
    console.error('[preview-preset]', err.message);
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

// POST /api/templates/:id/generer-dynamique — génération avec données match
router.post('/:id/generer-dynamique', async (req, res) => {
  try {
    const { matchId, textesFixe = {} } = req.body;
    if (!matchId) return res.status(400).json({ error: 'matchId requis' });

    const { generateFromTemplate } = require('../services/templateGenerator');
    const imagePath = await generateFromTemplate(req.params.id, matchId, textesFixe);

    const base = `http://localhost:${process.env.PORT || 3001}`;
    res.json({ success: true, url: base + imagePath, path: imagePath });
  } catch (err) {
    console.error('[generer-dynamique]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/templates/generate-programme
// Body: { matchs: [{equipe, adversaire, logo_adversaire, date, heure, domicile}] }
router.post('/generate-programme', async (req, res) => {
  try {
    const { matchs } = req.body;
    if (!Array.isArray(matchs) || matchs.length === 0) {
      return res.status(400).json({ error: 'Au moins un match est requis' });
    }
    if (matchs.length > 4) {
      return res.status(400).json({ error: 'Maximum 4 matchs par génération' });
    }

    const result = await generateProgramme(matchs);
    const base = `http://localhost:${process.env.PORT || 3001}`;

    res.json({
      success: true,
      story: result.story,
      post: result.post,
      story_url: base + result.story,
      post_url: base + result.post,
      nb_matchs: matchs.length,
    });
  } catch (err) {
    console.error('[generate-programme]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/templates/generate-matchday
// Body: { matchId, teamNumber }
router.post('/generate-matchday', async (req, res) => {
  try {
    const { matchId, teamNumber } = req.body;

    if (!matchId || !teamNumber) {
      return res.status(400).json({ success: false, error: 'matchId et teamNumber sont requis' });
    }

    if (![1, 2, 3].includes(Number(teamNumber))) {
      return res.status(400).json({ success: false, error: 'teamNumber doit être 1, 2 ou 3' });
    }

    const { generateMatchDay } = require('../utils/imageGenerator');
    const imagePath = await generateMatchDay(matchId, Number(teamNumber));

    const base = `http://localhost:${process.env.PORT || 3001}`;
    res.json({ success: true, story: imagePath, story_url: base + imagePath });
  } catch (err) {
    console.error('[generate-matchday]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Upload templates score live ─────────────────────────────────────────────

const TEMPLATES_DIR = path.join(__dirname, '..', 'uploads', 'templates');

const uploadScoreLive = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TEMPLATES_DIR),
    filename: (req, file, cb) => {
      const num = parseInt(req.params.num) || 1;
      cb(null, `score_live_scr${Math.min(Math.max(num, 1), 3)}.png`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.png') cb(null, true);
    else cb(new Error('Seuls les fichiers PNG sont acceptés pour les templates score live'));
  },
});

const uploadResultat = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TEMPLATES_DIR),
    filename: (req, file, cb) => {
      const num = parseInt(req.params.num) || 1;
      const suffix = num === 1 ? '1match' : `${num}matchs`;
      cb(null, `resultat_${suffix}.png`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.png') cb(null, true);
    else cb(new Error('Seuls les fichiers PNG sont acceptés'));
  },
});

// POST /api/templates/score-live/:num — remplace score_live_scrN.png (N = 1|2|3)
router.post('/score-live/:num', uploadScoreLive.single('template'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier PNG requis' });
  const num  = Math.min(Math.max(parseInt(req.params.num) || 1, 1), 3);
  const meta = await sharp(req.file.path).metadata();
  res.json({
    success:  true,
    filename: req.file.filename,
    size_kb:  Math.round(req.file.size / 1024),
    width:    meta.width,
    height:   meta.height,
  });
});

// POST /api/templates/resultat/:num — remplace resultat_NmatchS.png (N = 1|2|3)
router.post('/resultat/:num', uploadResultat.single('template'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier PNG requis' });
  const meta = await sharp(req.file.path).metadata();
  res.json({
    success:  true,
    filename: req.file.filename,
    size_kb:  Math.round(req.file.size / 1024),
    width:    meta.width,
    height:   meta.height,
  });
});

// POST /api/templates/generate-score-live
// Body: { match_id }
router.post('/generate-score-live', async (req, res) => {
  try {
    const { match_id } = req.body;
    if (!match_id) return res.status(400).json({ error: 'match_id requis' });
    const url = await generateScoreLive(match_id);
    const base = `http://localhost:${process.env.PORT || 3001}`;
    res.json({ success: true, url, full_url: base + url });
  } catch (err) {
    console.error('[generate-score-live]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/templates/generate-fin-match
// Body: { match_id }
router.post('/generate-fin-match', async (req, res) => {
  try {
    const { match_id } = req.body;
    if (!match_id) return res.status(400).json({ error: 'match_id requis' });
    const url = await generateScoreLive(match_id, null, true);
    const base = `http://localhost:${process.env.PORT || 3001}`;
    res.json({ success: true, url, full_url: base + url });
  } catch (err) {
    console.error('[generate-fin-match]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/templates/generate-resultats
// Body: { matchs: [{...}] }
router.post('/generate-resultats', async (req, res) => {
  try {
    const { matchs } = req.body;
    if (!Array.isArray(matchs) || matchs.length === 0) {
      return res.status(400).json({ error: 'Au moins un match terminé requis' });
    }
    if (matchs.length > 3) {
      return res.status(400).json({ error: 'Maximum 3 matchs par visuel résultats' });
    }
    const url  = await generateResultats(matchs);
    const base = `http://localhost:${process.env.PORT || 3001}`;
    res.json({ success: true, url, full_url: base + url, nb_matchs: matchs.length });
  } catch (err) {
    console.error('[generate-resultats]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/templates/generate-resultat-weekend
// Body: { matchIds: [id, ...] }  — 1 à 3 IDs de matchs terminés
router.post('/generate-resultat-weekend', async (req, res) => {
  try {
    const { matchIds } = req.body;
    if (!Array.isArray(matchIds) || matchIds.length === 0 || matchIds.length > 3) {
      return res.status(400).json({ error: '1 à 3 match IDs requis' });
    }

    const { generateResultat } = require('../services/generateResultat');
    const BACKEND   = path.join(__dirname, '..');
    const LOGOS_DIR = path.join(BACKEND, 'uploads', 'logos');
    const LOGO_SCR  = path.join(LOGOS_DIR, 'scr.png');

    // Charger les matchs depuis la DB (ordre par équipe SCR)
    const { rows: matchesDB } = await pool.query(
      'SELECT * FROM matches WHERE id = ANY($1::int[]) ORDER BY equipe ASC',
      [matchIds]
    );
    if (matchesDB.length === 0) throw new Error('Aucun match trouvé pour ces IDs');

    // ── Lire les zones depuis la table templates ──────────────────────────────
    // Cherche un template de type 'resultats' pour l'équipe concernée,
    // avec fallback sur 'Toutes' / NULL. Ne s'applique qu'au cas 1 match
    // (layouts 2 et 3 matchs ont des positions différentes).
    const scrEquipeFirst = matchesDB[0]?.equipe || null;
    const tplQ = await pool.query(
      `SELECT zones FROM templates
       WHERE type = 'resultats'
         AND (equipe = $1 OR equipe IS NULL OR equipe = '' OR equipe = 'Toutes')
       ORDER BY
         CASE WHEN equipe = $1 THEN 0 ELSE 1 END,
         created_at DESC
       LIMIT 1`,
      [scrEquipeFirst]
    );
    const templateZones = tplQ.rows[0]?.zones || [];
    console.log(`[generate-resultat-weekend] template zones trouvées : ${templateZones.length}`);

    // Construire zoneOverrides depuis les zones DB (1 match uniquement)
    const zoneOverrides = {};
    if (templateZones.length > 0 && matchesDB.length === 1) {
      const m0       = matchesDB[0];
      const scrOnLeft = m0.domicile !== false;

      // Chercher les zones pertinentes par source ou label
      const logoScrZone  = templateZones.find(z => z.source === 'logo_scr');
      const logoDomZone  = templateZones.find(z => z.source === 'logo_domicile');
      const logoExtZone  = templateZones.find(z => z.source === 'logo_exterieur');
      const scorerZone   = templateZones.find(z =>
        z.source === 'buteurs' ||
        (z.label || '').toLowerCase().includes('buteur') ||
        (z.label || '').toLowerCase().includes('scorer')
      );

      const ov = {};

      // Logo gauche (équipe domicile dans l'image)
      // logo_domicile prime sur logo_scr (si SCR est à gauche)
      const leftZone = logoDomZone ?? (scrOnLeft ? logoScrZone : null);
      if (leftZone?.x != null) {
        ov.logoG = {
          left: Math.round(leftZone.x),
          top:  Math.round(leftZone.y),
          w:    Math.round(leftZone.width  || 89),
          h:    Math.round(leftZone.height || 89),
        };
      }

      // Logo droite (équipe extérieure dans l'image)
      const rightZone = logoExtZone ?? (!scrOnLeft ? logoScrZone : null);
      if (rightZone?.x != null) {
        ov.logoD = {
          left: Math.round(rightZone.x),
          top:  Math.round(rightZone.y),
          w:    Math.round(rightZone.width  || 89),
          h:    Math.round(rightZone.height || 89),
        };
      }

      // Bloc buteurs : x → ancrage texte, y → première ligne
      if (scorerZone?.x != null) {
        if (scrOnLeft) {
          // text-anchor="start" : x = bord gauche du bloc
          ov.scorerX_dom = Math.round(scorerZone.x);
        } else {
          // text-anchor="end" : x = bord droit du bloc
          ov.scorerX_ext = Math.round(scorerZone.x + (scorerZone.width || 0));
        }
        ov.scorerStartY = Math.round(scorerZone.y);
      }

      if (Object.keys(ov).length > 0) {
        zoneOverrides[0] = ov;
        console.log('[generate-resultat-weekend] zoneOverrides[0] :', JSON.stringify(ov));
      }
    }

    // Construire le tableau matches pour generateResultat
    const matches = await Promise.all(matchesDB.map(async (m) => {
      // Rechercher logo adversaire dans la table clubs (correspondance partielle sur le nom)
      const advWords = (m.adversaire || '').split(/\s+/);
      let advLogoPath = null;
      for (const word of advWords) {
        if (word.length < 3) continue;
        const { rows } = await pool.query(
          "SELECT logo_url FROM clubs WHERE LOWER(nom) LIKE LOWER($1) AND logo_url IS NOT NULL LIMIT 1",
          [`%${word}%`]
        );
        if (rows[0]?.logo_url) {
          advLogoPath = path.join(BACKEND, rows[0].logo_url);
          break;
        }
      }

      // domicile=true → SCR à gauche ; domicile=false → SCR à droite
      const scrOnLeft = m.domicile !== false;
      const scrLogo   = fs.existsSync(LOGO_SCR) ? LOGO_SCR : null;
      const scrNom    = (m.equipe     || 'SCR').toUpperCase();
      const advNom    = (m.adversaire || '').toUpperCase();
      const score     = scrOnLeft
        ? `${m.score_scr ?? 0} - ${m.score_adv ?? 0}`
        : `${m.score_adv ?? 0} - ${m.score_scr ?? 0}`;

      // Formatage buteurs : "Nom Prénom [count]" (parse dans scorerTextNodes via regex)
      const buteursRaw = m.buteurs || [];
      const goalCount  = {};
      for (const b of buteursRaw) goalCount[b] = (goalCount[b] || 0) + 1;
      const scorers = Object.entries(goalCount)
        .map(([name, count]) => count > 1 ? `${name} [${count}]` : name)
        .join('\n');

      return {
        logoGauche: scrOnLeft ? scrLogo     : advLogoPath,
        nomGauche:  scrOnLeft ? scrNom      : advNom,
        score,
        nomDroite:  scrOnLeft ? advNom      : scrNom,
        logoDroite: scrOnLeft ? advLogoPath : scrLogo,
        scorers,
        domicile:   scrOnLeft,
      };
    }));

    const { generateTexteResultat } = require('../services/generateTexteResultat');
    const url   = await generateResultat({ matches, zoneOverrides });
    const texte = generateTexteResultat(matches);
    const base  = `http://localhost:${process.env.PORT || 3001}`;
    res.json({ success: true, url, full_url: base + url, texte });
  } catch (err) {
    console.error('[generate-resultat-weekend]', err.message);
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
