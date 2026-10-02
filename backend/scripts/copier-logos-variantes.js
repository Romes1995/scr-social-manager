#!/usr/bin/env node
/**
 * Étape 6 : copie le logo d'une variante vers la ligne clubs rattachée à la FFF.
 *
 * Pour chaque club rattaché (fff_cl_no) sans logo_url, cherche les lignes non
 * rattachées du même club (nom compacté identique, ex. « Dalhunden US » pour
 * « Dalhunden U.S »). Si toutes celles qui ont un logo portent le même couple
 * (logo_url, logo_monochrome_url), ce couple est copié. Plusieurs couples
 * différents : rien n'est copié, le cas est listé. Aucune ligne n'est supprimée.
 *
 * Usage :
 *   node scripts/copier-logos-variantes.js              aperçu, aucune écriture
 *   node scripts/copier-logos-variantes.js --appliquer  copie en une transaction
 */

const pool = require('../db');
const { normalizeName } = require('../services/fffImport');

// Sans casse, accents, ponctuation, espaces ni numéro d'équipe final :
// « Dalhunden U.S » et « Dalhunden US » → "dalhundenus"
const nomDeBase = (s) => normalizeName(s).replace(/\s+\d+$/, '').replace(/ /g, '');

async function main() {
  const appliquer = process.argv.includes('--appliquer');
  const { rows } = await pool.query(
    'SELECT id, nom, equipe, fff_cl_no, nom_fff, logo_url, logo_monochrome_url FROM clubs ORDER BY id');

  const cibles    = rows.filter(r => r.fff_cl_no !== null && !r.logo_url);
  const variantes = rows.filter(r => r.fff_cl_no === null && r.logo_url);

  const copies = [];
  const conflits = [];
  for (const c of cibles) {
    const cle = nomDeBase(c.nom_fff || c.nom);
    const sources = variantes.filter(v => nomDeBase(v.nom) === cle || (v.equipe && nomDeBase(v.equipe) === cle));
    if (sources.length === 0) continue;

    const couples = new Map(sources.map(v => [`${v.logo_url}|${v.logo_monochrome_url}`, v]));
    if (couples.size > 1) {
      conflits.push({ cible: c, sources });
      continue;
    }
    copies.push({ cible: c, source: sources[0], variantes: sources.map(v => v.id) });
  }

  console.log(`${appliquer ? 'COPIE' : 'APERÇU (aucune écriture, --appliquer pour copier)'} : ${copies.length} logo(s)`);
  for (const { cible, source, variantes: ids } of copies) {
    console.log(`  #${cible.id} « ${cible.nom} » (cl_no ${cible.fff_cl_no}) ← #${ids.join(', #')} « ${source.nom} »`);
    console.log(`      logo_url            ${source.logo_url}`);
    console.log(`      logo_monochrome_url ${source.logo_monochrome_url ?? 'NULL'}`);
  }
  for (const { cible, sources } of conflits) {
    console.log(`  ⚠️  #${cible.id} « ${cible.nom} » : logos différents sur #${sources.map(s => s.id).join(', #')}, non copié`);
  }

  if (appliquer && copies.length) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { cible, source } of copies) {
        // Garde : la cible n'a toujours pas de logo (rejouable sans effet)
        await client.query(
          `UPDATE clubs SET logo_url = $1, logo_monochrome_url = $2
            WHERE id = $3 AND logo_url IS NULL`,
          [source.logo_url, source.logo_monochrome_url, cible.id]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    // Le cache de l'accueil vit dans le processus du serveur : il expire en 10 min au plus
    console.log('✅ Copie terminée (accueil public à jour sous 10 min, ou au prochain enregistrement d\'un club)');
  }
}

main()
  .catch(err => { console.error('❌', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
