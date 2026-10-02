import axios from 'axios';

// URL de l'API : VITE_API_URL (.env), repli sur le backend local
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({ baseURL: API_BASE, timeout: 15000 });

api.interceptors.response.use(
  r => r,
  err => { console.error('[API]', err.config?.url, err.response?.status, err.message); return Promise.reject(err); }
);

export const getScoreLive           = () => api.get('/public/score-live');
export const getPublicMatchs        = () => api.get('/public/matchs');
export const getButeurs             = () => api.get('/public/buteurs');
export const getButeursParEquipe    = () => api.get('/public/buteurs-par-equipe');
export const getClassementParEquipe = () => api.get('/public/classement-par-equipe');
export const getCarousel            = (teamId) => api.get(`/public/carousel/${teamId}`);
export const getVitrineData         = (teamId) => api.get(`/public/vitrine/${teamId}`);
export const getAccueil             = () => api.get('/public/accueil');

export const API_BASE_URL = API_BASE.replace(/\/api\/?$/, '');

// Chemins servis par le backend (/uploads/…) préfixés par l'URL de l'API
export const urlImage = (chemin) => (chemin && chemin.startsWith('/uploads') ? `${API_BASE_URL}${chemin}` : chemin);
