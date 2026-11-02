/**
 * Synchronisation des logos des clubs depuis Google Drive (API v3, clé API seule).
 *
 * Le dossier GOOGLE_DRIVE_LOGOS_FOLDER_ID contient un sous-dossier par club
 * (1 à 3 logos : classique, octobre rose, monochrome).
 *
 * planifier({ choix, variantes, folderIds })  → aperçu, rien n'est écrit
 * synchroniser({ choix, variantes, folderIds }) → applique le plan :
 *   - associe les dossiers aux clubs (clubs.drive_folder_id, lien permanent) ;
 *     une association manuelle (drive_folder_manuel) n'est jamais remplacée ;
 *   - télécharge les logos dans uploads/logos/<club_id>/<variante>.png (PNG,
 *     transparence conservée, 1000 px maximum) et les note dans club_logos ;
 *     un fichier n'est retéléchargé que si sa date de modification Drive a changé ;
 *   - COMPLÈTE seulement : une variante déjà présente dans clubs.logo_url /
 *     logo_monochrome_url n'est pas téléchargée ; le logo SCR (dossier « SC Roeschwoog »)
 *     et les logos temporaires ne sont pas concernés.
 *
 * choix     : { [folder_id]: club_id | 'ignorer' }   dossiers ambigus ou sans correspondance
 * variantes : { [drive_file_id]: variante | 'ignorer' }  fichiers à trancher ou à corriger
 * folderIds : limite le traitement à ces dossiers (fiche club)
 */

const axios = require('axios');
const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');
const pool  = require('../db');
const { VARIANTES } = require('../utils/logoClub');
const { genererMini } = require('../utils/logoMini');

const DRIVE_API   = 'https://www.googleapis.com/drive/v3/files';
const MIME_DOSSIER = 'application/vnd.google-apps.folder';
const MIME_IMAGES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
const TAILLE_MAX  = 1000;   // px, côté le plus long

const LOGOS_DIR = () => path.join(process.cwd(), 'uploads', 'logos');

class ErreurDrive extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ── Accès Drive ───────────────────────────────────────────────────────────────

function config() {
  const cle = process.env.GOOGLE_DRIVE_API_KEY;
  const racine = process.env.GOOGLE_DRIVE_LOGOS_FOLDER_ID;
  if (!cle || !racine) {
    throw new ErreurDrive(500, 'GOOGLE_DRIVE_API_KEY ou GOOGLE_DRIVE_LOGOS_FOLDER_ID absent de backend/.env');
  }
  return { cle, racine };
}

// Message d'erreur Drive sans la clé API (elle figure dans l'URL des requêtes)
function erreurLisible(err, cle) {
  const status = err.response?.status;
  let detail = err.response?.data?.error?.message;
  if (!detail && err.response?.data instanceof Buffer) {
    try { detail = JSON.parse(err.response.data.toString()).error?.message; } catch { /* binaire */ }
  }
  const msg = String(detail || err.message).split(cle).join('***');
  if (status === 403 || status === 404) {
    return new ErreurDrive(502, `Drive inaccessible (${status}) : vérifiez le partage « tous les utilisateurs disposant du lien » et la clé API. ${msg}`);
  }
  return new ErreurDrive(502, `Erreur Drive${status ? ` (${status})` : ''} : ${msg}`);
}

async function driveGet(url, params, options = {}) {
  const { cle } = config();
  try {
    return await axios.get(url, { params: { ...params, key: cle, supportsAllDrives: true }, timeout: 30000, ...options });
  } catch (err) {
    throw erreurLisible(err, cle);
  }
}

