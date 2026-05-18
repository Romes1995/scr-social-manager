'use strict';
const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const auth  = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token manquant' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Token expiré' : 'Token invalide';
    return res.status(401).json({ error: msg });
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès refusé : rôle insuffisant' });
    }
    next();
  };
}

module.exports = { authenticateToken, requireRole };
