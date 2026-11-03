/**
 * VITE_MODE=vitrine (build de deploy/) : vitrine publique seule, sans le score live
 * ni les buteurs (données saisies dans l'admin, absentes de ce déploiement).
 * Distinct de import.meta.env.MODE (development / production) de Vite.
 */
export const VITRINE = import.meta.env.VITE_MODE === 'vitrine';
