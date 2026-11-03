/**
 * Schéma PostgreSQL appliqué au démarrage (index.js, avant l'écoute et le scheduler)
 *
 *  - database/schema.sql : schéma complet, idempotent (IF NOT EXISTS) ; crée tout
 *    sur une base vide et ne change rien sur une base à jour.
 *  - migrations/NNN_*.sql à partir de 007 : idempotentes, rejouées à chaque démarrage
 *    (001 à 006 sont déjà intégrées à schema.sql).
 *
 * Une seule transaction, sous verrou consultatif : deux processus qui démarrent
 * ensemble n'appliquent pas le schéma en même temps. En cas d'erreur, rien n'est
 * appliqué et le démarrage échoue.
 */

const fs   = require('fs');
const path = require('path');
const pool = require('../db');

const SCHEMA         = path.join(__dirname, 'schema.sql');
const MIGRATIONS     = path.join(__dirname, '..', 'migrations');
const PREMIERE_RELUE = 7;
const VERROU         = 504189;   // clé du verrou consultatif (numéro d'affiliation SCR)

function migrationsARejouer() {
  return fs.readdirSync(MIGRATIONS)
    .filter(f => /^\d{3}_.+\.sql$/.test(f) && parseInt(f, 10) >= PREMIERE_RELUE)
    .sort();
}

async function initSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [VERROU]);

    const { rows } = await client.query(`SELECT to_regclass('public.matches') IS NULL AS vide`);
    const vide = rows[0].vide;

    await client.query(fs.readFileSync(SCHEMA, 'utf8'));
    const migrations = migrationsARejouer();
    for (const f of migrations) {
      await client.query(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
    }

    await client.query('COMMIT');
    console.log(`[Schéma] ${vide ? 'Base vide : schéma créé' : 'Schéma vérifié'}` +
                (migrations.length ? ` (migrations ${migrations.join(', ')})` : ''));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { initSchema };
