/**
 * Dossier des fichiers servis sous /uploads (logos, photos, visuels générés).
 * UPLOADS_DIR : chemin absolu (Docker : volume persistant) ; par défaut backend/uploads.
 * Seuls index.js, utils/logoMini.js et services/logosFff.js le lisent : les routes
 * d'administration écrivent toujours dans backend/uploads (mode complet).
 */
const path = require('path');

module.exports = {
  UPLOADS_DIR: process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.join(__dirname, '..', 'uploads'),
};
