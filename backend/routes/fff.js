const express = require('express');
const router = express.Router();
const { importFFF } = require('../services/fffImport');

// Traduit une erreur d'appel DOFA en réponse HTTP explicite
function sendDofaError(res, err, contexte) {
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
    const msg = 'Impossible de joindre l\'API FFF (api-dofa.fff.fr)';
    console.error(`[${contexte}]`, msg, err.message);
    return res.status(503).json({ error: msg, detail: err.message });
  }
  const status = err.response?.status;
  if (status === 403) {
    const msg = 'L\'API FFF (api-dofa.fff.fr) a bloqué la requête (403, protection anti-bot Akamai) même après une nouvelle tentative. Réessayez dans quelques minutes.';
    console.error(`[${contexte}]`, msg);
    return res.status(502).json({ error: msg });
  }
  if (status >= 500) {
    const msg = `L\'API FFF (api-dofa.fff.fr) est indisponible (HTTP ${status}) même après une nouvelle tentative. Réessayez plus tard.`;
    console.error(`[${contexte}]`, msg);
    return res.status(502).json({ error: msg });
  }
  console.error(`[${contexte}] Erreur inattendue :`, err.message);
  res.status(500).json({ error: 'Erreur lors de l\'import FFF', detail: err.message });
}

// GET /api/fff/import — aperçu à blanc (aucune écriture en base)
router.get('/import', async (req, res) => {
  try {
    const report = await importFFF({ dryRun: true });
    const matchs = report.matchs;

    const parEquipe = {};
    for (const m of matchs) parEquipe[m.equipe] = (parEquipe[m.equipe] || 0) + 1;

    res.json({
      success: true,
      matchs,
      count:   matchs.length,
      joues:   matchs.filter(m => m.statut === 'termine').length,
      a_venir: matchs.filter(m => m.statut === 'programme').length,
      par_equipe: parEquipe,
      source: 'api-dofa.fff.fr',
      apercu: {
        a_creer:        report.created,
        a_mettre_a_jour: report.updated.length,
        scores_fff:     report.scoreChanges,
        ambigus:        report.ambiguous,
        ignores:        report.skipped,
        erreurs:        report.errors,
      },
    });
  } catch (err) {
    sendDofaError(res, err, 'FFF Import');
  }
});

// POST /api/fff/save — import réel depuis DOFA (le corps de la requête est ignoré :
// les données sont toujours relues à la source)
router.post('/save', async (req, res) => {
  try {
    const report = await importFFF();
    res.json({
      success: true,
      saved:   report.created.length,
      updated: report.updated.length,
      errors:  report.errors,
      created:      report.created,
      scoreChanges: report.scoreChanges,
      ambiguous:    report.ambiguous,
      skipped:      report.skipped,
    });
  } catch (err) {
    sendDofaError(res, err, 'FFF Save');
  }
});

// GET /api/fff/refresh-classement — vide le cache FFF et force un nouveau scraping
router.get('/refresh-classement', async (req, res) => {
  try {
    const { getClassementFFF, clearCache } = require('../services/fffClassementScraper');
    clearCache();
    const data = await getClassementFFF({ forceRefresh: true });
    const summary = {};
    for (const [team, val] of Object.entries(data)) {
      summary[team] = val
        ? { rows: val.rows.length, scrRow: val.rows.find(r => r.isSCR) ?? null, source: 'fff_scraper' }
        : { rows: 0, source: 'failed' };
    }
    res.json({ success: true, summary });
  } catch (err) {
    console.error('[refresh-classement]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
