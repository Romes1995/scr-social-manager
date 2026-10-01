-- SCR Social Manager - Schema PostgreSQL

CREATE TABLE IF NOT EXISTS clubs (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  equipe VARCHAR(50),
  logo_url TEXT,
  logo_monochrome_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS joueurs (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(50) NOT NULL,
  prenom VARCHAR(50) NOT NULL,
  ddn DATE,
  categorie VARCHAR(30),
  photo VARCHAR(255),
  video_celebration_url TEXT,
  celebration_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matches (
  id SERIAL PRIMARY KEY,
  equipe VARCHAR(50) NOT NULL,
  adversaire VARCHAR(100) NOT NULL,
  logo_adversaire TEXT,
  date DATE,
  heure TIME,
  lieu VARCHAR(200),
  domicile BOOLEAN DEFAULT true,
  division VARCHAR(50),
  score_scr INTEGER DEFAULT 0,
  score_adv INTEGER DEFAULT 0,
  buteurs TEXT[] DEFAULT '{}',
  tab_domicile INTEGER,
  tab_exterieur INTEGER,
  statut VARCHAR(20) DEFAULT 'programme',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  -- Rattachement FFF / DOFA (migrations/001_etape1_fff.sql)
  fff_match_id INTEGER,                         -- ma_no DOFA
  journee INTEGER,                              -- poule_journee.number
  competition_type VARCHAR(5),                  -- CH (championnat) / CP (coupe)
  score_source VARCHAR(10),                     -- 'app' | 'fff' | NULL (pas de score)
  score_fff_at TIMESTAMPTZ,                     -- publication / confirmation du score par la FFF
  terrain_nom VARCHAR(150),
  terrain_adresse VARCHAR(200),
  terrain_cp VARCHAR(10),
  terrain_ville VARCHAR(100),
  fff_resultat VARCHAR(2),                      -- GA / PE / NU, vu côté SCR
  forfait_scr BOOLEAN NOT NULL DEFAULT false,
  forfait_adv BOOLEAN NOT NULL DEFAULT false,
  reporte BOOLEAN NOT NULL DEFAULT false,
  fff_updated_at TIMESTAMPTZ,                   -- external_updated_at DOFA
  -- Poule DOFA (migrations/002_classements.sql)
  fff_cp_no INTEGER,                            -- competition.cp_no
  fff_phase_no INTEGER,                         -- phase.number
  fff_poule_no INTEGER,                         -- poule.stage_number
  poule_nom VARCHAR(50),                        -- poule.name
  CONSTRAINT statut_check CHECK (statut IN ('programme', 'en_cours', 'termine')),
  CONSTRAINT matches_unique_equipe_date_adversaire UNIQUE (equipe, date, adversaire),
  CONSTRAINT matches_fff_match_id_key UNIQUE (fff_match_id),
  CONSTRAINT matches_score_source_check CHECK (score_source IN ('app', 'fff'))
);

-- Classements de championnat FFF (migrations/002_classements.sql)
-- Remplacés en bloc par équipe par services/fffClassement.js (refreshClassements)
CREATE TABLE IF NOT EXISTS classements (
  id SERIAL PRIMARY KEY,
  equipe VARCHAR(10) NOT NULL,                  -- 'SCR 1'
  saison INTEGER NOT NULL,                      -- 2026 = saison 2026-2027
  division VARCHAR(100),
  fff_cp_no INTEGER NOT NULL,
  fff_phase_no INTEGER NOT NULL,
  fff_poule_no INTEGER NOT NULL,                -- poule.stage_number
  poule_nom VARCHAR(50),
  rang INTEGER NOT NULL,
  club VARCHAR(100) NOT NULL,
  club_cl_no INTEGER NOT NULL,
  club_equipe_no INTEGER NOT NULL DEFAULT 1,    -- equipe.code (1, 2, 3…)
  logo_url TEXT,
  points INTEGER NOT NULL,
  joues INTEGER NOT NULL,
  victoires INTEGER NOT NULL,
  nuls INTEGER NOT NULL,
  defaites INTEGER NOT NULL,
  forfaits INTEGER NOT NULL DEFAULT 0,
  penalites INTEGER NOT NULL DEFAULT 0,
  buts_pour INTEGER NOT NULL,
  buts_contre INTEGER NOT NULL,
  diff INTEGER NOT NULL,                        -- buts_pour - buts_contre (signé)
  is_scr BOOLEAN NOT NULL DEFAULT false,
  journee INTEGER,                              -- valeur la plus fréquente de « joués »
  fff_journee_no INTEGER,                       -- cj_no brut DOFA
  classement_date DATE,                         -- date du classement côté FFF
  recupere_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT classements_unique_club UNIQUE (equipe, saison, club_cl_no, club_equipe_no)
);

-- Journal des tâches FFF (migrations/003_taches_log.sql) — purgé au-delà de 90 jours
-- par services/scheduler.js
CREATE TABLE IF NOT EXISTS taches_log (
  id SERIAL PRIMARY KEY,
  tache VARCHAR(30) NOT NULL,                   -- synchro_fff | import_fff | classements
  declencheur VARCHAR(12) NOT NULL,             -- planifie | rattrapage | manuel
  debut TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fin TIMESTAMPTZ,                              -- NULL tant que la tâche tourne
  succes BOOLEAN,
  resume JSONB,
  erreur TEXT,
  CONSTRAINT taches_log_tache_check       CHECK (tache IN ('synchro_fff', 'import_fff', 'classements')),
  CONSTRAINT taches_log_declencheur_check CHECK (declencheur IN ('planifie', 'rattrapage', 'manuel'))
);

CREATE TABLE IF NOT EXISTS templates (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL,
  equipe VARCHAR(50),
  fichier TEXT NOT NULL,
  zones JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT type_check CHECK (type IN ('programme', 'matchday', 'score_live', 'resultats'))
);

CREATE TABLE IF NOT EXISTS publications_programmees (
  id SERIAL PRIMARY KEY,
  match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  heure_publication TIMESTAMP,
  statut VARCHAR(20) DEFAULT 'en_attente',
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT pub_statut_check CHECK (statut IN ('en_attente', 'publie', 'erreur'))
);

-- Journal des publications Meta réellement envoyées (mock, test ou live),
-- distinct de publications_programmees qui gère la planification.
-- ⚠️ Migration non appliquée : cette table (et ses index ci-dessous) n'existe pas
-- encore dans la base (database/migration_publications_historique.sql).
CREATE TABLE IF NOT EXISTS publications_historique (
  id SERIAL PRIMARY KEY,
  match_id INTEGER REFERENCES matches(id) ON DELETE SET NULL,
  platform VARCHAR(20) NOT NULL,
  type VARCHAR(30) NOT NULL,
  meta_post_id TEXT,
  statut VARCHAR(20) NOT NULL,
  erreur TEXT,
  image_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT hist_platform_check CHECK (platform IN ('facebook', 'instagram')),
  CONSTRAINT hist_statut_check   CHECK (statut IN ('publie', 'erreur', 'mock', 'test'))
);

CREATE TYPE user_role AS ENUM ('admin', 'gestionnaire', 'coach', 'score_live');

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50) NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  role          user_role   NOT NULL DEFAULT 'gestionnaire',
  created_at    TIMESTAMP   DEFAULT NOW(),
  last_login    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_matches_date    ON matches(date);
CREATE INDEX IF NOT EXISTS idx_matches_statut  ON matches(statut);
CREATE INDEX IF NOT EXISTS idx_matches_equipe  ON matches(equipe);
CREATE INDEX IF NOT EXISTS idx_classements_equipe ON classements(equipe, saison, rang);
CREATE INDEX IF NOT EXISTS idx_taches_log_debut ON taches_log(debut DESC);
CREATE INDEX IF NOT EXISTS idx_taches_log_tache ON taches_log(tache, debut DESC);
CREATE INDEX IF NOT EXISTS idx_publications_match ON publications_programmees(match_id);
-- Migration non appliquée (voir publications_historique ci-dessus)
CREATE INDEX IF NOT EXISTS idx_historique_match    ON publications_historique(match_id);
CREATE INDEX IF NOT EXISTS idx_historique_created   ON publications_historique(created_at DESC);

-- Logos temporaires (Octobre Rose, Movember…) — club_id NULL = SCR
CREATE TABLE IF NOT EXISTS logos_temporaires (
  id            SERIAL PRIMARY KEY,
  club_id       INTEGER REFERENCES clubs(id) ON DELETE CASCADE,
  nom_evenement VARCHAR(100) NOT NULL,
  fichier       VARCHAR(255) NOT NULL,
  date_debut    DATE NOT NULL,
  date_fin      DATE NOT NULL,
  actif         BOOLEAN DEFAULT true,
  created_at    TIMESTAMP DEFAULT NOW(),
  CONSTRAINT logos_temp_dates_check CHECK (date_fin >= date_debut)
);
CREATE INDEX IF NOT EXISTS idx_logos_temp_club  ON logos_temporaires(club_id);
CREATE INDEX IF NOT EXISTS idx_logos_temp_dates ON logos_temporaires(date_debut, date_fin);
