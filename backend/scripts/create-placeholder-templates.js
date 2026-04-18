/**
 * Génère des templates placeholder pour score live et résultats.
 * Ces fichiers seront remplacés par de vrais designs graphiques.
 *
 * Usage : node scripts/create-placeholder-templates.js
 */
const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const TEMPLATES = path.join(__dirname, '..', 'uploads', 'templates');

async function createTemplate(filename, width, height, bg, label) {
  const out = path.join(TEMPLATES, filename);
  if (fs.existsSync(out)) {
    console.log(`  ↩ déjà existant : ${filename}`);
    return;
  }

  const svg = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="${bg}"/>
      <text x="${width/2}" y="${height/2 - 20}" text-anchor="middle"
            font-family="Arial" font-size="40" fill="rgba(255,255,255,0.5)">${label}</text>
      <text x="${width/2}" y="${height/2 + 30}" text-anchor="middle"
            font-family="Arial" font-size="22" fill="rgba(255,255,255,0.35)">
        Remplacez ce fichier par votre template graphique
      </text>
      <text x="${width/2}" y="${height/2 + 60}" text-anchor="middle"
            font-family="Arial" font-size="18" fill="rgba(255,255,255,0.25)">${width}x${height}</text>
    </svg>`
  );

  await sharp({ create: { width, height, channels: 4, background: bg } })
    .composite([{ input: svg, top: 0, left: 0 }])
    .png()
    .toFile(out);

  console.log(`  ✔ créé : ${filename}`);
}

(async () => {
  console.log('Création des templates placeholder…\n');

  // Score live : 1080×1920, fond vert foncé SCR
  for (let i = 1; i <= 3; i++) {
    await createTemplate(`score_live_scr${i}.png`, 1080, 1920, '#0d3a1c', `Score Live — SCR ${i}`);
  }

  // Résultats : 940×788, fond vert foncé SCR
  await createTemplate('resultat_1match.png',   940, 788, '#0d3a1c', 'Résultats — 1 match');
  await createTemplate('resultat_2matchs.png',  940, 788, '#0d3a1c', 'Résultats — 2 matchs');
  await createTemplate('resultat_3matchs.png',  940, 788, '#0d3a1c', 'Résultats — 3 matchs');

  console.log('\nDone!');
})();
