/**
 * Logo d'un club adverse — point d'entrée unique des générateurs de visuels.
 *
 * Les logos synchronisés depuis Google Drive (table club_logos) COMPLÈTENT les
 * logos déjà en place, sans jamais les remplacer :
 *
 *   classique     clubs.logo_url → club_logos classique
 *   monochrome    clubs.logo_monochrome_url → club_logos monochrome → classique
 *   octobre_rose  club_logos octobre_rose → classique
 *
 * Comme les logos existants, un logo vaut pour toutes les équipes du club (même nom).
 * Les logos temporaires (logos_temporaires, utils/resolveLogo.js) restent prioritaires :
 * les générateurs passent le résultat de getLogoAdversaire() à resolveLogoAdversaire().
 * Le logo SCR n'est pas concerné (resolveLogo('SCR')).
 *
 *   getVarianteActive()                         → 'classique' | 'octobre_rose' (réglage global)
 *   getLogoClub(clubId, variante, { url })      → chemin absolu (ou URL /uploads/… si url) ou null
 *   clubIdAdversaire({ adversaire, adversaire_cl_no }) → id du club ou null
 *   getLogoAdversaire(match, { mono, url })     → logo de l'adversaire d'un match, variante active
 */

const path = require('path');
const fs   = require('fs');
const pool = require('../db');
const { normalizeClubName } = require('./resolveLogo');

const VARIANTES = ['classique', 'octobre_rose', 'monochrome'];
const VARIANTES_ACTIVES = ['classique', 'octobre_rose'];

// '/uploads/logos/x.png' → chemin absolu (null si fichier absent)
function urlToPath(url) {
  if (!url || !url.startsWith('/uploads/')) return null;
  const p = path.join(process.cwd(), url);
  return fs.existsSync(p) ? p : null;
}

// ── Réglage global ────────────────────────────────────────────────────────────

let cacheVariante = { valeur: null, lu: 0 };

async function getVarianteActive() {
  if (cacheVariante.valeur && Date.now() - cacheVariante.lu < 10_000) return cacheVariante.valeur;
  try {
    const { rows } = await pool.query("SELECT valeur FROM reglages WHERE cle = 'variante_logo_active'");
    const v = VARIANTES_ACTIVES.includes(rows[0]?.valeur) ? rows[0].valeur : 'classique';
    cacheVariante = { valeur: v, lu: Date.now() };
    return v;
  } catch (err) {
    console.warn('[logoClub] réglage variante_logo_active illisible :', err.message);
    return 'classique';
  }
}

function invaliderVarianteActive() {
  cacheVariante = { valeur: null, lu: 0 };
}

// ── Logo d'un club ────────────────────────────────────────────────────────────

/**
 * Logo d'un club pour une variante, avec les replis décrits en tête de fichier.
 * url = true : renvoie le chemin public (/uploads/…) au lieu du chemin absolu.
 */
async function getLogoClub(clubId, variante = 'classique', { url = false } = {}) {
  if (clubId == null) return null;
  if (!VARIANTES.includes(variante)) variante = 'classique';
  try {
    const { rows } = await pool.query(
      `SELECT c.logo_url, c.logo_monochrome_url, l.variante, l.fichier_local
         FROM clubs me
         JOIN clubs c ON LOWER(TRIM(c.nom)) = LOWER(TRIM(me.nom))
         LEFT JOIN club_logos l ON l.club_id = c.id
        WHERE me.id = $1
        ORDER BY (c.id = me.id) DESC, c.id`,
      [clubId]
    );
    if (rows.length === 0) return null;

    const premier = (fn) => rows.map(fn).find(u => u && urlToPath(u)) || null;
    const ancien  = (col) => premier(r => r[col]);
    const drive   = (v) => premier(r => (r.variante === v ? r.fichier_local : null));

    const classique = () => ancien('logo_url') || drive('classique');
    const trouve = variante === 'monochrome'
      ? ancien('logo_monochrome_url') || drive('monochrome') || classique()
      : variante === 'octobre_rose'
        ? drive('octobre_rose') || classique()
        : classique();

    if (!trouve) return null;
    return url ? trouve : urlToPath(trouve);
  } catch (err) {
    console.warn(`[logoClub] club ${clubId} :`, err.message);
    return null;
  }
}

// ── Club adverse d'un match ───────────────────────────────────────────────────

/**
 * Club d'un adversaire : par cl_no FFF (club rattaché ou alias de fusion), sinon
 * par nom (nom, équipe, nom FFF ou nom d'affichage, sans numéro d'équipe), sinon
 * par alias de fusion.
 */
async function clubIdAdversaire({ adversaire, adversaire_cl_no } = {}) {
  try {
    if (Number.isInteger(adversaire_cl_no)) {
      const { rows } = await pool.query(
        `SELECT COALESCE(
           (SELECT id FROM clubs WHERE fff_cl_no = $1),
           (SELECT club_id FROM club_aliases WHERE fff_cl_no = $1)) AS id`,
        [adversaire_cl_no]);
      if (rows[0]?.id) return rows[0].id;
    }

    const cle = normalizeClubName(adversaire);
    if (!cle) return null;
    const { rows: clubs } = await pool.query(
      'SELECT id, nom, equipe, nom_fff, nom_affiche FROM clubs ORDER BY id');
    const parNom = clubs.find(c => [c.nom, c.equipe, c.nom_fff, c.nom_affiche]
      .some(n => n && normalizeClubName(n) === cle));
    if (parNom) return parNom.id;

    const { rows: aliases } = await pool.query('SELECT club_id, alias FROM club_aliases ORDER BY id');
    return aliases.find(a => normalizeClubName(a.alias) === cle)?.club_id ?? null;
  } catch (err) {
    console.warn(`[logoClub] adversaire « ${adversaire} » :`, err.message);
    return null;
  }
}

/**
 * Logo de l'adversaire d'un match, dans la variante active (mono = true : monochrome).
 */
async function getLogoAdversaire(match, { mono = false, url = false } = {}) {
  const clubId = await clubIdAdversaire(match || {});
  if (!clubId) return null;
  const variante = mono ? 'monochrome' : await getVarianteActive();
  return getLogoClub(clubId, variante, { url });
}

module.exports = {
  getLogoClub, getLogoAdversaire, clubIdAdversaire,
  getVarianteActive, invaliderVarianteActive,
  VARIANTES, VARIANTES_ACTIVES,
};
