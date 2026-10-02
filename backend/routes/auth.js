'use strict';
const express   = require('express');
const router    = express.Router();
const bcrypt    = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db        = require('../db');
const {
  lireSession, signerSession, optionsCookie, COOKIE_NAME, ROLES_AUTORISES,
} = require('../middleware/auth');

const MESSAGE_ECHEC = 'Nom d\'utilisateur ou mot de passe incorrect';

// Hash factice : un nom d'utilisateur inconnu coûte autant qu'un mauvais mot de passe
const HASH_FACTICE = bcrypt.hashSync('mot-de-passe-factice-scr', 12);

// 10 tentatives échouées par 15 minutes et par IP (les connexions réussies ne comptent pas)
const limiteConnexion = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
});

// POST /api/auth/login — { username, mot_de_passe }
router.post('/login', limiteConnexion, async (req, res, next) => {
  const username   = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const motDePasse = typeof req.body?.mot_de_passe === 'string' ? req.body.mot_de_passe : '';
  if (!username || !motDePasse) {
    return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis' });
  }

  try {
    const { rows } = await db.query(
      'SELECT id, username, role, password_hash FROM users WHERE username = $1', [username]);
    const user = rows[0];

    const valide = await bcrypt.compare(motDePasse, user ? user.password_hash : HASH_FACTICE);
    if (!user || !valide) return res.status(401).json({ error: MESSAGE_ECHEC });
    // Rôles fins à venir : seuls les admins ont accès pour l'instant (pas de cookie posé)
    if (!ROLES_AUTORISES.includes(user.role)) {
      return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }

    await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    res.cookie(COOKIE_NAME, signerSession(user), optionsCookie());
    res.json({ user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout — efface le cookie de session
router.post('/logout', (req, res) => {
  const { maxAge, ...options } = optionsCookie();
  res.clearCookie(COOKIE_NAME, options);
  res.json({ message: 'Déconnexion effectuée' });
});

// GET /api/auth/me — utilisateur connecté (sans hash) ou 401
router.get('/me', async (req, res, next) => {
  try {
    const user = await lireSession(req);
    if (!user) return res.status(401).json({ error: 'Non connecté' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
