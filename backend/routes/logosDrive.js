/**
 * Logos des clubs synchronisés depuis Google Drive (services/driveLogos.js)
 *
 *   POST /api/logos/sync/preview          aperçu, rien n'est écrit
 *   POST /api/logos/sync                  synchronisation
 *        corps (les deux) : { choix: { folder_id: club_id | 'ignorer' },
 *                             variantes: { drive_file_id: variante | 'ignorer' },
 *                             folder_ids?: [...] }
 *   GET  /api/logos/drive/dossiers        dossiers Drive (menu d'association)
 *   GET  /api/logos/variante-active       réglage global (classique | octobre_rose)
 *   PUT  /api/logos/variante-active       { variante }
 *   GET  /api/clubs/:id/logos             fiche club : dossier lié, logos, fichiers Drive
 *   PUT  /api/clubs/:id/drive-folder      { folder_id | null } association manuelle
 *   PUT  /api/club-logos/:id              { variante } correction d'une variante
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const {
  planifier, synchroniser, associerDossier, corrigerVariante, logosDuClub, dossiersDrive, ErreurDrive,
} = require('../services/driveLogos');
const { getVarianteActive, invaliderVarianteActive, VARIANTES_ACTIVES } = require('../utils/logoClub');
const { invaliderCache: invaliderCacheAccueil } = require('../services/accueilPublic');

const erreur = (res, err) => {
  if (!(err instanceof ErreurDrive)) console.error('[logosDrive]', err);
  res.status(err.status || 500).json({ error: err.message });
};

const lireOptions = (body = {}) => ({
  choix:     body.choix && typeof body.choix === 'object' ? body.choix : {},
  variantes: body.variantes && typeof body.variantes === 'object' ? body.variantes : {},
  folderIds: Array.isArray(body.folder_ids) ? body.folder_ids.map(String) : null,
});

router.post('/logos/sync/preview', async (req, res) => {
  try {
    res.json(await planifier(lireOptions(req.body)));
  } catch (err) { erreur(res, err); }
});

router.post('/logos/sync', async (req, res) => {
  try {
    const bilan = await synchroniser(lireOptions(req.body));
    invaliderCacheAccueil();
    res.json({ success: true, ...bilan });
  } catch (err) { erreur(res, err); }
});

router.get('/logos/drive/dossiers', async (req, res) => {
  try {
    res.json(await dossiersDrive());
  } catch (err) { erreur(res, err); }
});

router.get('/logos/variante-active', async (req, res) => {
  try {
    res.json({ variante: await getVarianteActive(), choix: VARIANTES_ACTIVES });
  } catch (err) { erreur(res, err); }
});

router.put('/logos/variante-active', async (req, res) => {
  try {
    const { variante } = req.body || {};
    if (!VARIANTES_ACTIVES.includes(variante)) {
      return res.status(400).json({ error: `variante : ${VARIANTES_ACTIVES.join(' ou ')}` });
    }
    await pool.query(
      `INSERT INTO reglages (cle, valeur, updated_at) VALUES ('variante_logo_active', $1, NOW())
       ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur, updated_at = NOW()`, [variante]);
    invaliderVarianteActive();
    invaliderCacheAccueil();
    res.json({ variante });
  } catch (err) { erreur(res, err); }
});

router.get('/clubs/:id/logos', async (req, res) => {
  try {
    res.json(await logosDuClub(Number(req.params.id)));
  } catch (err) { erreur(res, err); }
});

router.put('/clubs/:id/drive-folder', async (req, res) => {
  try {
    const folderId = req.body?.folder_id ? String(req.body.folder_id) : null;
    const r = await associerDossier(Number(req.params.id), folderId);
    invaliderCacheAccueil();
    res.json({ success: true, ...r });
  } catch (err) { erreur(res, err); }
});

router.put('/club-logos/:id', async (req, res) => {
  try {
    const r = await corrigerVariante(Number(req.params.id), req.body?.variante);
    invaliderCacheAccueil();
    res.json({ success: true, ...r });
  } catch (err) { erreur(res, err); }
});

module.exports = router;
