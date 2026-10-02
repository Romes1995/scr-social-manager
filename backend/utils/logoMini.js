/**
 * Miniatures des logos de clubs pour la vitrine (pastilles de 20 à 28 px).
 *
 * Les logos importés pèsent souvent plusieurs Mo : chaque logo local
 * /uploads/logos/<nom>.<ext> a une miniature WebP carrée de 64 px,
 * /uploads/logos/mini/<nom>-64.webp, régénérée si le logo est plus récent.
 *
 *   cheminMini(url)        → chemin public de la miniature (null si logo non local)
 *   genererMini(url)       → crée ou met à jour la miniature (Promise)
 *   miniSiDisponible(url)  → chemin de la miniature si elle est à jour, sinon null
 *                            et génération lancée en arrière-plan
 */

const fs    = require('fs');
const path  = require('path');
const sharp = require('sharp');

const UPLOADS  = path.join(__dirname, '..', 'uploads');
const MINI_DIR = path.join(UPLOADS, 'logos', 'mini');
const TAILLE   = 64;

const LOCAL = /^\/uploads\/logos\/([^/]+)\.(png|jpe?g|webp)$/i;

function cheminMini(url) {
  const m = LOCAL.exec(url || '');
  return m ? `/uploads/logos/mini/${m[1]}-${TAILLE}.webp` : null;
}

const fichier = (cheminPublic) => path.join(UPLOADS, cheminPublic.replace(/^\/uploads\//, ''));

// La miniature existe et n'est pas plus ancienne que le logo
function aJour(url) {
  const mini = cheminMini(url);
  if (!mini) return false;
  try {
    return fs.statSync(fichier(mini)).mtimeMs >= fs.statSync(fichier(url)).mtimeMs;
  } catch {
    return false;
  }
}

const enCours = new Map();   // une seule génération à la fois par logo

function genererMini(url) {
  const mini = cheminMini(url);
  if (!mini) return Promise.resolve(null);
  if (enCours.has(url)) return enCours.get(url);

  const tache = (async () => {
    fs.mkdirSync(MINI_DIR, { recursive: true });
    const reduire = (img) => img
      .resize(TAILLE, TAILLE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 85, alphaQuality: 90 })
      .toFile(fichier(mini));
    try {
      // Marges transparentes ou unies autour du logo retirées
      await reduire(sharp(fichier(url)).trim({ threshold: 10 }));
    } catch {
      await reduire(sharp(fichier(url)));   // image unie : pas de rognage possible
    }
    return mini;
  })().finally(() => enCours.delete(url));

  enCours.set(url, tache);
  return tache;
}

function miniSiDisponible(url) {
  if (!cheminMini(url)) return null;
  if (aJour(url)) return cheminMini(url);
  if (fs.existsSync(fichier(url))) {
    genererMini(url).catch(err => console.error(`[logoMini] ${url} :`, err.message));
  }
  return null;
}

module.exports = { cheminMini, genererMini, miniSiDisponible, TAILLE };
