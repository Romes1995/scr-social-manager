require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Créer le dossier uploads si absent
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middlewares
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173,http://localhost:5174').split(',');
app.use(cors({
  origin: (origin, cb) => (!origin || allowedOrigins.some(o => origin.startsWith(o.trim())) ? cb(null, true) : cb(new Error('CORS'))),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Routes publiques (sans auth, accessibles depuis le site fans)
app.use('/api/public', require('./routes/public'));

// Routes admin
app.use('/api/fff', require('./routes/fff'));
app.use('/api/matches', require('./routes/matches'));
app.use('/api/clubs', require('./routes/clubs'));
app.use('/api/joueurs', require('./routes/joueurs'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/publish', require('./routes/publish'));
app.use('/api/convocation', require('./routes/convocation'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'SCR Social Manager API', timestamp: new Date() });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Erreur interne serveur' });
});

app.listen(PORT, () => {
  console.log(`🚀 SCR Social Manager API démarré sur http://localhost:${PORT}`);
});
