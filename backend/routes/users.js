'use strict';
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const db      = require('../db');

const ROLES = ['admin', 'gestionnaire', 'coach', 'score_live'];

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, username, role, created_at, last_login FROM users ORDER BY created_at'
    );
    res.json(rows);
  } catch (err) {
    console.error('[users/list]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/users
router.post('/', async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'username, password et role requis' });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: `Rôle invalide. Valeurs : ${ROLES.join(', ')}` });
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await db.query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, username, role, created_at`,
      [username.trim(), hash, role]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ce nom d\'utilisateur existe déjà' });
    }
    console.error('[users/create]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/users/:id  (modification du rôle uniquement)
router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { role } = req.body;

  if (!role || !ROLES.includes(role)) {
    return res.status(400).json({ error: `Rôle invalide. Valeurs : ${ROLES.join(', ')}` });
  }

  try {
    const { rows } = await db.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, role',
      [role, id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[users/update]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    const { rowCount } = await db.query('DELETE FROM users WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    res.json({ message: 'Utilisateur supprimé' });
  } catch (err) {
    console.error('[users/delete]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
