import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001/api`;

const api = axios.create({ baseURL: API_BASE, timeout: 15000 });

export const getScoreLive    = () => api.get('/public/score-live');
export const getPublicMatchs = () => api.get('/public/matchs');
export const getButeurs      = () => api.get('/public/buteurs');
export const getClassement   = () => api.get('/public/classement');

export const API_BASE_URL = API_BASE.replace('/api', '');