async function listerEnfants(parentId) {
  const fichiers = [];
  let pageToken;
  do {
    const { data } = await driveGet(DRIVE_API, {
      q: `'${parentId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size)',
      pageSize: 1000, pageToken, includeItemsFromAllDrives: true,
    });
    fichiers.push(...data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return fichiers;
}

/** Sous-dossiers du dossier racine avec leurs fichiers. */
async function listerDrive({ folderIds = null } = {}) {
  const { racine } = config();
  const enfants = await listerEnfants(racine);
  let dossiers = enfants.filter(f => f.mimeType === MIME_DOSSIER);
  if (folderIds) dossiers = dossiers.filter(d => folderIds.includes(d.id));
  // Contenu des dossiers, 8 requêtes à la fois
  const resultat = [];
  for (let i = 0; i < dossiers.length; i += 8) {
    resultat.push(...await Promise.all(dossiers.slice(i, i + 8).map(async d => ({
      id: d.id, nom: d.name,
      fichiers: (await listerEnfants(d.id)).filter(f => f.mimeType !== MIME_DOSSIER)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))));
  }
  return resultat.sort((a, b) => a.nom.localeCompare(b.nom));
}

async function telechargerFichier(fileId) {
  const { data } = await driveGet(`${DRIVE_API}/${fileId}`, { alt: 'media' }, { responseType: 'arraybuffer', timeout: 120000 });
  return Buffer.from(data);
}

// ── Noms et variantes ─────────────────────────────────────────────────────────

const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Préfixes ignorés et abréviations courantes des noms de dossiers / clubs
const PREFIXES = new Set(['fc', 'as', 'sc', 'us', 'ent']);
const ABREVIATIONS = { strg: 'strasbourg' };

// "STRG Hautepierre A.F.J." → ['afj', 'hautepierre', 'strasbourg']
function motsNom(nom) {
  return sansAccents(nom)
    .replace(/\./g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim().split(' ')
    .filter(w => w && !/^\d+$/.test(w) && !PREFIXES.has(w))
    .map(w => ABREVIATIONS[w] || w)
    .sort();
}
const cleNom = (nom) => motsNom(nom).join(' ');

// Même nombre de mots, chacun préfixe de l'autre (≥ 4 lettres) : « durrenb » / « durrenbach »
function abrege(a, b) {
  const [x, y] = [motsNom(a), motsNom(b)];
  if (!x.length || x.length !== y.length) return false;
  const restants = [...y];
  return x.every(w => {
    const i = restants.findIndex(v => Math.min(v.length, w.length) >= 4 && (v.startsWith(w) || w.startsWith(v)));
    if (i < 0) return false;
    restants.splice(i, 1);
    return true;
  });
}

const estDossierScr = (nom) => cleNom(nom) === 'roeschwoog';

/**
 * Variante d'après le nom du fichier : { variante, raison } (variante null = ignoré)
 *   logo_x_special-octobre-rose.png → octobre_rose ; logo_x_mono.png, x_nb.png → monochrome ;
 *   logo_x_special-ancien-….png → ignoré ; PDF… → ignoré ; sinon classique.
 */
function detecterVariante(nomFichier, mimeType) {
  if (!MIME_IMAGES.includes(mimeType)) return { variante: null, raison: 'format non pris en charge' };
  const n = sansAccents(nomFichier);
  if (/octobre|rose/.test(n)) return { variante: 'octobre_rose', raison: 'nom : octobre / rose' };
  if (/special/.test(n))      return { variante: null, raison: 'logo spécial (ni classique, ni octobre rose)' };
  if (/mono|(^|[^a-z])(nb|n&b|noir)([^a-z]|$)/.test(n)) return { variante: 'monochrome', raison: 'nom : mono / nb / noir' };
  return { variante: 'classique', raison: 'aucun indice dans le nom' };
}

// ── Plan ──────────────────────────────────────────────────────────────────────

async function chargerBase() {
  const [{ rows: clubs }, { rows: aliases }, { rows: logos }, { rows: ignores }] = await Promise.all([
    pool.query(`SELECT id, nom, equipe, nom_fff, nom_affiche, fff_cl_no, logo_url, logo_monochrome_url,
                       drive_folder_id, drive_folder_nom, drive_folder_manuel
                  FROM clubs ORDER BY id`),
    pool.query('SELECT club_id, alias FROM club_aliases'),
    pool.query('SELECT * FROM club_logos'),
    pool.query('SELECT folder_id FROM drive_dossiers_ignores'),
  ]);
  return { clubs, aliases, logos, ignores: new Set(ignores.map(i => i.folder_id)) };
}

const resumeClub = (c) => c && { id: c.id, nom: c.nom, fff_cl_no: c.fff_cl_no, logo_url: c.logo_url };

/**
 * Association d'un dossier : { statut, club, candidats, regle }
 *   statut : lie | sur | ambigu | aucun | ignore | scr
 */
function associer(dossier, base, dejaPris) {
  const lie = base.clubs.find(c => c.drive_folder_id === dossier.id);
  if (lie) return { statut: 'lie', club: lie, regle: lie.drive_folder_manuel ? 'manuelle' : 'synchro précédente' };
  if (estDossierScr(dossier.nom)) return { statut: 'scr', regle: 'logo SCR déjà en place' };
  if (base.ignores.has(dossier.id)) return { statut: 'ignore', regle: 'ignoré dans l’admin' };

  // Clubs libres : sans dossier, pas réglés à la main, pas déjà proposés pour un autre dossier
  const libres = base.clubs.filter(c => !c.drive_folder_id && !c.drive_folder_manuel && !dejaPris.has(c.id));
  const noms = [];
  for (const c of libres) for (const n of [c.nom, c.equipe, c.nom_fff, c.nom_affiche]) if (n) noms.push({ id: c.id, nom: n });
  const idsLibres = new Set(libres.map(c => c.id));
  for (const a of base.aliases) if (idsLibres.has(a.club_id)) noms.push({ id: a.club_id, nom: a.alias });

  const parId = (ids) => [...new Set(ids)].map(id => base.clubs.find(c => c.id === id));
  const cle = cleNom(dossier.nom);
  const exacts = parId(noms.filter(n => cleNom(n.nom) === cle).map(n => n.id));
  if (exacts.length === 1) return { statut: 'sur', club: exacts[0], regle: 'nom normalisé' };
  if (exacts.length > 1)  return { statut: 'ambigu', candidats: exacts, regle: 'plusieurs clubs de même nom' };

  const proches = parId(noms.filter(n => abrege(n.nom, dossier.nom)).map(n => n.id));
  if (proches.length) return { statut: 'ambigu', candidats: proches, regle: 'nom abrégé' };
  return { statut: 'aucun', candidats: [] };
}

/**
 * Fichiers d'un dossier pour un club : variante retenue et action.
 *   telecharger | a_jour | deja_en_place | manuel (variante tenue par un autre fichier
 *   corrigé à la main) | a_trancher | ignore
 */
function planFichiers(dossier, club, base, variantesChoisies) {
  const logosClub = club ? base.logos.filter(l => l.club_id === club.id) : [];
  // Logos déjà en place (même nom de club = même logo, comme dans l'appli)
  const memeNom = club ? base.clubs.filter(c => c.nom.trim().toLowerCase() === club.nom.trim().toLowerCase()) : [];
  const enPlace = {
    classique:  memeNom.some(c => c.logo_url),
    monochrome: memeNom.some(c => c.logo_monochrome_url),
    octobre_rose: false,
  };

  const fichiers = dossier.fichiers.map(f => {
    const detection = detecterVariante(f.name, f.mimeType);
    const connu = logosClub.find(l => l.drive_file_id === f.id);
    const choix = variantesChoisies[f.id];
    let variante = detection.variante;
    let manuelle = false;
    if (choix === 'ignorer') { variante = null; manuelle = true; }
    else if (VARIANTES.includes(choix)) { variante = choix; manuelle = true; }
    else if (connu?.variante_manuelle) { variante = connu.variante; manuelle = true; }
    return {
      id: f.id, nom: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime, size: f.size ? Number(f.size) : null,
      variante_detectee: detection.variante, raison: manuelle ? 'choisie dans l’admin' : detection.raison,
      variante, variante_manuelle: manuelle, action: variante ? null : 'ignore',
    };
  });

  for (const v of VARIANTES) {
    let candidats = fichiers.filter(f => f.variante === v);
    if (candidats.length === 0) continue;
    // Variante déjà en place dans l'appli : rien à télécharger, donc rien à trancher
    if (club && enPlace[v]) {
      candidats.forEach(f => { f.action = 'deja_en_place'; f.raison = 'logo déjà en place dans l’appli'; });
      continue;
    }
    // Un choix manuel l'emporte ; sinon une image matricielle plutôt qu'un SVG du même logo
    if (candidats.length > 1 && candidats.some(f => f.variante_manuelle)) {
      candidats.filter(f => !f.variante_manuelle).forEach(f => { f.action = 'ignore'; f.raison = 'autre fichier choisi pour cette variante'; });
      candidats = candidats.filter(f => f.variante_manuelle);
    }
    if (candidats.length > 1) {
      const matriciels = candidats.filter(f => f.mimeType !== 'image/svg+xml');
      if (matriciels.length === 1) {
        candidats.filter(f => f !== matriciels[0]).forEach(f => { f.action = 'ignore'; f.raison = 'doublon SVG d’un PNG'; });
        candidats = matriciels;
      }
    }
    if (candidats.length > 1) {
      candidats.forEach(f => { f.action = 'a_trancher'; f.raison = `${candidats.length} fichiers pour la variante ${v}`; });
      continue;
    }

    const f = candidats[0];
    const existant = logosClub.find(l => l.variante === v);
    if (!club) { f.action = 'telecharger'; continue; }        // dossier pas encore associé
    if (existant?.variante_manuelle && existant.drive_file_id !== f.id && !f.variante_manuelle) {
      f.action = 'manuel'; f.raison = 'variante corrigée à la main sur un autre fichier'; continue;
    }
    const fichierOk = existant && fs.existsSync(path.join(process.cwd(), existant.fichier_local));
    const memeVersion = existant && existant.drive_file_id === f.id
      && new Date(existant.drive_modified_time).getTime() === new Date(f.modifiedTime).getTime();
    f.action = fichierOk && memeVersion ? 'a_jour' : 'telecharger';
  }
  return fichiers;
}

/** Aperçu complet. Rien n'est écrit. */
async function planifier({ choix = {}, variantes = {}, folderIds = null } = {}) {
  const [dossiers, base] = await Promise.all([listerDrive({ folderIds }), chargerBase()]);

  // Associations : dossiers déjà liés d'abord, puis les autres (un club ne sert qu'une fois)
  const dejaPris = new Set(base.clubs.filter(c => c.drive_folder_id).map(c => c.id));
  const associations = new Map();
  for (const d of dossiers) {
    const a = associer(d, base, dejaPris);
    if (a.statut === 'sur') dejaPris.add(a.club.id);
    associations.set(d.id, a);
  }

  const plan = dossiers.map(d => {
    const a = associations.get(d.id);
    let club = a.club || null;
    let statut = a.statut;
    const choisi = choix[d.id];
    if (['ambigu', 'aucun'].includes(statut) && choisi === 'ignorer') statut = 'ignore';
    else if (['ambigu', 'aucun'].includes(statut) && choisi != null) {
      club = base.clubs.find(c => c.id === Number(choisi)) || null;
      if (club) statut = 'choisi';
    }
    const actif = !['ignore', 'scr'].includes(statut) && (club || statut !== 'aucun');
    const fichiers = actif ? planFichiers(d, ['ambigu', 'aucun'].includes(statut) ? null : club, base, variantes) : [];
    return {
      folder_id: d.id, nom: d.nom, statut, regle: a.regle || null,
      club: resumeClub(club), candidats: (a.candidats || []).map(resumeClub),
      nb_fichiers: d.fichiers.length,
      fichiers: actif ? fichiers : d.fichiers.map(f => ({ id: f.id, nom: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime })),
    };
  });

  const compter = (s) => plan.filter(p => s.includes(p.statut)).length;
  const aTelecharger = plan.filter(p => ['lie', 'sur', 'choisi'].includes(p.statut))
    .flatMap(p => p.fichiers.filter(f => f.action === 'telecharger'));
  return {
    resume: {
      dossiers: plan.length,
      surs: compter(['lie', 'sur', 'choisi']), ambigus: compter(['ambigu']), aucun: compter(['aucun']),
      ignores: compter(['ignore', 'scr']),
      a_telecharger: aTelecharger.length,
      a_trancher: plan.flatMap(p => p.fichiers).filter(f => f.action === 'a_trancher').length,
    },
    dossiers: plan,
    clubs: base.clubs.map(c => ({ id: c.id, nom: c.nom, equipe: c.equipe, fff_cl_no: c.fff_cl_no, drive_folder_id: c.drive_folder_id })),
  };
}

// ── Écriture ──────────────────────────────────────────────────────────────────

async function enregistrerLogo(clubId, fichier, variante) {
  const brut = await telechargerFichier(fichier.id);
  const png = await sharp(brut)
    .resize(TAILLE_MAX, TAILLE_MAX, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();

  const dossier = path.join(LOGOS_DIR(), String(clubId));
  fs.mkdirSync(dossier, { recursive: true });
  const cible = path.join(dossier, `${variante}.png`);
  const temp = `${cible}.${process.pid}.tmp`;
  fs.writeFileSync(temp, png);
  fs.renameSync(temp, cible);

  const url = `/uploads/logos/${clubId}/${variante}.png`;
  await pool.query(
    `INSERT INTO club_logos (club_id, variante, fichier_local, drive_file_id, drive_file_nom, drive_modified_time, variante_manuelle)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (club_id, variante) DO UPDATE SET
       fichier_local = EXCLUDED.fichier_local, drive_file_id = EXCLUDED.drive_file_id,
       drive_file_nom = EXCLUDED.drive_file_nom, drive_modified_time = EXCLUDED.drive_modified_time,
       variante_manuelle = EXCLUDED.variante_manuelle, updated_at = NOW()`,
    [clubId, variante, url, fichier.id, fichier.nom, fichier.modifiedTime, fichier.variante_manuelle]);
  genererMini(url).catch(err => console.error(`[logoMini] ${url} :`, err.message));
  return { url, octets: png.length };
}

/** Applique le plan. Retourne { associes, ignores, telecharges, a_jour, erreurs, plan }. */
async function synchroniser(options = {}) {
  const plan = await planifier(options);
  const bilan = { associes: [], ignores: [], telecharges: [], a_jour: 0, erreurs: [] };

  // 1. Associations et dossiers ignorés (une transaction)
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const d of plan.dossiers) {
      if (d.statut === 'ignore' && options.choix?.[d.folder_id] === 'ignorer') {
        await client.query(
          'INSERT INTO drive_dossiers_ignores (folder_id, nom) VALUES ($1, $2) ON CONFLICT (folder_id) DO UPDATE SET nom = EXCLUDED.nom',
          [d.folder_id, d.nom]);
        bilan.ignores.push(d.nom);
      }
      if (d.statut === 'lie') {
        await client.query('UPDATE clubs SET drive_folder_nom = $1 WHERE id = $2', [d.nom, d.club.id]);
      }
      if (d.statut === 'sur' || d.statut === 'choisi') {
        const r = await client.query(
          `UPDATE clubs SET drive_folder_id = $1, drive_folder_nom = $2, drive_folder_manuel = $3
            WHERE id = $4 AND drive_folder_id IS NULL AND ($3 OR NOT drive_folder_manuel)
            RETURNING id`,
          [d.folder_id, d.nom, d.statut === 'choisi', d.club.id]);
        if (r.rows[0]) bilan.associes.push({ dossier: d.nom, club: d.club.nom, manuel: d.statut === 'choisi' });
        else d.statut = 'non_associe';   // club déjà lié entre-temps : pas de téléchargement
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // 2. Téléchargements, fichier par fichier (une erreur n'arrête pas les autres)
  for (const d of plan.dossiers.filter(x => ['lie', 'sur', 'choisi'].includes(x.statut))) {
    for (const f of d.fichiers) {
      if (f.action === 'a_jour') { bilan.a_jour++; continue; }
      if (f.action !== 'telecharger') continue;
      try {
        const r = await enregistrerLogo(d.club.id, f, f.variante);
        bilan.telecharges.push({ club: d.club.nom, club_id: d.club.id, variante: f.variante, fichier: f.nom, url: r.url });
      } catch (err) {
        bilan.erreurs.push({ club: d.club.nom, fichier: f.nom, erreur: err.message });
        console.error(`[driveLogos] ${d.club.nom} / ${f.nom} :`, err.message);
      }
    }
  }

  console.log(`[driveLogos] Synchro : ${bilan.associes.length} association(s), ${bilan.telecharges.length} logo(s) téléchargé(s), ` +
    `${bilan.a_jour} à jour, ${bilan.erreurs.length} erreur(s)`);
  return { ...bilan, plan };
}

// ── Association manuelle et correction de variante ───────────────────────────

/**
 * Lie un dossier Drive à un club (folderId null : aucun dossier). L'association est
 * manuelle (jamais remplacée par la synchro). Les logos Drive du club issus de
 * l'ancien dossier sont retirés, puis le nouveau dossier est synchronisé.
 */
async function associerDossier(clubId, folderId) {
  const { rows: [club] } = await pool.query('SELECT id, nom, drive_folder_id FROM clubs WHERE id = $1', [clubId]);
  if (!club) throw new ErreurDrive(404, 'Club non trouvé');

  let nom = null;
  if (folderId) {
    // La clé API ne donne pas accès au parent d'un dossier : vérification par la liste de la racine
    const dossier = (await dossiersDrive()).find(d => d.id === folderId);
    if (!dossier) throw new ErreurDrive(400, 'Ce dossier n’est pas dans la base de logos Drive');
    nom = dossier.nom;
  }

  const client = await pool.connect();
  let anciens = [];
  try {
    await client.query('BEGIN');
    if (folderId) {
      // Le dossier quitte l'éventuel autre club (ses logos Drive partent avec lui)
      const { rows: autres } = await client.query('SELECT id FROM clubs WHERE drive_folder_id = $1 AND id <> $2', [folderId, clubId]);
      for (const a of autres) {
        anciens.push(...(await client.query('DELETE FROM club_logos WHERE club_id = $1 RETURNING fichier_local', [a.id])).rows);
        await client.query('UPDATE clubs SET drive_folder_id = NULL, drive_folder_nom = NULL, drive_folder_manuel = true WHERE id = $1', [a.id]);
      }
      await client.query('DELETE FROM drive_dossiers_ignores WHERE folder_id = $1', [folderId]);
    }
    if (club.drive_folder_id !== folderId) {
      anciens.push(...(await client.query('DELETE FROM club_logos WHERE club_id = $1 RETURNING fichier_local', [clubId])).rows);
    }
    await client.query(
      'UPDATE clubs SET drive_folder_id = $1, drive_folder_nom = $2, drive_folder_manuel = true WHERE id = $3',
      [folderId, nom, clubId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  for (const a of anciens) fs.rmSync(path.join(process.cwd(), a.fichier_local), { force: true });

  const synchro = folderId ? await synchroniser({ folderIds: [folderId] }) : null;
  return { club_id: clubId, drive_folder_id: folderId, drive_folder_nom: nom, synchro };
}

/**
 * Corrige la variante d'un logo téléchargé. Si le club a déjà un logo dans la
 * variante cible, les deux sont échangés. Les deux deviennent « manuels ».
 */
async function corrigerVariante(logoId, variante) {
  if (!VARIANTES.includes(variante)) throw new ErreurDrive(400, `Variante invalide : ${variante}`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [logo] } = await client.query('SELECT * FROM club_logos WHERE id = $1 FOR UPDATE', [logoId]);
    if (!logo) throw new ErreurDrive(404, 'Logo non trouvé');
    if (logo.variante === variante) {
      await client.query('UPDATE club_logos SET variante_manuelle = true, updated_at = NOW() WHERE id = $1', [logoId]);
      await client.query('COMMIT');
      return { echange: false };
    }
    const { rows: [autre] } = await client.query(
      'SELECT * FROM club_logos WHERE club_id = $1 AND variante = $2 FOR UPDATE', [logo.club_id, variante]);

    const fichier = (v) => path.join(LOGOS_DIR(), String(logo.club_id), `${v}.png`);
    const url = (v) => `/uploads/logos/${logo.club_id}/${v}.png`;

    // Fichiers : renommage via un nom temporaire en cas d'échange
    const temp = fichier(`echange_${logoId}`);
    if (fs.existsSync(fichier(logo.variante))) fs.renameSync(fichier(logo.variante), temp);
    if (autre && fs.existsSync(fichier(variante))) fs.renameSync(fichier(variante), fichier(logo.variante));
    if (fs.existsSync(temp)) fs.renameSync(temp, fichier(variante));

    // Base : la contrainte UNIQUE (club_id, variante) impose de libérer la variante d'abord
    if (autre) await client.query('DELETE FROM club_logos WHERE id = $1', [autre.id]);
    await client.query(
      `UPDATE club_logos SET variante = $1, fichier_local = $2, variante_manuelle = true, updated_at = NOW() WHERE id = $3`,
      [variante, url(variante), logoId]);
    if (autre) {
      await client.query(
        `INSERT INTO club_logos (id, club_id, variante, fichier_local, drive_file_id, drive_file_nom, drive_modified_time, variante_manuelle, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8)`,
        [autre.id, autre.club_id, logo.variante, url(logo.variante), autre.drive_file_id, autre.drive_file_nom,
         autre.drive_modified_time, autre.created_at]);
    }
    await client.query('COMMIT');
    for (const v of [variante, logo.variante]) genererMini(url(v)).catch(() => {});
    return { echange: !!autre };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Fiche club : dossier lié, logos (existants et Drive) et fichiers du dossier. */
async function logosDuClub(clubId) {
  const { rows: [club] } = await pool.query(
    `SELECT id, nom, equipe, fff_cl_no, logo_url, logo_monochrome_url,
            drive_folder_id, drive_folder_nom, drive_folder_manuel
       FROM clubs WHERE id = $1`, [clubId]);
  if (!club) throw new ErreurDrive(404, 'Club non trouvé');
  const { rows: logos } = await pool.query('SELECT * FROM club_logos WHERE club_id = $1 ORDER BY variante', [clubId]);

  let dossier = null;
  if (club.drive_folder_id) {
    try {
      const plan = await planifier({ folderIds: [club.drive_folder_id] });
      dossier = plan.dossiers[0] || { folder_id: club.drive_folder_id, introuvable: true };
    } catch (err) {
      dossier = { folder_id: club.drive_folder_id, erreur: err.message };
    }
  }
  return { club, logos, dossier };
}

/** Liste des dossiers Drive (menu « changer l'association »). */
async function dossiersDrive() {
  const { racine } = config();
  const enfants = await listerEnfants(racine);
  return enfants.filter(f => f.mimeType === MIME_DOSSIER)
    .map(d => ({ id: d.id, nom: d.name }))
    .sort((a, b) => a.nom.localeCompare(b.nom));
}

module.exports = {
  planifier, synchroniser, associerDossier, corrigerVariante, logosDuClub, dossiersDrive,
  detecterVariante, cleNom, ErreurDrive,
};
