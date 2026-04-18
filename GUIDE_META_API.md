# Guide : Obtenir les tokens Meta (Facebook & Instagram)

Ce guide décrit pas à pas comment obtenir les tokens nécessaires pour activer
la publication automatique depuis SCR Social Manager.

---

## Prérequis

- Avoir accès admin à la **Page Facebook "SCR Roeschwoog"**
- Avoir un **Compte Développeur Meta** (gratuit) : https://developers.facebook.com
- L'application Meta est déjà créée : **App ID `1617978843225787`**

---

## 1. FACEBOOK PAGE ACCESS TOKEN (longue durée)

### 1a. Créer un utilisateur système (recommandé pour la production)

1. Aller sur **https://business.facebook.com**
2. Menu gauche → **Paramètres** (icône engrenage) → **Utilisateurs** → **Utilisateurs système**
3. Cliquer **Ajouter** → choisir le rôle **Admin** → nommer l'utilisateur (ex : `scr-bot`)
4. Une fois créé, cliquer sur l'utilisateur → **Ajouter des assets**
5. Choisir **Pages** → sélectionner la page **SCR Roeschwoog** → accorder le rôle **Admin**
6. Cliquer **Générer un nouveau jeton** sur l'utilisateur système
7. Sélectionner l'application **`1617978843225787`**
8. Cocher les permissions suivantes :
   - `pages_manage_posts`
   - `pages_read_engagement`
   - `pages_show_list`
   - `instagram_basic`
   - `instagram_content_publish`
9. Cliquer **Générer le jeton** et copier la valeur

> Ce token généré via Business Manager a une durée de vie de **60 jours** et peut être
> prolongé via l'étape 1b. Les tokens d'utilisateurs système n'expirent jamais si
> l'option "Never expire" est proposée.

### 1b. Convertir en token longue durée (si token court obtenu via OAuth)

Si tu as un token court (valide 1–2h), convertis-le en token 60 jours :

```
GET https://graph.facebook.com/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id={APP_ID}
  &client_secret={APP_SECRET}
  &fb_exchange_token={SHORT_TOKEN}
```

Remplace `{APP_SECRET}` par la valeur trouvée dans
**developers.facebook.com → ton app → Paramètres → Basique → Clé secrète**.

Le champ `access_token` de la réponse est ton token longue durée.

### 1c. Récupérer le Page Access Token

Un token utilisateur ne suffit pas pour publier : il faut le **token de la Page**.

```
GET https://graph.facebook.com/me/accounts
  ?access_token={USER_LONG_TOKEN}
```

Dans la réponse JSON, trouve l'entrée dont le `name` est **SCR Roeschwoog** et
copie son champ **`access_token`** — c'est le **Page Access Token**.

Copie aussi le champ **`id`** de cette entrée : c'est ton **`FACEBOOK_PAGE_ID`**.

---

## 2. INSTAGRAM BUSINESS ACCOUNT ID

La page Facebook doit être liée à un Compte Instagram Professionnel (Business ou Creator).

### 2a. Lier Instagram à la Page Facebook

Si ce n'est pas encore fait :
1. Aller sur **https://www.facebook.com/pages** → sélectionner la page SCR
2. **Paramètres de la page** → **Instagram** → **Connecter un compte**
3. Se connecter avec le compte Instagram SCR

### 2b. Récupérer l'Instagram Business Account ID

```
GET https://graph.facebook.com/{FACEBOOK_PAGE_ID}
  ?fields=instagram_business_account
  &access_token={PAGE_ACCESS_TOKEN}
```

La réponse ressemble à :
```json
{
  "instagram_business_account": { "id": "17841234567890123" },
  "id": "123456789"
}
```

Le champ `instagram_business_account.id` est ton **`INSTAGRAM_BUSINESS_ACCOUNT_ID`**.

---

## 3. CONFIGURATION DANS L'APP

Éditer le fichier **`backend/.env`** et renseigner les variables :

```env
# Meta / Facebook & Instagram
META_APP_ID=1617978843225787
FACEBOOK_PAGE_ID=<id_de_la_page>
FACEBOOK_PAGE_ACCESS_TOKEN=<page_access_token>
INSTAGRAM_BUSINESS_ACCOUNT_ID=<ig_business_account_id>
```

> Ne jamais committer `.env` dans Git. Il est déjà dans `.gitignore`.

Redémarre le serveur après modification :
```bash
cd backend && npm run dev
```

---

## 4. VÉRIFICATION RAPIDE

Tester que le token fonctionne :

```bash
# Vérifier les infos du token
curl "https://graph.facebook.com/debug_token?input_token=TON_TOKEN&access_token=APP_ID|APP_SECRET"

# Tester la publication Facebook (image doit être une URL publique)
curl -X POST "https://graph.facebook.com/PAGE_ID/photos" \
  -d "url=https://example.com/image.png" \
  -d "message=Test SCR" \
  -d "access_token=TON_PAGE_TOKEN"
```

---

## 5. PERMISSIONS REQUISES SELON LE TYPE DE PUBLICATION

| Type                  | Endpoint FB                            | Permission requise            |
|-----------------------|----------------------------------------|-------------------------------|
| Post photo FB         | `POST /{page_id}/photos`               | `pages_manage_posts`          |
| Story photo FB        | `POST /{page_id}/photos` + `published=false` + story params | `pages_manage_posts` |
| Post photo IG         | `POST /{ig_id}/media` puis `/media_publish` | `instagram_content_publish` |
| Story IG              | `POST /{ig_id}/media` + `media_type=STORIES` | `instagram_content_publish` |

---

## 6. NOTES IMPORTANTES

- Les images publiées doivent être accessibles via une **URL publique**.
  En développement local, utilise [ngrok](https://ngrok.com) ou déploie d'abord l'image.
- Le token de Page n'expire **jamais** s'il est généré via un Utilisateur Système Business.
- En cas d'erreur `OAuthException` code 190 : le token a expiré → le régénérer.
- En cas d'erreur code 200 : permissions manquantes → vérifier les scopes.
- L'app Meta doit être en mode **Live** (pas Development) pour publier sur des comptes
  qui ne sont pas administrateurs de l'app.
