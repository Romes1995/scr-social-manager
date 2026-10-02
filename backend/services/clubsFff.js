/**
 * Clubs adverses : rattachement à l'identifiant FFF (cl_no) et noms d'affichage
 *
 * assurerClub()  : appelé par l'import FFF et par refreshClassements() pour chaque
 *   club rencontré. Rattache une ligne clubs existante ou en crée une. Ne modifie
 *   jamais nom, nom_affiche, nom_court ni les logos ; tient nom_fff à jour.
 * nomClub()      : nom affiché sur le site (nom d'affichage, sinon nom FFF),
 *   suivi du numéro d'équipe s'il est supérieur à 1.
 *
 * Logos : reliés par cl_no en priorité, par nom en secours (lignes non rattachées),
 * puis logo FFF du match (voir SQL_LOGO_ADVERSAIRE).
 */

const pool = require('../db');
const { normalizeName, SCR_CL_NO } = require('./fffImport');

// ── Noms ──────────────────────────────────────────────────────────────────────

/**
 * club : { nom_affiche, nom_court, nom_fff, nom } (champs absents tolérés)
 * "Rountzenheim-Auenhei" + nom_affiche "Rountzenheim-Auenheim", équipe 2
 *   → "Rountzenheim-Auenheim 2"
 */
function nomClub(club, equipeNo, { court = false } = {}) {
  const c = club || {};
  const base = (court ? (c.nom_court || c.nom_affiche) : c.nom_affiche) || c.nom_fff || c.nom || '';
  const n = parseInt(equipeNo, 10);
  if (!(n > 1) || base.endsWith(` ${n}`)) return base;
  return `${base} ${n}`;
}

// Nom normalisé sans numéro d'équipe final : "Weitbruch Fc 3" → "weitbruch fc"
const nomDeBase = (s) => normalizeName(s).replace(/\s+\d+$/, '');

// ── Rattachement ──────────────────────────────────────────────────────────────

/**
 * Retourne { id, action } avec action :
 *   'deja'      ligne déjà rattachée à ce cl_no (nom_fff mis à jour s'il a changé → 'renomme')
 *   'rattache'  ligne existante rattachée (nom FFF exact, sinon nom normalisé unique)
 *   'cree'      aucune ligne : création (nom = nom_fff)
 *   'ambigu'    plusieurs candidats : rien n'est fait (id null, candidats listés)
 *
 * nomFff : short_name FFF en Title Case (comme matches.adversaire)
 * autresNoms : variantes FFF (short_name_ligue, short_name_federation…)
 */
async function assurerClub(clNo, nomFff, { autresNoms = [], db = pool } = {}) {
  if (!Number.isInteger(clNo) || clNo === SCR_CL_NO || !nomFff) return null;

  const deja = await db.query('SELECT id, nom_fff FROM clubs WHERE fff_cl_no = $1', [clNo]);
  if (deja.rows[0]) {
    const { id, nom_fff } = deja.rows[0];
    if (nom_fff === nomFff) return { id, action: 'deja' };
    await db.query('UPDATE clubs SET nom_fff = $1 WHERE id = $2', [nomFff, id]);
    return { id, action: 'renomme', avant: nom_fff };
  }

  const { rows } = await db.query('SELECT id, nom, equipe FROM clubs WHERE fff_cl_no IS NULL');

  // 1. Nom FFF exact (règle des requêtes par nom du site : LOWER(TRIM(nom)))
  const exact = rows.filter(r => r.nom.trim().toLowerCase() === nomFff.trim().toLowerCase());
  let candidats = exact;

  // 2. À défaut, nom normalisé (sans casse, ponctuation, accents ni numéro final)
  if (exact.length === 0) {
    const cles = new Set([nomFff, ...autresNoms].map(nomDeBase));
    candidats = rows.filter(r => cles.has(nomDeBase(r.nom)) || (r.equipe && cles.has(nomDeBase(r.equipe))));
  }

  if (candidats.length > 1) {
    return { id: null, action: 'ambigu', candidats: candidats.map(r => r.id) };
  }

  if (candidats.length === 1) {
    const r = await db.query(
      `UPDATE clubs SET fff_cl_no = $1, nom_fff = $2
        WHERE id = $3 AND fff_cl_no IS NULL
        RETURNING id`,
      [clNo, nomFff, candidats[0].id]
    );
    if (r.rows[0]) return { id: r.rows[0].id, action: 'rattache', regle: exact.length ? 'exact' : 'normalise' };
  }

  // Aucune ligne (ou rattachement concurrent) : création, sans doublon grâce à l'unicité de fff_cl_no
  const cree = await db.query(
    `INSERT INTO clubs (nom, equipe, fff_cl_no, nom_fff) VALUES ($1, $1, $2, $1)
     ON CONFLICT (fff_cl_no) DO NOTHING
     RETURNING id`,
    [nomFff, clNo]
  );
  if (cree.rows[0]) return { id: cree.rows[0].id, action: 'cree' };
  const existant = await db.query('SELECT id FROM clubs WHERE fff_cl_no = $1', [clNo]);
  return { id: existant.rows[0]?.id ?? null, action: 'deja' };
}

