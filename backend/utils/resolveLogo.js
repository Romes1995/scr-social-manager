/**
 * Résolution des logos avec prise en compte des logos temporaires
 * (Octobre Rose, Movember, maillot spécial…) — table logos_temporaires.
 *
 * Règle : un logo temporaire actif dont la période [date_debut, date_fin]
 * contient la date DU MATCH remplace le logo par défaut. Si plusieurs se
 * chevauchent, le plus récent (created_at) l'emporte.
 *
 * club_id NULL en base = SCR. Un logo posé sur un club s'applique à toutes
 * ses équipes (même nom de club), comme les logos par défaut.
 *
 * Fonctions exportées :
 *   resolveLogo(clubId, dateMatch, { mono })              → chemin absolu ou null
 *   resolveLogoAdversaire(adversaire, dateMatch, défaut)   → chemin absolu ou défaut
 *   findTemporaryLogo(clubId, dateMatch)                   → chemin absolu ou null
 */

const path = require('path');
const fs   = require('fs');
const pool = require('../db');

const LOGOS_DIR     = path.join(process.cwd(), 'uploads', 'logos');
const LOGO_SCR      = path.join(LOGOS_DIR, 'scr.png');
const LOGO_SCR_MONO = path.join(LOGOS_DIR, 'scr_monochrome.png');

// Même normalisation que imageGenerator : "AS Gambsheim 2" → "as gambsheim"
function normalizeClubName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+\d+$/, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// '/uploads/logos/x.png' → chemin absolu (null si fichier absent)
function urlToPath(url) {
  if (!url || !url.startsWith('/uploads/')) return null;
  const p = path.join(process.cwd(), url);
  return fs.existsSync(p) ? p : null;
}

// Date du match → 'YYYY-MM-DD' (null si absente/illisible → pas de logo temporaire)
function toIsoDate(d) {
  if (!d) return null;
  if (d instanceof Date) {
    if (isNaN(d)) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const m = String(d).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function isScr(clubId) {
  return clubId === null || clubId === undefined || String(clubId).toUpperCase() === 'SCR';
}

/**
 * Logo temporaire applicable à un club (ou au SCR) à une date donnée.
 */
async function findTemporaryLogo(clubId, dateMatch) {
  const date = toIsoDate(dateMatch);
  if (!date) return null;
  try {
    const r = isScr(clubId)
      ? await pool.query(
          `SELECT fichier FROM logos_temporaires
           WHERE club_id IS NULL AND actif = true
             AND date_debut <= $1::date AND date_fin >= $1::date
           ORDER BY created_at DESC, id DESC LIMIT 1`,
          [date]
        )
      : await pool.query(
          `SELECT lt.fichier FROM logos_temporaires lt
           JOIN clubs c  ON c.id = lt.club_id
           JOIN clubs me ON LOWER(TRIM(me.nom)) = LOWER(TRIM(c.nom))
           WHERE me.id = $2 AND lt.actif = true
             AND lt.date_debut <= $1::date AND lt.date_fin >= $1::date
           ORDER BY lt.created_at DESC, lt.id DESC LIMIT 1`,
          [date, clubId]
        );
    return urlToPath(r.rows[0]?.fichier);
  } catch (err) {
    console.warn('[resolveLogo] erreur logo temporaire :', err.message);
    return null;
  }
}

/**
 * Logo à utiliser pour un club (ou le SCR si clubId = null / 'SCR') à la date du match.
 * mono=true : logo monochrome par défaut en priorité (Score Live), puis couleur.
 */
async function resolveLogo(clubId, dateMatch, { mono = false } = {}) {
  const temp = await findTemporaryLogo(clubId, dateMatch);
  if (temp) return temp;

  if (isScr(clubId)) {
    if (mono && fs.existsSync(LOGO_SCR_MONO)) return LOGO_SCR_MONO;
    return fs.existsSync(LOGO_SCR) ? LOGO_SCR : null;
  }

  try {
    const r = await pool.query('SELECT logo_url, logo_monochrome_url FROM clubs WHERE id=$1', [clubId]);
    const row = r.rows[0];
    if (!row) return null;
    return (mono && urlToPath(row.logo_monochrome_url)) || urlToPath(row.logo_url);
  } catch { return null; }
}

/**
 * Pour les générateurs, qui ne connaissent l'adversaire que par son nom :
 * logo temporaire du club correspondant (nom ou équipe normalisés) si actif à
 * la date du match, sinon `defaultPath` inchangé (= rendu identique à avant).
 */
async function resolveLogoAdversaire(adversaire, dateMatch, defaultPath = null) {
  const date = toIsoDate(dateMatch);
  const key  = normalizeClubName(adversaire);
  if (!date || !key) return defaultPath;
  try {
    // Court-circuit : aucun logo temporaire adversaire actif à cette date
    const r = await pool.query(
      `SELECT 1 FROM logos_temporaires
       WHERE club_id IS NOT NULL AND actif = true
         AND date_debut <= $1::date AND date_fin >= $1::date
       LIMIT 1`,
      [date]
    );
    if (r.rows.length === 0) return defaultPath;

    // Filtrage par nom normalisé côté JS (même règle que loadClubLogosFromDB)
    const clubs = await pool.query('SELECT id, nom, equipe FROM clubs');
    const ids = new Set(
      clubs.rows
        .filter(c => normalizeClubName(c.nom) === key || (c.equipe && normalizeClubName(c.equipe) === key))
        .map(c => c.id)
    );
    if (ids.size === 0) return defaultPath;

    const r2 = await pool.query(
      `SELECT lt.fichier FROM logos_temporaires lt
       JOIN clubs c  ON c.id = lt.club_id
       JOIN clubs me ON LOWER(TRIM(me.nom)) = LOWER(TRIM(c.nom))
       WHERE me.id = ANY($2::int[]) AND lt.actif = true
         AND lt.date_debut <= $1::date AND lt.date_fin >= $1::date
       ORDER BY lt.created_at DESC, lt.id DESC LIMIT 1`,
      [date, [...ids]]
    );
    const temp = urlToPath(r2.rows[0]?.fichier);
    if (temp) console.log(`[resolveLogo] logo temporaire pour "${adversaire}" (${date}) → ${temp}`);
    return temp || defaultPath;
  } catch (err) {
    console.warn('[resolveLogo] erreur logo temporaire adversaire :', err.message);
    return defaultPath;
  }
}

module.exports = { resolveLogo, resolveLogoAdversaire, findTemporaryLogo, normalizeClubName };
