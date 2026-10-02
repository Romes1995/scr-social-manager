# Télé du club-house : page /tele dans Anthias

La page **/tele** de la vitrine (`frontend-public`) est conçue pour la grande télé du
club-house, pilotée par **Anthias** sur un **Raspberry Pi 4**. Elle tourne seule toute la
journée, sans clavier ni souris :

- un écran par équipe (Équipe 1, puis 2, puis 3), **15 secondes** chacun, en boucle ;
- chaque écran montre les billets du week-end, les 3 derniers résultats de l'équipe et
  son classement complet ;
- les données sont rechargées **toutes les 5 minutes** sans recharger la page (en cas
  d'échec, les dernières données restent affichées) ;
- la page se recharge entièrement **chaque nuit à 4 h** (heure de Paris) ;
- si l'API ne répond pas au démarrage : écran d'attente (écusson et slogan), nouvel
  essai toutes les 30 secondes.

La page dessine une scène de 1920 × 1080 px mise à l'échelle de l'écran : elle s'affiche
de la même façon en 720p, 1080p ou 4K (bandes vert anglais si le format n'est pas 16:9).

## Réglage dans Anthias

1. Ouvrir l'interface d'Anthias (`http://<adresse-du-raspberry>` depuis un ordinateur du
   même réseau).
2. **Add Asset** (ajouter un élément) :
   - **Type** : `Webpage` (page web) ;
   - **URL** : `http://<adresse-du-serveur>/tele` (l'adresse où la vitrine est publiée,
     par exemple `https://www.sc-roeschwoog.fr/tele`) ;
   - **Durée** : **très longue**, par exemple `86400` secondes (24 h). La page gère
     elle-même la rotation des équipes ; une durée courte ferait recharger la page par
     Anthias à chaque passage, avec un écran blanc à chaque fois.
3. Activer l'élément et, s'il y en a d'autres, les désactiver (ou laisser cette page
   seule dans la playlist).

### Options d'URL

| Paramètre | Effet | Exemple |
|---|---|---|
| `duree` | durée d'affichage de chaque équipe, en secondes (5 minimum, 15 par défaut) | `/tele?duree=20` |

### À vérifier sur place

- La télé est réglée sur sa résolution native, sans zoom (« plein écran » ou « 16:9 »,
  pas « zoom » ni « ajustement automatique »), sinon les bords sont rognés.
- L'adresse de l'API compilée dans la vitrine (`VITE_API_URL`, fichier
  `frontend-public/.env` au moment du build) doit être joignable **depuis le Raspberry
  Pi** : pas `localhost`, mais l'adresse publique ou locale du serveur.
- L'heure affichée est celle de Paris, quel que soit le fuseau du Raspberry Pi.

## Tester la page sur un ordinateur

Avec le backend lancé (`cd backend && npm run dev`) :

```bash
cd frontend-public
npm run dev
```

Puis ouvrir `http://localhost:5175/tele` dans le navigateur :

- **F11** (ou ⌃⌘F sur Mac) pour le plein écran, comme sur la télé ;
- `http://localhost:5175/tele?duree=5` pour faire défiler les équipes plus vite ;
- redimensionner la fenêtre : la scène garde ses proportions et reste centrée ;
- la réponse brute de l'API : `http://localhost:3001/api/public/tele`.

Pour tester la version de production (celle que verra Anthias) :

```bash
cd frontend-public
npm run build
npx vite preview --port 5175
```
