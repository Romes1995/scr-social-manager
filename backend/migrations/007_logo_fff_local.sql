-- Migration 007 : copie locale du logo FFF de chaque club (services/logosFff.js)
-- Idempotente : peut être rejouée sans effet de bord.
--
--   clubs.logo_fff_local  /uploads/logos/fff-<cl_no>.<ext>, téléchargé par l'import FFF ;
--                         utilisé après les logos de l'admin et du Drive, avant le logo FFF externe
--   reglages              logo_fff_scr : URL du logo FFF du SCR (le SCR n'a pas de ligne clubs)

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS logo_fff_local TEXT;
