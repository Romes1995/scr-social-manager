# Déployer la vitrine du SC Roeschwoog

Ce dossier installe **le site public du club** (accueil, page télé du club-house,
matchs, classements) sur un serveur Ubuntu, en une commande.

Le site se remplit tout seul avec les données de la FFF : matchs, résultats,
classements et logos des clubs. Il n'y a rien à saisir et aucune interface
d'administration n'est installée.

Trois conteneurs Docker tournent ensemble :

| Conteneur  | Rôle                                                                      |
|------------|---------------------------------------------------------------------------|
| `postgres` | Base de données (volume persistant `pgdata`)                              |
| `backend`  | API publique + import automatique des données FFF (logos : volume `uploads`) |
| `nginx`    | Sert le site et transmet `/api` et `/uploads` au backend                  |

## 1. Prérequis

- Un serveur Ubuntu (22.04 ou plus récent) avec un accès à Internet : le serveur
  doit pouvoir joindre `api-dofa.fff.fr` et `cdn-transverse.azureedge.net`.
- **Docker Engine** et le plugin **Docker Compose**. Installation officielle :
  <https://docs.docker.com/engine/install/ubuntu/>

  Vérifier l'installation :

  ```bash
  docker --version
  docker compose version
  ```

- `git`, s'il n'est pas déjà présent : `sudo apt install git`.

## 2. Installation

```bash
git clone https://github.com/Romes1995/scr-social-manager.git
cd scr-social-manager/deploy
cp .env.example .env
nano .env          # changer POSTGRES_PASSWORD (et PORT_HTTP si 8080 est déjà pris)
docker compose up -d
```

La première commande `docker compose up -d` construit les images. Comptez
quelques minutes.

Au démarrage, le backend crée seul la structure de la base. Environ une minute
plus tard, il lance le premier import FFF : matchs, classements, puis
téléchargement des logos. Comptez une à deux minutes de plus.

## 3. Vérifier que tout fonctionne

**Les conteneurs tournent :**

```bash
docker compose ps
```

Les trois services doivent être `running`, avec `postgres` en `healthy`.

**L'import FFF a tourné.** Suivez le journal du backend (Ctrl+C pour quitter) :

```bash
docker compose logs -f backend
```

Lignes attendues, dans cet ordre :

```
[Schéma] Base vide : schéma créé (migrations 007_logo_fff_local.sql)
🚀 SCR Social Manager API démarré sur http://0.0.0.0:3001 (mode vitrine)
[Scheduler] 🔁 Rattrapage : aucun import réussi en base
[Scheduler] ▶️  synchro_fff (rattrapage) démarrée [taches_log #1]
[LogosFFF] 36 téléchargé(s), 0 déjà présent(s), 0 échec(s)
[FFF] Import : 62 créé(s), 0 mis à jour, … ; clubs : 35 créé(s), …
[Classement] ✅ SCR 1 (District 1 Alsace, POULE B) : 12 clubs, journée 7, SCR 5e
[LogosFFF] 0 téléchargé(s), 27 déjà présent(s), 0 échec(s)
[Scheduler] ✅ synchro_fff (rattrapage) terminée [#1]
```

Les nombres changent selon la saison. Après la première fois, l'import tourne
seul chaque nuit à 3 h 30, et plusieurs fois le week-end pour les résultats.

Pour vérifier depuis le serveur, remplacez `8080` par votre `PORT_HTTP` :

```bash
curl http://127.0.0.1:8080/api/health        # {"status":"ok","mode":"vitrine"}
```

**Le serveur a le droit d'interroger la FFF.** Certains hébergeurs sont bloqués
par la FFF. Ce test interroge la FFF depuis le conteneur, comme le fait l'import :

```bash
docker compose exec backend node scripts/tester-fff.js
```

| Résultat affiché                                         | Signification                                      |
|----------------------------------------------------------|----------------------------------------------------|
| `✅ API FFF joignable …` puis `✅ Logos des clubs accessibles …` | Tout va bien                                 |
| `❌ Serveur bloqué par la FFF (HTTP 403) … Voir Romaric.`  | Ce serveur ne pourra pas importer les données : prévenir Romaric |
| `❌ API FFF injoignable …`                                 | Problème réseau du serveur ; réessayer plus tard   |

