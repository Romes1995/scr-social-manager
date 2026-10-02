require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const cookieParser = require('cookie-parser');
const path         = require('path');
const fs           = require('fs');
const { requireAuth } = require('./middleware/auth');
const { masquerErreursServeur, gestionnaireErreurs } = require('./middleware/erreurs');

const app  = express();
const PORT = process.env.PORT || 3001;
// Interface d'écoute : 0.0.0.0 en dev, 127.0.0.1 derrière Nginx en production
const HOST = process.env.HOST || '0.0.0.0';

// Origines autorisées (CORS avec cookie de session), séparées par des virgules
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174,http://localhost:5175')
  .split(',').map(o => o.trim()).filter(Boolean);

// Derrière Nginx local : l'IP réelle (limite de tentatives) vient de X-Forwarded-For,
// accepté uniquement quand la requête arrive de la boucle locale
app.set('trust proxy', 'loopback');

// Créer le dossier uploads si absent
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middlewares
app.use(helmet({
  // Les images /uploads sont affichées par la vitrine et l'admin (autres origines)
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  // Origine absente (curl, même origine) : acceptée ; origine inconnue : pas d'en-têtes CORS
  origin: (origin, callback) => callback(null, !origin || CORS_ORIGINS.includes(origin)),
  credentials: true,
}));
app.use(cookieParser());
app.use(masquerErreursServeur);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));
app.use('/assets',  express.static(path.join(__dirname, 'assets')));

// Health check (public)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ── Authentification : tout /api exige une session admin, sauf la liste blanche
// (vitrine /api/public, /api/auth/login|logout|me, /api/health) ─────────────────
app.use('/api', requireAuth);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/public',     require('./routes/public'));
app.use('/api/fff',        require('./routes/fff'));
app.use('/api/matches',    require('./routes/matches'));
app.use('/api/clubs',      require('./routes/clubs'));
app.use('/api/logos-temporaires', require('./routes/logosTemporaires'));
app.use('/api/joueurs',    require('./routes/joueurs'));
app.use('/api/templates',  require('./routes/templates'));
app.use('/api/publish',    require('./routes/publish'));
app.use('/api/convocation',require('./routes/convocation'));
app.use('/api/users',      require('./routes/users'));
app.use('/api/admin',      require('./routes/admin'));

// ── Handlers génériques ───────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

app.use(gestionnaireErreurs);

app.listen(PORT, HOST, () => {
  console.log(`🚀 SCR Social Manager API démarré sur http://${HOST}:${PORT}`);
  // Tâches planifiées FFF (import + classements) — un seul processus (PM2 : fork, 1 instance)
  require('./services/scheduler').start();
});
