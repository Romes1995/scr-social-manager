-- Migration 006 : logos des clubs synchronisés depuis Google Drive
-- Idempotente : peut être rejouée sans effet de bord.
--
--   clubs.drive_folder_id      dossier Drive du club (lien permanent : un renommage ne casse rien)
--   clubs.drive_folder_nom     nom du dossier lors de la dernière synchro (affichage)
--   clubs.drive_folder_manuel  association choisie dans l'admin : jamais remplacée par la synchro
--   club_logos                 logos téléchargés, un par (club, variante) :
--                              uploads/logos/<club_id>/<variante>.png
--     variante_manuelle        variante corrigée dans l'admin : jamais redétectée
--   drive_dossiers_ignores     dossiers Drive écartés dans l'admin (ne sont plus proposés)
--   reglages                   réglages globaux (cle → valeur), dont variante_logo_active
--
-- Les logos existants (clubs.logo_url, logo_monochrome_url, scr.png, logos_temporaires)
-- ne sont pas modifiés : la synchro ne fait que compléter les variantes manquantes
-- (services/driveLogos.js, utils/logoClub.js).

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'logo_variante') THEN
    CREATE TYPE logo_variante AS ENUM ('classique', 'octobre_rose', 'monochrome');
  END IF;
END $$;

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS drive_folder_id     varchar(100),
  ADD COLUMN IF NOT EXISTS drive_folder_nom    varchar(200),
  ADD COLUMN IF NOT EXISTS drive_folder_manuel boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clubs_drive_folder_id_key') THEN
    ALTER TABLE clubs ADD CONSTRAINT clubs_drive_folder_id_key UNIQUE (drive_folder_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS club_logos (
  id                  SERIAL PRIMARY KEY,
  club_id             INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  variante            logo_variante NOT NULL,
  fichier_local       TEXT NOT NULL,                 -- /uploads/logos/<club_id>/<variante>.png
  drive_file_id       VARCHAR(100) NOT NULL,
  drive_file_nom      VARCHAR(300),
  drive_modified_time TIMESTAMPTZ,
  variante_manuelle   BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW(),
  CONSTRAINT club_logos_club_variante_key UNIQUE (club_id, variante)
);
CREATE INDEX IF NOT EXISTS idx_club_logos_drive_file ON club_logos(drive_file_id);

CREATE TABLE IF NOT EXISTS drive_dossiers_ignores (
  folder_id  VARCHAR(100) PRIMARY KEY,
  nom        VARCHAR(200),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reglages (
  cle        VARCHAR(50) PRIMARY KEY,
  valeur     TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);
INSERT INTO reglages (cle, valeur) VALUES ('variante_logo_active', 'classique')
  ON CONFLICT (cle) DO NOTHING;

COMMIT;
