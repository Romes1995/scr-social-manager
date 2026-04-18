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
  statut VARCHAR(20) DEFAULT 'programme',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT statut_check CHECK (statut IN ('programme', 'en_cours', 'termine'))
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

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_matches_date    ON matches(date);
CREATE INDEX IF NOT EXISTS idx_matches_statut  ON matches(statut);
CREATE INDEX IF NOT EXISTS idx_matches_equipe  ON matches(equipe);
CREATE INDEX IF NOT EXISTS idx_publications_match ON publications_programmees(match_id);
