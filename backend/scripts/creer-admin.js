#!/usr/bin/env node
'use strict';
/**
 * Crée ou réinitialise un compte administrateur.
 *
 *   cd backend && npm run creer-admin
 *
 * Demande le nom d'utilisateur puis le mot de passe (deux fois, sans l'afficher).
 * Compte inexistant : création avec le rôle admin.
 * Compte existant   : nouveau mot de passe et rôle repassé à admin ; ses sessions
 *                     ouvertes sont invalidées (empreinte du mot de passe dans le JWT).
 * Seule façon de créer le premier compte : l'API n'accepte aucune création sans session.
 */
const path     = require('path');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const pool   = require('../db');

const LONGUEUR_MIN = 12;

function question(texte) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(texte, r => { rl.close(); resolve(r); }));
}

// Saisie masquée : rien n'est affiché pendant la frappe
function questionMasquee(texte) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) return reject(new Error('Ce script doit être lancé dans un terminal interactif'));

    stdout.write(texte);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let saisie = '';
    const onData = (ch) => {
      switch (ch) {
        case '\r':
        case '\n':
        case '\u0004':                       // Entrée / Ctrl+D
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          stdout.write('\n');
          resolve(saisie);
          break;
        case '\u0003':                       // Ctrl+C
          stdin.setRawMode(false);
          stdout.write('\n');
          process.exit(130);
          break;
        case '\u007f':                       // Retour arrière
        case '\b':
          saisie = saisie.slice(0, -1);
          break;
        default:
          saisie += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  console.log('Création ou réinitialisation d\'un compte administrateur SCR\n');

  const username = (await question('Nom d\'utilisateur : ')).trim();
  if (!username || username.length > 50) throw new Error('Nom d\'utilisateur requis (50 caractères maximum)');

  const { rows } = await pool.query('SELECT id, role FROM users WHERE username = $1', [username]);
  const existant = rows[0];
  console.log(existant
    ? `Compte existant (rôle actuel : ${existant.role}) : le mot de passe sera réinitialisé.`
    : 'Nouveau compte : il sera créé avec le rôle admin.');

  const mdp = await questionMasquee(`Mot de passe (${LONGUEUR_MIN} caractères minimum) : `);
  if (mdp.length < LONGUEUR_MIN) throw new Error(`Mot de passe trop court (${LONGUEUR_MIN} caractères minimum)`);
  const confirmation = await questionMasquee('Confirmer le mot de passe : ');
  if (mdp !== confirmation) throw new Error('Les deux mots de passe ne correspondent pas');

  const hash = await bcrypt.hash(mdp, 12);
  if (existant) {
    await pool.query("UPDATE users SET password_hash = $1, role = 'admin' WHERE id = $2", [hash, existant.id]);
    console.log(`\n✅ Mot de passe de « ${username} » réinitialisé (rôle admin). Ses sessions ouvertes sont invalidées.`);
  } else {
    await pool.query("INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')", [username, hash]);
    console.log(`\n✅ Compte admin « ${username} » créé.`);
  }
}

main()
  .catch(err => { console.error(`\n❌ ${err.message}`); process.exitCode = 1; })
  .finally(() => pool.end());
