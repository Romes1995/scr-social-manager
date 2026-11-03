/**
 * Copie locale des logos FFF des clubs, et leur miniature 64 px pour la vitrine
 *
 * Appelé par importFFF() (adversaires et SCR) et par refreshClassements() (clubs
 * des classements). Pour chaque club (cl_no) :
 *   - logo déjà présent (uploads/logos/fff-<cl_no>.<ext>) : pas de téléchargement ;
 *   - sinon téléchargement depuis l'URL DOFA (logo du match), ou à défaut depuis la
 *     fiche club DOFA (/api/clubs/<cl_no>) : les classements ne donnent pas de logo ;
 *   - miniature générée ou mise à jour (utils/logoMini.js) ;
 *   - clubs.logo_fff_local renseigné (SCR : reglages logo_fff_scr / logo_fff_scr_local).
 *
 * Un échec (réseau, image invalide…) est journalisé et n'arrête ni les autres clubs
 * ni l'import. Les logos de l'admin et du Drive restent prioritaires à l'affichage
 * (services/clubsFff.js : SQL_LOGO_ADVERSAIRE).
 */

const fs    = require('fs');
const path  = require('path');
const axios = require('axios');
const sharp = require('sharp');
const pool  = require('../db');
const { UPLOADS_DIR } = require('../config/uploads');
const { genererMini, cheminMini } = require('../utils/logoMini');

const LOGOS_DIR     = path.join(UPLOADS_DIR, 'logos');
const PARALLELE     = 3;
const TIMEOUT_MS    = 15000;
const TAILLE_MAX    = 5 * 1024 * 1024;
const EXTENSIONS    = ['jpg', 'jpeg', 'png', 'webp'];

// require différé : fffImport.js charge ce module
const dofa = () => require('./fffImport');

