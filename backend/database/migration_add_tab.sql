-- Migration : ajout des tirs au but (TAB) pour les matchs de Coupe
-- À exécuter sur une base existante

ALTER TABLE matches ADD COLUMN IF NOT EXISTS tab_domicile  INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS tab_exterieur INTEGER;
