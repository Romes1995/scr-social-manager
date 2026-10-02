-- Migration 004 : identifiant FFF des clubs et noms d'affichage
-- Idempotente : peut être rejouée sans effet de bord.
--
--   clubs.fff_cl_no             club.cl_no DOFA (unique, NULL pour les clubs non rattachés)
--   clubs.nom_fff               short_name FFF, mis à jour par l'import et les classements
--   clubs.nom_affiche           nom saisi dans l'admin (/clubs) ; NULL = nom FFF
--   clubs.nom_court             nom pour les affichages étroits ; NULL = nom d'affichage
--   matches.adversaire_cl_no    club.cl_no de l'adversaire, rempli par l'import
--   matches.adversaire_equipe_no  numéro réel de l'équipe adverse (code DOFA : 1, 2, 3…)
--
-- Aucun rattachement ici : il est fait par services/clubsFff.js (assurerClub),
-- appelé par l'import FFF et par refreshClassements(). clubs.nom n'est jamais
-- modifié (les générateurs de visuels s'appuient dessus).

BEGIN;

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS fff_cl_no   integer,
  ADD COLUMN IF NOT EXISTS nom_fff     varchar(100),
  ADD COLUMN IF NOT EXISTS nom_affiche varchar(100),
  ADD COLUMN IF NOT EXISTS nom_court   varchar(40);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clubs_fff_cl_no_key') THEN
    ALTER TABLE clubs ADD CONSTRAINT clubs_fff_cl_no_key UNIQUE (fff_cl_no);
  END IF;
END $$;

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS adversaire_cl_no     integer,
  ADD COLUMN IF NOT EXISTS adversaire_equipe_no integer;

CREATE INDEX IF NOT EXISTS idx_matches_adversaire_cl_no ON matches(adversaire_cl_no);

COMMIT;
