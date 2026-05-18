'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const db     = require('../db');

async function seedAdmin() {
  const username = 'admin';
  const password = 'Admin1234!';
  const role     = 'admin';

  console.log('Hachage du mot de passe...');
  const hash = await bcrypt.hash(password, 12);

  const { rows } = await db.query(
    `INSERT INTO users (username, password_hash, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role          = EXCLUDED.role
     RETURNING id, username, role`,
    [username, hash, role]
  );

  console.log('Compte admin créé/mis à jour :', rows[0]);
  console.log('');
  console.log('Identifiants : admin / Admin1234!');
  console.log('CHANGEZ ce mot de passe dès la première connexion.');
  process.exit(0);
}

seedAdmin().catch(err => {
  console.error('Erreur seed:', err.message);
  process.exit(1);
});
