'use strict';
/**
 * Authentification de l'API : session par cookie httpOnly contenant un JWT.
 *
 * requireAuth est monté sur /api : toute route exige une session admin, sauf la
 * liste blanche explicite ci-dessous (vitrine publique, connexion, health).
 * Les fichiers statiques /uploads et /assets sont servis hors de /api (publics).
 *
 * Le JWT contient { sub, role, pwv } ; à chaque requête, l'utilisateur est relu
 * en base : un compte supprimé, rétrogradé ou dont le mot de passe a été
 * réinitialisé (empreinte pwv différente) perd immédiatement l'accès.
 */
const crypto = require('crypto');
const jwt    = require('jsonwebtoken');
const db     = require('../db');

const COOKIE_NAME   = 'scr_session';
const SESSION_JOURS = 30;
const ROLES_AUTORISES = ['admin'];   // rôles fins : plus tard

// Liste blanche : [méthode, chemin relatif à /api (exact ou préfixe se terminant par /)]
const LISTE_BLANCHE = [
  ['GET',  '/public/'],
  ['POST', '/auth/login'],
  ['POST', '/auth/logout'],
  ['GET',  '/auth/me'],
  ['GET',  '/health'],
];

function estPublique(req) {
  return LISTE_BLANCHE.some(([methode, chemin]) =>
    (req.method === methode || (methode === 'GET' && req.method === 'HEAD'))
    && (chemin.endsWith('/') ? req.path.startsWith(chemin) : req.path === chemin));
}

// Empreinte courte du hash : change dès que le mot de passe est réinitialisé
function empreinteMotDePasse(passwordHash) {
  return crypto.createHash('sha256').update(passwordHash).digest('base64url').slice(0, 16);
}

function secretJwt() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET absent ou trop court (32 caractères minimum)');
  }
  return secret;
}

function signerSession(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, pwv: empreinteMotDePasse(user.password_hash) },
    secretJwt(),
    { expiresIn: `${SESSION_JOURS}d` }
  );
}

function optionsCookie() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
    path:     '/',
    maxAge:   SESSION_JOURS * 24 * 60 * 60 * 1000,
  };
}

/**
 * Lit et valide la session du cookie. Retourne l'utilisateur { id, username, role }
 * ou null (pas de cookie, jeton invalide/expiré, compte supprimé, mot de passe changé).
 */
async function lireSession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;

  let payload;
  try {
    payload = jwt.verify(token, secretJwt());
  } catch {
    return null;
  }

  const { rows } = await db.query(
    'SELECT id, username, role, password_hash FROM users WHERE id = $1', [payload.sub]);
  const user = rows[0];
  if (!user || empreinteMotDePasse(user.password_hash) !== payload.pwv) return null;

  return { id: user.id, username: user.username, role: user.role };
}

async function requireAuth(req, res, next) {
  if (estPublique(req)) return next();
  try {
    const user = await lireSession(req);
    if (!user) return res.status(401).json({ error: 'Authentification requise' });
    if (!ROLES_AUTORISES.includes(user.role)) {
      return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentification requise' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Accès refusé' });
    next();
  };
}

module.exports = {
  requireAuth, requireRole, lireSession, signerSession, optionsCookie,
  empreinteMotDePasse, COOKIE_NAME, ROLES_AUTORISES,
};
