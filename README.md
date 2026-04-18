# SCR Social Manager

Outil de gestion des réseaux sociaux pour le **SC Roeschwoog**, club de football alsacien.

## Fonctionnalités

- **Programme** : Import FFF, CRUD des matchs, regroupement par week-end, déduplication
- **Score Live** : Score en temps réel, gestion buteurs, stories automatiques (0-0, buts, fin de match)
- **Résultats** : Historique et bilan de saison, génération de visuels
- **Effectif** : Trombinoscope des joueurs (photos, catégories, âges)
- **Listes** : Clubs adversaires & logos, modèles visuels
- **Publication Meta** : Facebook & Instagram (posts + stories via Graph API v19.0)

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Backend | Node.js 20 + Express |
| Base de données | PostgreSQL 14+ |
| Frontend | React 18 + Vite |
| Génération d'images | Sharp + Bebas Neue |
| Upload | Multer |
| Process manager | PM2 |

---

## Prérequis

- Ubuntu 22.04 LTS (ou 20.04 LTS)
- Node.js 20+ — installé automatiquement
- PostgreSQL 14+ — installé automatiquement
- Git, curl — pré-installés sur Ubuntu

---

## Installation en une commande

```bash
git clone https://github.com/Romes1995/scr-social-manager.git
cd scr-social-manager
bash install.sh
```

Le script `install.sh` automatise :

1. Mise à jour apt
2. Installation Node.js 20 via NodeSource
3. Installation PostgreSQL
4. Création de la base `scr_social_manager` avec un utilisateur dédié
5. Import du schéma SQL
6. Configuration du `backend/.env` depuis `.env.example`
7. Installation des dépendances npm (backend + frontend)
8. Build du frontend (Vite → `frontend/dist/`)
9. Installation de PM2 + `serve`
10. Lancement de l'app avec PM2 + démarrage automatique au boot

À la fin de l'installation, le script affiche :

```
╔══════════════════════════════════════════════════════════════════╗
║   ✅  SCR Social Manager installé avec succès !                  ║
╠══════════════════════════════════════════════════════════════════╣
║   Backend API  : http://X.X.X.X:3001                            ║
║   Frontend     : http://X.X.X.X:8080                            ║
║   Base de données : scr_social_manager / scr_user / <mdp>       ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## Configuration du .env

Après installation, éditer `backend/.env` pour configurer les tokens Meta :

```env
PORT=3001

# PostgreSQL (rempli automatiquement par install.sh)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=scr_social_manager
DB_USER=scr_user
DB_PASSWORD=<généré automatiquement>

# URL publique pour les uploads (ngrok ou domaine)
# Requis pour que les publications Meta fonctionnent
PUBLIC_URL=https://votre-domaine.fr

# Meta / Facebook & Instagram (voir GUIDE_META_API.md)
META_APP_ID=
FACEBOOK_PAGE_ID=
FACEBOOK_PAGE_ACCESS_TOKEN=
INSTAGRAM_BUSINESS_ACCOUNT_ID=

# CORS
FRONTEND_URL=http://X.X.X.X:8080
```

> Voir **GUIDE_META_API.md** pour obtenir les tokens Facebook et Instagram.

---

## Mise à jour

```bash
bash update.sh
```

Le script `update.sh` :
1. `git pull origin main`
2. `npm install` dans `backend/`
3. `npm install && npm run build` dans `frontend/`
4. Applique les migrations schema (idempotent)
5. `pm2 restart all`

---

## Accès

| Service | URL |
|---------|-----|
| Frontend | `http://IP_SERVEUR:8080` |
| Backend API | `http://IP_SERVEUR:3001` |
| Logs | `pm2 logs scr-backend` |
| Statut | `pm2 status` |

---

## API Endpoints principaux

### Matchs
```
GET    /api/matches                 Liste (filtres: statut, equipe)
POST   /api/matches                 Créer (avec déduplication)
PUT    /api/matches/:id             Modifier
DELETE /api/matches/:id             Supprimer
PATCH  /api/matches/:id/score       Score live
POST   /api/matches/:id/start       Démarrer
POST   /api/matches/:id/fin         Terminer
POST   /api/matches/:id/reset       Réinitialiser (0-0, programmé)
```

### Templates & Génération d'images
```
POST /api/templates/generate-programme       Visuels programme (1–4 matchs)
POST /api/templates/generate-score-live      Story score live
POST /api/templates/generate-fin-match       Story fin de match
POST /api/templates/generate-resultats       Visuels résultats
POST /api/templates/score-live/:num          Upload template score live
POST /api/templates/resultat/:num            Upload template résultats
```

### Publication Meta
```
POST /api/publish/facebook      Post ou story Facebook
POST /api/publish/instagram     Post ou story Instagram
POST /api/publish/both          Les deux simultanément
```

### Clubs & Joueurs
```
POST /api/clubs/scr-logo                Upload logo SCR couleur
POST /api/clubs/scr-logo-monochrome     Upload logo SCR monochrome
GET  /api/joueurs                       Liste avec ddn, categorie, photo
```

---

## Structure du projet

```
scr-social-manager/
├── install.sh                   # Installation automatique Ubuntu
├── update.sh                    # Mise à jour
├── requirements.txt             # Prérequis système
├── GUIDE_META_API.md            # Guide tokens Facebook/Instagram
├── backend/
│   ├── database/
│   │   ├── schema.sql           # Schéma PostgreSQL (à jour)
│   │   └── seed.sql             # Données initiales (clubs)
│   ├── routes/                  # API Express
│   ├── utils/
│   │   ├── imageGenerator.js    # Génération visuels Sharp
│   │   └── ensureClub.js        # Auto-création clubs adversaires
│   ├── fonts/
│   │   └── BebasNeue-Regular.ttf
│   ├── uploads/                 # Logos, templates, images générées
│   ├── scripts/                 # Scripts test et utilitaires
│   ├── db.js
│   ├── index.js
│   └── .env.example
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Programme.jsx    # Matchs à venir
│       │   ├── ScoreLive.jsx    # Score en temps réel
│       │   ├── Resultats.jsx    # Résultats
│       │   ├── Effectif.jsx     # Trombinoscope joueurs
│       │   ├── Listes.jsx       # Clubs, logos, modèles
│       │   └── Templates.jsx    # Gestion templates
│       ├── services/
│       │   └── api.js           # URL dynamique (hostname)
│       └── App.jsx
└── scripts/
    ├── start-mobile.sh          # Tunnel ngrok pour accès mobile
    └── start-tunnel.sh
```

---

## Développement local

```bash
# Backend
cd backend && npm run dev      # http://localhost:3001

# Frontend
cd frontend && npm run dev     # http://localhost:5173

# Accès mobile (même réseau Wi-Fi)
bash scripts/start-mobile.sh  # Tunnel ngrok backend + frontend réseau local
```

---

## Crédits

Développé pour le **SC Roeschwoog** ⚽ — Alsace, France