const cheminPublic = (clNo, ext) => `/uploads/logos/fff-${clNo}.${ext}`;
const fichier      = (cheminPub) => path.join(UPLOADS_DIR, cheminPub.replace(/^\/uploads\//, ''));

// Logo local déjà téléchargé pour ce cl_no (chemin public), sinon null
function logoExistant(clNo) {
  for (const ext of EXTENSIONS) {
    const p = cheminPublic(clNo, ext);
    if (fs.existsSync(fichier(p))) return p;
  }
  return null;
}

function extensionDe(url, contentType) {
  const parUrl = /\.(jpe?g|png|webp)(?:\?|$)/i.exec(url || '');
  if (parUrl) return parUrl[1].toLowerCase().replace('jpeg', 'jpg');
  if (/png/i.test(contentType)) return 'png';
  if (/webp/i.test(contentType)) return 'webp';
  return 'jpg';
}

// URL du logo depuis la fiche club DOFA (clubs vus seulement dans un classement)
async function urlDepuisFicheClub(clNo) {
  const { DOFA_BASE, DOFA_HEADERS, getWithRetry } = dofa();
  const resp = await getWithRetry(`${DOFA_BASE}/api/clubs/${clNo}`, { timeout: TIMEOUT_MS, headers: DOFA_HEADERS });
  return resp.data?.logo || null;
}

async function telecharger(clNo, url) {
  const resp = await axios.get(url, {
    responseType: 'arraybuffer', timeout: TIMEOUT_MS, maxContentLength: TAILLE_MAX,
    headers: { 'User-Agent': dofa().DOFA_HEADERS['User-Agent'] },
  });
  const contenu = Buffer.from(resp.data);
  if (contenu.length === 0) throw new Error('fichier vide');
  await sharp(contenu).metadata();   // lève une erreur si ce n'est pas une image lisible

  const p = cheminPublic(clNo, extensionDe(url, resp.headers['content-type']));
  fs.mkdirSync(LOGOS_DIR, { recursive: true });
  const tmp = `${fichier(p)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, contenu);
  fs.renameSync(tmp, fichier(p));   // jamais de fichier à moitié écrit
  return p;
}

async function enregistrer(club, cheminPub) {
  if (club.scr) {
    await pool.query(
      `INSERT INTO reglages (cle, valeur) VALUES ('logo_fff_scr_local', $1)
       ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur, updated_at = NOW()`,
      [cheminPub]);
    if (club.url) {
      await pool.query(
        `INSERT INTO reglages (cle, valeur) VALUES ('logo_fff_scr', $1)
         ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur, updated_at = NOW()`,
        [club.url]);
    }
    return;
  }
  await pool.query(
    'UPDATE clubs SET logo_fff_local = $1 WHERE fff_cl_no = $2 AND logo_fff_local IS DISTINCT FROM $1',
    [cheminPub, club.cl_no]);
}

// Traite un club ; renvoie { statut: 'telecharge' | 'existant', mini } ou lève l'erreur
async function traiterClub(club) {
  let p = logoExistant(club.cl_no);
  let statut = 'existant';
  if (!p) {
    const url = club.url || await urlDepuisFicheClub(club.cl_no);
    if (!url) throw new Error('aucun logo FFF pour ce club');
    club.url = url;
    p = await telecharger(club.cl_no, url);
    statut = 'telecharge';
  }
  const mini = await genererMini(p);
  if (!mini || !fs.existsSync(fichier(cheminMini(p)))) throw new Error('miniature non générée');
  await enregistrer(club, p);
  return { statut, logo: p, mini };
}

/**
 * clubs : [{ cl_no, url?, nom?, scr? }] (dédoublonnés par cl_no ; url peut manquer)
 * Retourne { telecharges, existants, echecs: [{ cl_no, nom, erreur }] }.
 */
async function assurerLogosFff(clubs) {
  const parClNo = new Map();
  for (const c of clubs) {
    if (!Number.isInteger(c.cl_no)) continue;
    const deja = parClNo.get(c.cl_no);
    if (!deja) parClNo.set(c.cl_no, { ...c });
    else if (!deja.url && c.url) deja.url = c.url;
  }
  const file = [...parClNo.values()];
  const bilan = { telecharges: [], existants: [], echecs: [] };

  const travailleur = async () => {
    for (let club = file.shift(); club; club = file.shift()) {
      try {
        const r = await traiterClub(club);
        (r.statut === 'telecharge' ? bilan.telecharges : bilan.existants)
          .push({ cl_no: club.cl_no, nom: club.nom || null, mini: r.mini });
      } catch (err) {
        const erreur = err.response?.status ? `HTTP ${err.response.status}` : err.message;
        bilan.echecs.push({ cl_no: club.cl_no, nom: club.nom || null, erreur });
        console.warn(`[LogosFFF] cl_no=${club.cl_no}${club.nom ? ` « ${club.nom} »` : ''} : ${erreur}`);
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLELE }, travailleur));

  console.log(`[LogosFFF] ${bilan.telecharges.length} téléchargé(s), ${bilan.existants.length} déjà présent(s), ` +
              `${bilan.echecs.length} échec(s)`);
  return bilan;
}

/**
 * Logo du SCR pour la vitrine : logo de l'admin (config/club.js) s'il existe, sinon
 * copie locale du logo FFF ; logo_fff : URL du logo FFF (repli sans miniature).
 */
async function logoScr() {
  const club = require('../config/club');
  const { rows } = await pool.query(`SELECT valeur FROM reglages WHERE cle = 'logo_fff_scr'`);
  const logoFff = rows[0]?.valeur || null;
  const admin = club.logo && fs.existsSync(fichier(club.logo)) ? club.logo : null;
  return { logo: admin || logoExistant(dofa().SCR_CL_NO), logo_fff: logoFff };
}

// Résumé court pour taches_log et le rapport d'import
const resumeLogos = (b) => b && {
  telecharges: b.telecharges.length, existants: b.existants.length,
  echecs: b.echecs.map(e => `${e.cl_no}${e.nom ? ` ${e.nom}` : ''} : ${e.erreur}`),
};

module.exports = { assurerLogosFff, resumeLogos, logoExistant, logoScr };
