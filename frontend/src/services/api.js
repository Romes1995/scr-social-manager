import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

// Intercepteur pour logger les erreurs
api.interceptors.response.use(
  (res) => res,
  (err) => {
    console.error('[API Error]', err.config?.url, err.response?.data || err.message);
    return Promise.reject(err);
  }
);

// --- Matches ---
export const getMatches = (params) => api.get('/matches', { params });
export const getMatch = (id) => api.get(`/matches/${id}`);
export const createMatch = (data) => api.post('/matches', data);
export const updateMatch = (id, data) => api.put(`/matches/${id}`, data);
export const deleteMatch = (id) => api.delete(`/matches/${id}`);
export const updateScore = (id, data) => api.patch(`/matches/${id}/score`, data);
export const finMatch = (id) => api.post(`/matches/${id}/fin`);
export const startMatch = (id) => api.post(`/matches/${id}/start`);

// --- FFF ---
export const importFFF = () => api.get('/fff/import');
export const saveFFFMatches = (matchs) => api.post('/fff/save', { matchs });

// --- Clubs ---
export const getClubs = () => api.get('/clubs');
export const createClub = (data) => api.post('/clubs', data);
export const updateClub = (id, data) => api.put(`/clubs/${id}`, data);
export const deleteClub = (id) => api.delete(`/clubs/${id}`);

// --- Joueurs ---
export const getJoueurs = () => api.get('/joueurs');
export const createJoueur = (data) => api.post('/joueurs', data);
export const updateJoueur = (id, data) => api.put(`/joueurs/${id}`, data);
export const deleteJoueur = (id) => api.delete(`/joueurs/${id}`);

// --- Templates ---
export const getTemplates = (params) => api.get('/templates', { params });
export const createTemplate = (formData) => api.post('/templates', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
});
export const updateTemplate = (id, data) => api.put(`/templates/${id}`, data);
export const deleteTemplate = (id) => api.delete(`/templates/${id}`);
export const genererImage = (id, valeurs) => api.post(`/templates/${id}/generer`, { valeurs });

// --- Publish ---
export const publishFacebook = (data) => api.post('/publish/facebook', data);
export const publishInstagram = (data) => api.post('/publish/instagram', data);
export const publishBoth = (data) => api.post('/publish/both', data);
export const getPublications = () => api.get('/publish/programmes');

export default api;
