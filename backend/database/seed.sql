-- SCR Social Manager - Données initiales

-- Clubs adversaires
INSERT INTO clubs (nom, logo_url) VALUES
  ('AS Gambsheim', NULL),
  ('ASSE Samlbach', NULL),
  ('AS Mertzwiller 3', NULL),
  ('ASL Hegeney', NULL),
  ('SS Beinheim', NULL),
  ('FC Durrenbach', NULL),
  ('AS Oberhoffen', NULL),
  ('FC Kilstett', NULL),
  ('SG Wintzenbach', NULL),
  ('AS Soufflenheim', NULL)
ON CONFLICT DO NOTHING;

-- Joueurs SCR
INSERT INTO joueurs (prenom, nom) VALUES
  ('Nathan', 'L.'),
  ('Stéphane', 'L.'),
  ('Erwan', 'K.'),
  ('Romain', 'S.'),
  ('Thomas', 'M.'),
  ('Kevin', 'B.'),
  ('Julien', 'R.'),
  ('Maxime', 'H.'),
  ('Pierre', 'D.'),
  ('Alexandre', 'W.')
ON CONFLICT DO NOTHING;

-- Matchs de démonstration
INSERT INTO matches (equipe, adversaire, date, heure, domicile, division, statut) VALUES
  ('SCR 1', 'AS Gambsheim', '2026-04-20', '15:00', true, 'D1', 'programme'),
  ('SCR 2', 'ASSE Samlbach', '2026-04-20', '13:30', false, 'D5', 'programme'),
  ('SCR 3', 'ASL Hegeney', '2026-04-19', '10:00', true, 'D7', 'programme')
ON CONFLICT DO NOTHING;
