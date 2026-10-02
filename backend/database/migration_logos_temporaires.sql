-- Migration : logos temporaires (Octobre Rose, Movember, maillot spécial…)
-- À exécuter sur une base existante (idempotente)
--
-- club_id NULL = logo SCR (le SCR n'a pas de ligne dans la table clubs).
-- Un logo posé sur un club s'applique à toutes ses équipes (même nom de club).

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

CREATE INDEX IF NOT EXISTS idx_logos_temp_club   ON logos_temporaires(club_id);
CREATE INDEX IF NOT EXISTS idx_logos_temp_dates  ON logos_temporaires(date_debut, date_fin);
