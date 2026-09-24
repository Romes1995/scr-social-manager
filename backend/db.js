const { Pool, types } = require('pg');
require('dotenv').config();

// Garde les champs DATE PostgreSQL comme strings 'YYYY-MM-DD' au lieu de les
// convertir en Date JS (qui décale d'un jour à cause du fuseau Europe/Paris → UTC)
types.setTypeParser(1082, val => val);

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'scr_social_manager',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

pool.on('connect', () => {
  console.log('✅ Connecté à PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ Erreur PostgreSQL:', err.message);
});

module.exports = pool;
