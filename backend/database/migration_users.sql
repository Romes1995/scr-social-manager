-- Migration : ajout de la table users et du type user_role
-- À exécuter sur une base existante

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'gestionnaire', 'coach', 'score_live', 'lecteur');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50) NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  role          user_role   NOT NULL DEFAULT 'lecteur',
  created_at    TIMESTAMP   DEFAULT NOW(),
  last_login    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
