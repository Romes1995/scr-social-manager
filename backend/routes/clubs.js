const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const pool    = require('../db');
const { invaliderCache: invaliderCacheAccueil } = require('../services/accueilPublic');
const { saisonCourante } = require('../services/fffClassement');
const { nomClub } = require('../services/clubsFff');
const { genererMini } = require('../utils/logoMini');

// Miniature 64 px pour la vitrine, sans bloquer la réponse
const miniatureEnFond = (url) =>
  genererMini(url).catch(err => console.error(`[logoMini] ${url} :`, err.message));

const LONGUEUR_MAX = { nom_affiche: 100, nom_court: 40 };

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
// Sans paramètre : toutes les lignes (panneau « Clubs adversaires » de Listes).
// ?saison=1 : clubs rattachés à la FFF (fff_cl_no) rencontrés cette saison, avec les
//   équipes SCR qui les rencontrent ; ceux sans nom d'affichage en premier.
// ?sans_nom_affiche=1 : (avec saison) uniquement les clubs sans nom d'affichage.
router.get('/', async (req, res) => {
  try {
    if (req.query.saison !== '1') {
      const result = await pool.query('SELECT * FROM clubs ORDER BY nom ASC');
      return res.json(result.rows);
    }

    const saison = saisonCourante();
    const [debut, fin] = [`${saison}-07-01`, `${saison + 1}-06-30`];
    const result = await pool.query(
      `WITH rencontres AS (
         SELECT adversaire_cl_no AS cl_no, equipe AS equipe_scr, adversaire_equipe_no AS equipe_no
           FROM matches
          WHERE adversaire_cl_no IS NOT NULL AND date BETWEEN $1 AND $2
         UNION
         SELECT club_cl_no, equipe, club_equipe_no
           FROM classements
          WHERE saison = $3 AND NOT is_scr
       )
       SELECT c.id, c.nom, c.fff_cl_no, c.nom_fff, c.nom_affiche, c.nom_court,
              c.logo_url, c.logo_monochrome_url,
              (SELECT m.logo_adversaire FROM matches m
                WHERE m.adversaire_cl_no = c.fff_cl_no AND m.logo_adversaire IS NOT NULL
                ORDER BY m.date DESC LIMIT 1) AS logo_fff,
              ARRAY_AGG(DISTINCT r.equipe_scr ORDER BY r.equipe_scr) AS equipes_scr,
              ARRAY_AGG(DISTINCT r.equipe_no ORDER BY r.equipe_no)
                FILTER (WHERE r.equipe_no IS NOT NULL)            AS equipes_no
         FROM clubs c
         JOIN rencontres r ON r.cl_no = c.fff_cl_no
        WHERE ($4::boolean IS NOT TRUE OR c.nom_affiche IS NULL)
        GROUP BY c.id
        ORDER BY (c.nom_affiche IS NOT NULL), COALESCE(c.nom_fff, c.nom)`,
      [debut, fin, saison, req.query.sans_nom_affiche === '1']
    );
    res.json(result.rows.map(c => ({ ...c, nom_site: nomClub(c, 1) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/clubs/scr-logo — Upload logo SCR (fixe) ───────────────────────
router.post('/scr-logo', uploadScr.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier logo requis' });
  miniatureEnFond('/uploads/logos/scr.png');
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
          miniatureEnFond(url);
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
    miniatureEnFond(logoUrl);

    const updated = await pool.query('SELECT * FROM clubs WHERE id=$1', [req.params.id]);
    res.json({ success: true, club: updated.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/clubs/:id ───────────────────────────────────────────────────────
// Mise à jour partielle : seuls les champs présents dans le corps sont modifiés.
// nom_affiche / nom_court : chaîne vide → NULL (retour au nom FFF).
// fff_cl_no et nom_fff ne sont pas modifiables (tenus par l'import FFF).
router.put('/:id', async (req, res) => {
  try {
    const body   = req.body || {};
    const sets   = [];
    const params = [];
    const set = (col, val) => { params.push(val); sets.push(`${col}=$${params.length}`); };

    if ('nom' in body) {
      if (!body.nom || !String(body.nom).trim()) return res.status(400).json({ error: 'nom est requis' });
      set('nom', String(body.nom).trim());
    }
    for (const col of ['logo_url', 'logo_monochrome_url', 'equipe']) {
      if (col in body) set(col, body[col] || null);
    }
    for (const col of ['nom_affiche', 'nom_court']) {
      if (!(col in body)) continue;
      if (body[col] != null && typeof body[col] !== 'string') {
        return res.status(400).json({ error: `${col} doit être une chaîne` });
      }
      const val = (body[col] || '').trim().replace(/\s+/g, ' ') || null;
      if (val && val.length > LONGUEUR_MAX[col]) {
        return res.status(400).json({ error: `${col} : ${LONGUEUR_MAX[col]} caractères maximum` });
      }
      set(col, val);
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Aucun champ à modifier' });

    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE clubs SET ${sets.join(', ')} WHERE id=$${params.length} RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Club non trouvé' });

    if (body.logo_url) miniatureEnFond(body.logo_url);
    // Noms et logos affichés sur le site public : l'accueil est recalculé
    invaliderCacheAccueil();
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
