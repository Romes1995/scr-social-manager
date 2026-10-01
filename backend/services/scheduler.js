/**
 * Tâches planifiées FFF (node-cron, heures Europe/Paris)
 *
 * Chaque créneau lance importFFF() puis refreshClassements() (tâche « synchro_fff »),
 * après un décalage aléatoire de 0 à 10 min pour ne pas solliciter la FFF à heure fixe.
 *
 *  - Verrou : une seule tâche FFF à la fois (planifiée, rattrapage ou manuelle) ;
 *    un déclenchement pendant une exécution est ignoré et journalisé.
 *  - Rattrapage : 60 s après le démarrage, si le dernier import réussi a plus de 24 h.
 *  - Journal : table taches_log, purgée au-delà de 90 jours par l'import nocturne.
 *  - CRON_ENABLED=false : ni planning ni rattrapage (les routes manuelles restent actives).
 *
 * ⚠️ Un seul processus doit faire tourner le scheduler (PM2 : instances 1, mode fork),
 * sinon les tâches s'exécutent en double : le verrou est en mémoire, pas en base.
 */

const cron = require('node-cron');
const pool = require('../db');
const { importFFF } = require('./fffImport');
const { refreshClassements } = require('./fffClassement');
const { invaliderCache: invaliderCacheAccueil } = require('./accueilPublic');

const TZ                   = 'Europe/Paris';
const DECALAGE_MAX_MS      = 10 * 60 * 1000;
const RATTRAPAGE_APRES_MS  = 60 * 1000;
const RATTRAPAGE_SEUIL_H   = 24;
const RETENTION_JOURS      = 90;

