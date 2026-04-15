# SCR Social Manager

Outil de gestion des réseaux sociaux pour le **SC Roeschwoog**, club de football alsacien.

## Fonctionnalités

- **Import FFF** : Scraping des matchs depuis epreuves.fff.fr
- **Programme** : CRUD des matchs à venir avec publication réseaux sociaux
- **Score Live** : Mise à jour en temps réel du score + gestion buteurs
- **Résultats** : Historique et bilan de saison
- **Templates** : Upload d'images + définition de zones de texte + génération
- **Listes** : Clubs adversaires & joueurs SCR
- **Publication Meta** : Préparé pour Facebook & Instagram (mock en beta)

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Backend | Node.js + Express |
| Base de données | PostgreSQL |
| Frontend | React + Vite |
| Image | Sharp |
| Upload | Multer |

---

## Installation

### Prérequis

- Node.js >= 18
- PostgreSQL >= 14
- npm >= 9

### 1. Cloner le projet

```bash
git clone <url>
cd scr-social-manager
```

### 2. Base de données PostgreSQL

```bash
# Créer la base de données
psql -U postgres -c "CREATE DATABASE scr_social_manager;"

# Créer les tables
psql -U postgres -d scr_social_manager -f backend/database/schema.sql

# Injecter les données initiales
psql -U postgres -d scr_social_manager -f backend/database/seed.sql
```

### 3. Backend

```bash
cd backend

# Copier et configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos paramètres PostgreSQL

# Installer les dépendances
npm install

# Démarrer en mode développement
npm run dev

# Démarrer en production
npm start
```

Le backend démarre sur http://localhost:3001

### 4. Frontend

```bash
cd frontend

# Copier et configurer
cp .env.example .env

# Installer les dépendances
npm install

# Démarrer en développement
npm run dev

# Build production
npm run build
```

Le frontend démarre sur http://localhost:5173

---

## Variables d'environnement

### Backend (`backend/.env`)

```env
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=scr_social_manager
DB_USER=postgres
DB_PASSWORD=yourpassword
UPLOADS_DIR=./uploads
FFF_URL=https://epreuves.fff.fr/competition/club/504189-s-c-roeschwoog/information.html
FRONTEND_URL=http://localhost:5173

# Meta (optionnel, pour la v1)
META_APP_ID=
META_APP_SECRET=
META_ACCESS_TOKEN=
FACEBOOK_PAGE_ID=
INSTAGRAM_ACCOUNT_ID=
```

### Frontend (`frontend/.env`)

```env
VITE_API_URL=http://localhost:3001/api
```

---

## API Endpoints

### Matchs
```
GET    /api/matches              Liste des matchs (filtres: statut, equipe)
POST   /api/matches              Créer un match
GET    /api/matches/:id          Détail d'un match
PUT    /api/matches/:id          Modifier un match
DELETE /api/matches/:id          Supprimer un match
PATCH  /api/matches/:id/score    Mise à jour score live
POST   /api/matches/:id/fin      Terminer un match
POST   /api/matches/:id/start    Démarrer un match
```

### FFF
```
GET  /api/fff/import    Scraper les matchs depuis epreuves.fff.fr
POST /api/fff/save      Sauvegarder des matchs importés
```

### Clubs & Joueurs
```
GET/POST        /api/clubs
GET/PUT/DELETE  /api/clubs/:id
GET/POST        /api/joueurs
GET/PUT/DELETE  /api/joueurs/:id
```

### Templates
```
GET/POST              /api/templates
GET/PUT/DELETE        /api/templates/:id
POST                  /api/templates/:id/generer
```

### Publication (mock beta)
```
POST /api/publish/facebook
POST /api/publish/instagram
POST /api/publish/both
GET  /api/publish/programmes
```

---

## Structure du projet

```
scr-social-manager/
├── backend/
│   ├── database/
│   │   ├── schema.sql          # Schéma PostgreSQL
│   │   └── seed.sql            # Données initiales
│   ├── routes/
│   │   ├── fff.js              # Import FFF
│   │   ├── matches.js          # CRUD matchs + score live
│   │   ├── clubs.js            # CRUD clubs
│   │   ├── joueurs.js          # CRUD joueurs
│   │   ├── templates.js        # Gestion templates + génération image
│   │   └── publish.js          # Publication Meta (mock)
│   ├── uploads/                # Fichiers uploadés
│   ├── db.js                   # Connexion PostgreSQL
│   ├── index.js                # Serveur Express
│   └── .env.example
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Programme.jsx   # Gestion matchs à venir
│       │   ├── ScoreLive.jsx   # Score en temps réel
│       │   ├── Resultats.jsx   # Historique résultats
│       │   ├── Templates.jsx   # Gestion templates
│       │   └── Listes.jsx      # Clubs & joueurs
│       ├── components/
│       │   └── Header.jsx
│       ├── services/
│       │   └── api.js          # Appels API centralisés
│       └── App.jsx
└── README.md
```

---

## Notes beta

- La publication Facebook/Instagram retourne un **mock** (pas de vraie connexion à l'API Meta)
- Le scraping FFF peut être limité si le site utilise du JavaScript côté client
- Pour activer Meta : configurer les variables `META_*` dans `.env` et implémenter `routes/publish.js`

## Crédits

Développé pour le **SC Roeschwoog** ⚽ — Alsace, France
