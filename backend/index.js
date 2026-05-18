require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const { authenticateToken } = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 3001;

// Créer le dossier uploads si absent
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middlewares
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || origin.startsWith('http://localhost')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));
app.use('/assets',  express.static(path.join(__dirname, 'assets')));

// ── Routes publiques ──────────────────────────────────────────────────────────
// Accessibles sans token (site fans + login)
app.use('/api/public', require('./routes/public'));
app.use('/api/auth',   require('./routes/auth'));

// Ces routes sont publiques (homepage visible par les visiteurs non connectés)
// Doivent être enregistrées AVANT app.use('/api/matches', authenticateToken, ...)
const matchesRoutes = require('./routes/matches');
app.get('/api/matches/standings',   matchesRoutes.standingsHandler);
app.get('/api/matches/top-scorers', matchesRoutes.topScorersHandler);

// Health check (public)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'SCR Social Manager API', timestamp: new Date() });
});

// ── Routes protégées ──────────────────────────────────────────────────────────
// Toutes nécessitent un JWT valide
app.use('/api/fff',        authenticateToken, require('./routes/fff'));
app.use('/api/matches',    authenticateToken, require('./routes/matches'));
app.use('/api/clubs',      authenticateToken, require('./routes/clubs'));
app.use('/api/joueurs',    authenticateToken, require('./routes/joueurs'));
app.use('/api/templates',  authenticateToken, require('./routes/templates'));
app.use('/api/publish',    authenticateToken, require('./routes/publish'));
app.use('/api/convocation',authenticateToken, require('./routes/convocation'));
app.use('/api/users',      require('./routes/users')); // auth gérée dans le routeur

// ── Handlers génériques ───────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Erreur interne serveur' });
});

app.listen(PORT, () => {
  console.log(`🚀 SCR Social Manager API démarré sur http://localhost:${PORT}`);
});
