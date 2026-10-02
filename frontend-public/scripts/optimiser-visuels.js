#!/usr/bin/env node
/**
 * Optimise les visuels de la page d'accueil.
 *
 * Sources : sources/visuels/*.png (originaux versionnés) et sources/photos/ (hors git),
 *           hors de public/ pour ne pas être copiés dans le build
 * Sortie  : public/visuels/web/ (seuls fichiers utilisés par la page, régénérés en entier)
 *   - <nom>-<largeur>.webp  pour chaque largeur d'affichage (mobile, ordinateur),
 *   - <nom>-h<hauteur>.webp pour les visuels dimensionnés en hauteur (issues),
 *     toujours à 2 fois la taille d'affichage (écrans haute densité) ;
 *   - favicon-64.png et apple-touch-icon-180.png depuis logo-scr-couleur.png ;
 *   - photo-entete-{mobile,bureau}-<largeur>.webp : recadrages de la photo d'en-tête
 *     (source sources/photos/, hors git : si elle est absente, les
 *     recadrages déjà générés sont conservés tels quels).
 *
 * Pour un nouveau visuel : l'ajouter à VISUELS avec ses tailles d'affichage en px
 * (et à src/accueil/visuels.js). Les anciens fichiers de web/ sont supprimés.
 *
 * Usage : npm run visuels
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const RACINE  = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = path.join(RACINE, 'sources', 'visuels');
const SORTIE  = path.join(RACINE, 'public', 'visuels', 'web');
const PHOTOS  = path.join(RACINE, 'sources', 'photos');

// nom de la source (sans .png) → largeurs (ou hauteurs) d'affichage : [mobile, ordinateur]
const VISUELS = [
  { nom: 'logo-scr-dore',              largeurs: [42, 50] },
  { nom: 'nom-club',                   largeurs: [200, 230] },
  { nom: 'titre-ce-week-end-au-stade', largeurs: [330, 520] },
  { nom: 'titre-prochain-match',       largeurs: [260, 410] },
  { nom: 'titre-prochains-matchs',     largeurs: [260, 410] },
  { nom: 'titre-resultats',            largeurs: [310, 420] },
  { nom: 'titre-classements',          largeurs: [225, 310] },
  { nom: 'slogan',                     largeurs: [300, 380] },
  { nom: 'logo-90-ans-dore',           largeurs: [150, 190] },
  { nom: 'issue-victoire',             hauteurs: [22, 24] },
  { nom: 'issue-nul',                  hauteurs: [22, 24] },
  { nom: 'issue-defaite',              hauteurs: [22, 24] },
];

// Photo d'en-tête : zones de recadrage en fraction de l'original (6263 × 4175),
// puis tailles de sortie (×2 et ×1). Légère désaturation, contraste +5 %.
const PHOTO_ENTETE = {
  source: 'A7400580.jpg',
  recadrages: [
    { nom: 'photo-entete-mobile', x: [0.185, 0.775], y: [0, 1],         tailles: [[780, 880], [390, 440]] },
    { nom: 'photo-entete-bureau', x: [0, 1],         y: [0.036, 0.786], tailles: [[1920, 960], [1280, 640]] },
  ],
};

const ICONES = [
  { source: 'logo-scr-couleur', sortie: 'favicon-64.png',           taille: 64 },
  // iOS remplace la transparence par du noir : fond blanc et marge
  { source: 'logo-scr-couleur', sortie: 'apple-touch-icon-180.png', taille: 180, fond: '#FFFFFF', marge: 14 },
];

const ko = (octets) => `${(octets / 1024).toFixed(1)} Ko`;

async function main() {
  fs.mkdirSync(SORTIE, { recursive: true });
  const bilan = [];
  const produits = new Set();

  for (const v of VISUELS) {
    const source = path.join(SOURCES, `${v.nom}.png`);
    if (!fs.existsSync(source)) throw new Error(`source absente : ${source}`);
    const tailles = v.largeurs
      ? v.largeurs.map(l => ({ suffixe: `${l}`, resize: { width: l * 2 } }))
      : v.hauteurs.map(h => ({ suffixe: `h${h}`, resize: { height: h * 2 } }));

    for (const t of tailles) {
      const fichier = `${v.nom}-${t.suffixe}.webp`;
      const info = await sharp(source)
        .resize({ ...t.resize, withoutEnlargement: true })
        .webp({ quality: 82, alphaQuality: 90, effort: 6 })
        .toFile(path.join(SORTIE, fichier));
      produits.add(fichier);
      bilan.push({ fichier, source: fs.statSync(source).size, sortie: info.size, dims: `${info.width}×${info.height}` });
    }
  }

  for (const ic of ICONES) {
    const source = path.join(SOURCES, `${ic.source}.png`);
    const sortie = path.join(SORTIE, ic.sortie);
    const interieur = ic.taille - 2 * (ic.marge || 0);
    let img = sharp(source).resize(interieur, interieur, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
    if (ic.marge) {
      img = sharp(await img.png().toBuffer())
        .extend({ top: ic.marge, bottom: ic.marge, left: ic.marge, right: ic.marge, background: { r: 0, g: 0, b: 0, alpha: 0 } });
    }
    if (ic.fond) img = img.flatten({ background: ic.fond });
    const info = await img.png({ compressionLevel: 9, palette: true }).toFile(sortie);
    produits.add(ic.sortie);
    bilan.push({ fichier: ic.sortie, source: fs.statSync(source).size, sortie: info.size, dims: `${info.width}×${info.height}` });
  }

  // Photo d'en-tête
  const photo = path.join(PHOTOS, PHOTO_ENTETE.source);
  for (const r of PHOTO_ENTETE.recadrages) {
    for (const [l, h] of r.tailles) {
      const fichier = `${r.nom}-${l}.webp`;
      produits.add(fichier);
      if (!fs.existsSync(photo)) continue;
      const { width, height } = await sharp(photo).metadata();
      const zone = {
        left:   Math.round(r.x[0] * width),
        top:    Math.round(r.y[0] * height),
        width:  Math.round((r.x[1] - r.x[0]) * width),
        height: Math.round((r.y[1] - r.y[0]) * height),
      };
      const info = await sharp(photo)
        .rotate()                                   // orientation EXIF
        .extract(zone)
        .resize(l, h, { fit: 'cover' })
        .modulate({ saturation: 0.85 })
        .linear(1.05, -(128 * 0.05))                // contraste +5 %
        .webp({ quality: 78, effort: 6 })
        .toFile(path.join(SORTIE, fichier));
      bilan.push({ fichier, source: fs.statSync(photo).size, sortie: info.size, dims: `${info.width}×${info.height}` });
    }
  }
  if (!fs.existsSync(photo)) console.warn(`photo absente (${photo}) : recadrages existants conservés`);

  // Fichiers d'une ancienne génération (visuel retiré ou taille changée)
  for (const f of fs.readdirSync(SORTIE)) {
    if (!produits.has(f)) { fs.unlinkSync(path.join(SORTIE, f)); console.log(`supprimé : ${f}`); }
  }

  for (const b of bilan) {
    console.log(`${b.fichier.padEnd(36)} ${b.dims.padEnd(10)} ${ko(b.source).padStart(10)} → ${ko(b.sortie).padStart(9)}`);
  }
  console.log(`${'Total généré'.padEnd(36)} ${''.padEnd(10)} ${''.padStart(10)}   ${ko(bilan.reduce((s, b) => s + b.sortie, 0)).padStart(9)}`);
}

main().catch(err => { console.error('❌', err.message); process.exitCode = 1; });
