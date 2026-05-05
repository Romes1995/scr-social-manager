import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

const api = axios.create({ baseURL: API_BASE, timeout: 15000 });

api.interceptors.response.use(
  r => r,
  err => { console.error('[API]', err.config?.url, err.response?.status, err.message); return Promise.reject(err); }
);

export const getScoreLive           = () => api.get('/public/score-live');
export const getPublicMatchs        = () => api.get('/public/matchs');
export const getButeurs             = () => api.get('/public/buteurs');
export const getClassement          = () => api.get('/public/classement');
export const getButeursParEquipe    = () => api.get('/public/buteurs-par-equipe');
export const getClassementParEquipe = () => api.get('/public/classement-par-equipe');
export const getCarousel            = (teamId) => api.get(`/public/carousel/${teamId}`);

export const API_BASE_URL = API_BASE.replace('/api', '');