/**
 * Applique assurerClub() à une liste de clubs [{ cl_no, nom, autresNoms }]
 * (dédoublonnée par cl_no). Une erreur sur un club n'arrête pas les autres.
 * Retourne { crees, rattaches, renommes, ambigus, erreurs }.
 */
async function assurerClubs(clubs) {
  const bilan = { crees: [], rattaches: [], renommes: [], ambigus: [], erreurs: [] };
  const vus = new Set();
  for (const c of clubs) {
    if (!Number.isInteger(c.cl_no) || vus.has(c.cl_no)) continue;
    vus.add(c.cl_no);
    try {
      const r = await assurerClub(c.cl_no, c.nom, { autresNoms: c.autresNoms || [] });
      if (!r) continue;
      const ligne = { cl_no: c.cl_no, nom_fff: c.nom, id: r.id };
      if (r.action === 'cree')     bilan.crees.push(ligne);
      if (r.action === 'rattache') bilan.rattaches.push({ ...ligne, regle: r.regle });
      if (r.action === 'renomme')  bilan.renommes.push({ ...ligne, avant: r.avant });
      if (r.action === 'ambigu') {
        bilan.ambigus.push({ ...ligne, candidats: r.candidats });
        console.warn(`[Clubs] cl_no=${c.cl_no} « ${c.nom} » ambigu (lignes ${r.candidats.join(', ')}), non rattaché`);
      }
    } catch (err) {
      bilan.erreurs.push({ cl_no: c.cl_no, nom_fff: c.nom, erreur: err.message });
      console.error(`[Clubs] cl_no=${c.cl_no} « ${c.nom} » :`, err.message);
    }
  }
  return bilan;
}

// ── SQL partagé (routes publiques) ────────────────────────────────────────────

// Jointure du club adverse d'un match `m` (alias `ca`)
const SQL_JOIN_CLUB_ADVERSAIRE = 'LEFT JOIN clubs ca ON ca.fff_cl_no = m.adversaire_cl_no';

// Logo local par nom (lignes non rattachées, matchs saisis à la main)
const sqlLogoParNom = (colNom) => `(SELECT c.logo_url FROM clubs c
    WHERE c.logo_url IS NOT NULL AND LOWER(TRIM(c.nom)) = LOWER(TRIM(${colNom}))
    LIMIT 1)`;

// Logo adverse : cl_no, puis nom, puis logo FFF du match (requiert SQL_JOIN_CLUB_ADVERSAIRE)
const SQL_LOGO_ADVERSAIRE = `COALESCE(ca.logo_url, ${sqlLogoParNom('m.adversaire')}, m.logo_adversaire)`;

// Logo local seul (champ historique logo_adversaire_local : sans repli sur le logo FFF)
const SQL_LOGO_ADVERSAIRE_LOCAL = `COALESCE(ca.logo_url, ${sqlLogoParNom('m.adversaire')})`;

// Colonnes du club adverse nécessaires à nommerAdversaire()
const SQL_NOMS_ADVERSAIRE = `ca.nom_affiche AS ca_nom_affiche, ca.nom_court AS ca_nom_court, ca.nom_fff AS ca_nom_fff`;

/**
 * Remplace `adversaire` d'une ligne de match par son nom d'affichage et retire
 * les colonnes techniques ca_*. Avec { court: true }, ajoute `adversaire_court`.
 * Un match sans club rattaché garde son adversaire tel quel.
 */
function nommerAdversaire(row, { court = false } = {}) {
  if (!row) return row;
  const { ca_nom_affiche, ca_nom_court, ca_nom_fff, ...reste } = row;
  const club = { nom_affiche: ca_nom_affiche, nom_court: ca_nom_court, nom_fff: ca_nom_fff, nom: row.adversaire };
  const equipeNo = row.adversaire_equipe_no;
  reste.adversaire = nomClub(club, equipeNo);
  if (court) reste.adversaire_court = nomClub(club, equipeNo, { court: true });
  return reste;
}

module.exports = {
  nomClub, assurerClub, assurerClubs, nommerAdversaire,
  SQL_JOIN_CLUB_ADVERSAIRE, SQL_LOGO_ADVERSAIRE, SQL_LOGO_ADVERSAIRE_LOCAL, SQL_NOMS_ADVERSAIRE,
  sqlLogoParNom,
};
