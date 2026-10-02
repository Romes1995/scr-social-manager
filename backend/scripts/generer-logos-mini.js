#!/usr/bin/env node
/**
 * Génère les miniatures 64 px (uploads/logos/mini/) de tous les logos locaux des
 * clubs et du logo SCR. À lancer après un déploiement ou une copie de uploads/ ;
 * les nouveaux logos ont ensuite leur miniature dès l'envoi (routes/clubs.js).
 *
 * Usage : npm run logos-mini            (ne refait que les miniatures périmées)
 *         npm run logos-mini -- --tout  (refait toutes les miniatures)
 */

const fs   = require('fs');
const path = require('path');
const pool = require('../db');
const club = require('../config/club');
const { cheminMini, genererMini } = require('../utils/logoMini');

async function main() {
  const tout = process.argv.includes('--tout');
  const { rows } = await pool.query(
    `SELECT DISTINCT logo_url FROM clubs WHERE logo_url LIKE '/uploads/logos/%'`);
  const logos = [...new Set([club.logo, ...rows.map(r => r.logo_url)])];

  let faits = 0, aJour = 0, absents = 0, avant = 0, apres = 0;
  for (const url of logos) {
    const source = path.join(__dirname, '..', url);
    if (!fs.existsSync(source)) { absents++; console.warn(`absent : ${url}`); continue; }
    const mini = path.join(__dirname, '..', cheminMini(url));
    if (!tout && fs.existsSync(mini) && fs.statSync(mini).mtimeMs >= fs.statSync(source).mtimeMs) { aJour++; continue; }
    await genererMini(url);
    avant += fs.statSync(source).size;
    apres += fs.statSync(mini).size;
    faits++;
  }
  const ko = (o) => `${Math.round(o / 1024)} Ko`;
  console.log(`${faits} miniature(s) générée(s) (${ko(avant)} → ${ko(apres)}), ${aJour} déjà à jour, ${absents} logo(s) absent(s)`);
}

main()
  .catch(err => { console.error('❌', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
