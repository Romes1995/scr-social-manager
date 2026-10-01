-- Migration 003 : journal des tâches FFF (planifiées, rattrapage, manuelles)
-- Idempotente : peut être rejouée sans effet de bord.
--
--   tache        synchro_fff (import puis classements) | import_fff | classements
--   declencheur  planifie | rattrapage | manuel
--   fin / succes NULL tant que la tâche tourne
--   resume       JSON : import (créés, mis à jour, scores changés…), classements (ok / ko)
--
-- Historique conservé 90 jours (purge par services/scheduler.js).

BEGIN;

CREATE TABLE IF NOT EXISTS taches_log (
  id           serial PRIMARY KEY,
  tache        varchar(30) NOT NULL,
  declencheur  varchar(12) NOT NULL,
  debut        timestamptz NOT NULL DEFAULT now(),
  fin          timestamptz,
  succes       boolean,
  resume       jsonb,
  erreur       text,
  CONSTRAINT taches_log_tache_check       CHECK (tache IN ('synchro_fff', 'import_fff', 'classements')),
  CONSTRAINT taches_log_declencheur_check CHECK (declencheur IN ('planifie', 'rattrapage', 'manuel'))
);

CREATE INDEX IF NOT EXISTS idx_taches_log_debut ON taches_log(debut DESC);
CREATE INDEX IF NOT EXISTS idx_taches_log_tache ON taches_log(tache, debut DESC);

COMMIT;
