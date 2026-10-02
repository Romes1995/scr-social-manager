'use strict';
/**
 * Aucune information interne (err.message, détail SQL, pile) ne part vers le client.
 *
 * masquerErreursServeur : filtre res.json pour toute réponse 5xx déjà construite par
 *   une route (beaucoup renvoient encore { error: err.message }) : le détail est
 *   loggé côté serveur ; un 500 reçoit un message générique ; les autres 5xx
 *   (502/503 de l'import FFF, messages rédigés) gardent `error` mais perdent `detail`.
 * gestionnaireErreurs : gestionnaire Express final pour les erreurs levées.
 */

const MESSAGE_GENERIQUE = 'Erreur interne du serveur';

function masquerErreursServeur(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 500) {
      console.error(`[${res.statusCode}] ${req.method} ${req.originalUrl} →`, JSON.stringify(body));
      const message = res.statusCode === 500 || typeof body?.error !== 'string'
        ? MESSAGE_GENERIQUE
        : body.error;
      return json({ error: message });
    }
    return json(body);
  };
  next();
}

// eslint-disable-next-line no-unused-vars
function gestionnaireErreurs(err, req, res, next) {
  // Erreurs de requête levées par Express / body-parser : statut 4xx, message neutre
  const status = err.status || err.statusCode;
  if (status >= 400 && status < 500) {
    console.warn(`[${status}] ${req.method} ${req.originalUrl} :`, err.message);
    return res.status(status).json({ error: status === 413 ? 'Requête trop volumineuse' : 'Requête invalide' });
  }

  console.error(`[500] ${req.method} ${req.originalUrl} :`, err.stack || err);
  if (res.headersSent) return;
  res.status(500).json({ error: MESSAGE_GENERIQUE });
}

module.exports = { masquerErreursServeur, gestionnaireErreurs, MESSAGE_GENERIQUE };
