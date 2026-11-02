/**
 * Utilitaire partagé : création automatique d'un club adversaire.
 * "AS Gambsheim 2" → ligne nom="AS Gambsheim" equipe="AS Gambsheim" (équipe 1)
 *                   + ligne nom="AS Gambsheim" equipe="AS Gambsheim 2"
 */
const pool = require('../db');

async function ensureAdversaireClub(adversaire) {
  if (!adversaire) return;
  const full     = String(adversaire).trim();
  const numbered = full.match(/^(.+?)\s+(\d+)$/);
  const baseName = numbered ? numbered[1].trim() : full;

  try {
    // Nom d'un club absorbé par une fusion (club_aliases) : rien à créer
    const alias = await pool.query(
      'SELECT 1 FROM club_aliases WHERE LOWER(TRIM(alias)) IN (LOWER($1), LOWER($2)) LIMIT 1',
      [baseName, full]
    );
    if (alias.rows.length > 0) return;

    // Équipe de base (sans numéro)
    const existBase = await pool.query(
      `SELECT id FROM clubs
       WHERE LOWER(TRIM(nom))=LOWER($1)
         AND (equipe IS NULL OR LOWER(TRIM(equipe))=LOWER($1))
       LIMIT 1`,
      [baseName]
    );
    if (existBase.rows.length === 0) {
      await pool.query('INSERT INTO clubs (nom, equipe) VALUES ($1, $2)', [baseName, baseName]);
    }

    // Équipe numérotée (si différente du nom de base)
    if (numbered && full !== baseName) {
      const existTeam = await pool.query(
        `SELECT id FROM clubs
         WHERE LOWER(TRIM(nom))=LOWER($1)
           AND LOWER(TRIM(equipe))=LOWER($2)
         LIMIT 1`,
        [baseName, full]
      );
      if (existTeam.rows.length === 0) {
        await pool.query('INSERT INTO clubs (nom, equipe) VALUES ($1, $2)', [baseName, full]);
      }
    }
  } catch (err) {
    console.error('[ensureAdversaireClub]', err.message);
  }
}

module.exports = { ensureAdversaireClub };