// Créneaux : import nocturne + fenêtre de publication des résultats FFF
const CRENEAUX = [
  { nom: 'Import nocturne (tous les jours 3 h 30)', cron: '30 3 * * *', nocturne: true },
  { nom: 'Résultats sam. 19 h 30',                  cron: '30 19 * * 6' },
  { nom: 'Résultats sam. et dim. 22 h',             cron: '0 22 * * 0,6' },
  { nom: 'Résultats dim. 13 h',                     cron: '0 13 * * 0' },
  { nom: 'Résultats dim. 18 h 30',                  cron: '30 18 * * 0' },
  { nom: 'Résultats dim. 20 h',                     cron: '0 20 * * 0' },
  { nom: 'Résultats lun. 8 h, 12 h et 18 h',        cron: '0 8,12,18 * * 1' },
  { nom: 'Résultats mar. et mer. 8 h',              cron: '0 8 * * 2,3' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function cronActive() {
  const v = String(process.env.CRON_ENABLED ?? 'true').trim().toLowerCase();
  return !['false', '0', 'no', 'non', 'off'].includes(v);
}

const formatParis = (date) => new Intl.DateTimeFormat('fr-FR', {
  timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit',
  hour: '2-digit', minute: '2-digit',
}).format(date);

const formatDuree = (ms) => `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`;

class TacheEnCoursError extends Error {
  constructor(enCours) {
    super(`Tâche « ${enCours.tache} » (${enCours.declencheur}) déjà en cours depuis ${enCours.debut.toISOString()}`);
    this.statusCode = 409;
  }
}

// ── Verrou et journalisation ──────────────────────────────────────────────────

let enCours = null;   // { tache, declencheur, debut }

const etat = () => (enCours ? { ...enCours } : null);

/**
 * Exécute `fn` sous verrou et la journalise dans taches_log.
 * `fn` renvoie { result, resume, succes, erreur }. Retourne `result`.
 * Lève TacheEnCoursError si une tâche tourne déjà ; relance l'erreur de `fn`.
 */
async function executerTache(tache, declencheur, fn, contexte = {}) {
  if (enCours) {
    const err = new TacheEnCoursError(enCours);
    console.warn(`[Scheduler] ⏭️  ${tache} (${declencheur}) ignorée : ${err.message}`);
    await pool.query(
      `INSERT INTO taches_log (tache, declencheur, fin, succes, resume, erreur)
       VALUES ($1, $2, NOW(), false, $3, $4)`,
      [tache, declencheur, contexte, `Ignorée : ${err.message}`]
    ).catch(e => console.error('[Scheduler] journalisation impossible :', e.message));
    throw err;
  }

  enCours = { tache, declencheur, debut: new Date() };
  const { rows } = await pool.query(
    'INSERT INTO taches_log (tache, declencheur, resume) VALUES ($1, $2, $3) RETURNING id',
    [tache, declencheur, contexte]
  ).catch(err => { enCours = null; throw err; });
  const id = rows[0].id;
  console.log(`[Scheduler] ▶️  ${tache} (${declencheur}) démarrée [taches_log #${id}]`);

  try {
    const { result, resume, succes, erreur = null } = await fn();
    await pool.query(
      'UPDATE taches_log SET fin = NOW(), succes = $1, resume = $2, erreur = $3 WHERE id = $4',
      [succes, { ...contexte, ...resume }, erreur, id]
    );
    console.log(`[Scheduler] ${succes ? '✅' : '⚠️ '} ${tache} (${declencheur}) terminée [#${id}]`);
    return result;
  } catch (err) {
    await pool.query(
      'UPDATE taches_log SET fin = NOW(), succes = false, erreur = $1 WHERE id = $2',
      [err.message, id]
    ).catch(e => console.error('[Scheduler] journalisation impossible :', e.message));
    console.error(`[Scheduler] ❌ ${tache} (${declencheur}) en échec [#${id}] :`, err.message);
    throw err;
  } finally {
    enCours = null;
    // Données FFF potentiellement modifiées : la page d'accueil publique est recalculée
    invaliderCacheAccueil();
  }
}

// ── Résumés ───────────────────────────────────────────────────────────────────

const resumeImport = (report) => ({
  ok:             true,
  crees:          report.created.length,
  mis_a_jour:     report.updated.length,
  scores_changes: report.scoreChanges.filter(s => s.modifie).length,
  scores_fff:     report.scoreChanges.length,
  ambigus:        report.ambiguous.length,
  erreurs:        report.errors.length,
});

const resumeClassements = (result) => {
  const ok = [];
  const ko = {};
  for (const [equipe, e] of Object.entries(result.equipes)) {
    if (e.ok) ok.push(equipe); else ko[equipe] = e.erreur;
  }
  return { saison: result.saison, ok, ko };
};

const importReussi     = (r) => r.ok && r.erreurs === 0 && r.ambigus === 0;
const classementsReussi = (r) => r.ok.length > 0 && Object.keys(r.ko).length === 0;

// ── Tâches ────────────────────────────────────────────────────────────────────

// Import manuel (POST /api/fff/save) : renvoie le rapport complet d'importFFF()
function lancerImport(declencheur = 'manuel') {
  return executerTache('import_fff', declencheur, async () => {
    const report = await importFFF();
    const r = resumeImport(report);
    return { result: report, resume: { import: r }, succes: importReussi(r) };
  });
}

// Classements manuels (POST /api/fff/refresh-classement)
function lancerClassements(declencheur = 'manuel') {
  return executerTache('classements', declencheur, async () => {
    const result = await refreshClassements();
    const r = resumeClassements(result);
    return { result, resume: { classements: r }, succes: classementsReussi(r) };
  });
}

// Import puis classements ; les classements sont rafraîchis même si l'import échoue
function lancerSynchro(declencheur, contexte = {}) {
  return executerTache('synchro_fff', declencheur, async () => {
    let imp;
    try {
      imp = resumeImport(await importFFF());
    } catch (err) {
      imp = { ok: false, erreur: err.response?.status ? `HTTP ${err.response.status} : ${err.message}` : err.message };
    }
    const cls = resumeClassements(await refreshClassements());

    const succes = importReussi(imp) && classementsReussi(cls);
    const erreurs = [
      imp.ok ? null : `import : ${imp.erreur}`,
      ...Object.entries(cls.ko).map(([e, msg]) => `classement ${e} : ${msg}`),
    ].filter(Boolean);

    return {
      result: { import: imp, classements: cls },
      resume: { import: imp, classements: cls },
      succes,
      erreur: erreurs.length ? erreurs.join(' ; ') : null,
    };
  }, contexte);
}

async function purgerJournal() {
  const { rowCount } = await pool.query(
    `DELETE FROM taches_log WHERE debut < NOW() - make_interval(days => $1)`, [RETENTION_JOURS]);
  if (rowCount) console.log(`[Scheduler] 🧹 ${rowCount} ligne(s) de taches_log de plus de ${RETENTION_JOURS} jours supprimée(s)`);
  return rowCount;
}

// Date du dernier import réussi (synchro ou import manuel), ou null
async function dernierImportReussi() {
  const { rows } = await pool.query(
    `SELECT MAX(debut) AS debut FROM taches_log
      WHERE tache IN ('synchro_fff', 'import_fff')
        AND resume -> 'import' ->> 'ok' = 'true'`
  );
  return rows[0].debut;
}

async function rattrapage() {
  const dernier = await dernierImportReussi();
  const ageH = dernier ? (Date.now() - new Date(dernier).getTime()) / 3600000 : null;

  if (dernier && ageH < RATTRAPAGE_SEUIL_H) {
    console.log(`[Scheduler] Rattrapage inutile : dernier import réussi il y a ${ageH.toFixed(1)} h`);
    return false;
  }
  console.log(`[Scheduler] 🔁 Rattrapage : ${dernier ? `dernier import réussi il y a ${ageH.toFixed(1)} h` : 'aucun import réussi en base'}`);
  await lancerSynchro('rattrapage', { motif: dernier ? `dernier import il y a ${ageH.toFixed(1)} h` : 'aucun import' });
  return true;
}

// ── Planification ─────────────────────────────────────────────────────────────

let taches   = [];
let minuteurs = new Set();

function declencher(creneau) {
  const decalage = Math.floor(Math.random() * DECALAGE_MAX_MS);
  console.log(`[Scheduler] ⏰ ${creneau.nom} → exécution dans ${formatDuree(decalage)}`);

  const t = setTimeout(async () => {
    minuteurs.delete(t);
    try {
      if (creneau.nocturne) await purgerJournal();
      await lancerSynchro('planifie', { creneau: creneau.nom, decalage_s: Math.round(decalage / 1000) });
    } catch (err) {
      if (!(err instanceof TacheEnCoursError)) console.error(`[Scheduler] ${creneau.nom} :`, err.message);
    }
  }, decalage);
  minuteurs.add(t);
}

function start({ rattrapageApresMs = RATTRAPAGE_APRES_MS } = {}) {
  if (!cronActive()) {
    console.log('[Scheduler] ⏸️  Tâches planifiées désactivées (CRON_ENABLED=false) : ni planning ni rattrapage');
    return false;
  }

  taches = CRENEAUX.map(c => cron.schedule(c.cron, () => declencher(c), { timezone: TZ, name: c.nom }));

  console.log(`[Scheduler] 📅 Planning des tâches FFF (${TZ}, décalage aléatoire 0-10 min, import puis classements) :`);
  CRENEAUX.forEach((c, i) => {
    console.log(`[Scheduler]    ${c.nom.padEnd(42)} ${c.cron.padEnd(16)} prochaine : ${formatParis(taches[i].getNextRun())}`);
  });
  console.log(`[Scheduler]    Rattrapage dans ${rattrapageApresMs / 1000} s si le dernier import réussi a plus de ${RATTRAPAGE_SEUIL_H} h`);

  const t = setTimeout(() => {
    minuteurs.delete(t);
    rattrapage().catch(err => {
      if (!(err instanceof TacheEnCoursError)) console.error('[Scheduler] Rattrapage :', err.message);
    });
  }, rattrapageApresMs);
  minuteurs.add(t);

  return true;
}

function stop() {
  taches.forEach(t => t.destroy());
  taches = [];
  minuteurs.forEach(clearTimeout);
  minuteurs = new Set();
}

module.exports = {
  start, stop, etat, cronActive,
  lancerImport, lancerClassements, lancerSynchro, rattrapage, purgerJournal, dernierImportReussi,
  TacheEnCoursError, CRENEAUX,
};
