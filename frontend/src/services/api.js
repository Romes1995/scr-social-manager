import axios from 'axios';

// Utilise VITE_API_URL si défini, sinon construit l'URL dynamiquement
// à partir du hostname courant → fonctionne depuis localhost ET depuis un téléphone (192.168.x.x, ngrok, etc.)
const API_BASE = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001/api`;

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
export const resetMatch = (id) => api.post(`/matches/${id}/reset`);

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
export const generateProgramme = (matchs) => api.post('/templates/generate-programme', { matchs }, { timeout: 30000 });
export const generateScoreLive = (match_id) => api.post('/templates/generate-score-live', { match_id }, { timeout: 30000 });
export const generateFinMatch = (match_id) => api.post('/templates/generate-fin-match', { match_id }, { timeout: 30000 });
export const generateResultats = (matchs) => api.post('/templates/generate-resultats', { matchs }, { timeout: 30000 });
export const getScoreLiveTemplateStatus = () => api.get('/templates/score-live/status');
export const getResultatsTemplateStatus = () => api.get('/templates/resultats/status');
export const uploadScoreLiveTemplate = (num, formData) => api.post(`/templates/score-live/${num}`, formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  timeout: 60000,
});
export const uploadResultatTemplate = (num, formData) => api.post(`/templates/resultat/${num}`, formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  timeout: 60000,
});

// --- Logos clubs ---
export const uploadClubLogo = (id, formData) => api.post(`/clubs/${id}/logo`, formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
});
export const uploadScrLogo = (formData) => api.post('/clubs/scr-logo', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
});
export const uploadScrLogoMono = (formData) => api.post('/clubs/scr-logo-monochrome', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
});
export const bulkUploadLogos = (formData) => api.post('/clubs/bulk-upload', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
});
export const saveLogoAssociations = (associations) => api.post('/clubs/save-logo-associations', { associations });

// --- Joueurs Excel ---
export const previewExcel = (formData) => api.post('/joueurs/preview-excel', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
});
export const confirmImportJoueurs = (joueurs) => api.post('/joueurs/confirm-import', { joueurs });
export const uploadCelebrationVideo = (id, formData) => api.post(`/joueurs/${id}/celebration`, formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  timeout: 60000,
});

export const API_BASE_URL = API_BASE.replace('/api', '');

// --- Publish ---
export const publishFacebook = (data) => api.post('/publish/facebook', data);
export const publishInstagram = (data) => api.post('/publish/instagram', data);
export const publishBoth = (data) => api.post('/publish/both', data);
export const getPublications = () => api.get('/publish/programmes');

export default api;