Si l'import échoue, par exemple parce que la FFF bloque le serveur, le backend
réessaie toutes les 30 minutes jusqu'à ce qu'un import réussisse. Le journal
l'indique par cette ligne :

```
[Scheduler] ⏳ Aucun import FFF réussi : nouvelle tentative de rattrapage dans 30 min (…)
```

**Les pages du site** (remplacer par votre adresse) :

| Page                                | Adresse                            |
|-------------------------------------|------------------------------------|
| Accueil                             | `https://votre-domaine/`           |
| **Télé du club-house** (plein écran) | `https://votre-domaine/tele`       |
| Matchs                              | `https://votre-domaine/matchs`     |
| Classements                         | `https://votre-domaine/classement` |

La page `/tele` est faite pour un écran allumé en permanence. Elle se met à
jour toute seule.

## 4. HTTPS et nom de domaine

Ce déploiement ne gère **pas** le HTTPS. Le site répond en HTTP sur le port
`PORT_HTTP` de la machine (8080 par défaut).

Configurez votre reverse proxy existant (Nginx, Caddy, Traefik…) pour qu'il
transmette le domaine du site vers :

```
http://127.0.0.1:8080        (ou http://<IP du serveur>:8080 si le proxy est sur une autre machine)
```

Exemple minimal avec Caddy, qui obtient le certificat tout seul :

```
vitrine.exemple.fr {
    reverse_proxy 127.0.0.1:8080
}
```

Le port 8080 est ouvert sur toutes les interfaces du serveur. Si le reverse
proxy tourne sur la même machine, fermez-le aux connexions extérieures. Par
exemple, dans `docker-compose.yml`, remplacez `"${PORT_HTTP:-8080}:80"` par
`"127.0.0.1:${PORT_HTTP:-8080}:80"`.

## 5. Mise à jour

Depuis le dossier `deploy` :

```bash
git pull && docker compose up -d --build
```

Les données sont conservées : la base dans le volume `pgdata`, les logos dans
le volume `uploads`. Les changements de structure de la base s'appliquent
seuls au redémarrage.

## 6. Commandes utiles

```bash
docker compose logs --tail 200 backend   # dernières lignes du journal
docker compose restart backend           # redémarrer l'API (relance un import si le dernier a plus de 24 h)
docker compose down                      # arrêter (les données sont gardées)
```

> ⚠️ `docker compose down -v` **supprime définitivement** la base et les logos.
> Ne l'utilisez que pour repartir de zéro.

Historique des imports, dans la base :

```bash
docker compose exec postgres psql -U scr -d scr_vitrine \
  -c "SELECT tache, declencheur, debut, fin, succes, erreur FROM taches_log ORDER BY id DESC LIMIT 10;"
```

## 7. En cas de problème

| Symptôme                                         | Piste                                                                 |
|--------------------------------------------------|-----------------------------------------------------------------------|
| Le site s'affiche, mais sans matchs              | Lire `docker compose logs backend`. L'import démarre environ 1 minute après le lancement. Lancer aussi le test FFF (section 3). |
| `HTTP 403` vers `api-dofa.fff.fr`, lignes `⏳ Aucun import FFF réussi` | La FFF bloque peut-être ce serveur. Lancer `docker compose exec backend node scripts/tester-fff.js`. S'il affiche « Serveur bloqué par la FFF », prévenir Romaric. Un 403 isolé est normal : l'import réessaie toutes les 30 min. |
| Un logo de club manque (pastille vide)           | Chercher `[LogosFFF]` dans le journal. L'échec est noté et retenté au prochain import. |
| `POSTGRES_PASSWORD manquant`                     | Le fichier `deploy/.env` n'existe pas : `cp .env.example .env`.       |
| Port déjà utilisé                                | Changer `PORT_HTTP` dans `.env`, puis `docker compose up -d`.         |

Ne lancez jamais plusieurs copies du conteneur `backend` (pas de `--scale`) :
les imports FFF se feraient en double.
