# Spécification — passerelle full-stack (Node + SQLite)

Ce document est le contrat de référence pour convertir une app du portfolio
en application full-stack, sans jamais perdre le mode `file://`.
L'app **api-contacts** est l'implémentation de référence : lire son
`server.js` et son `js/script.js` en parallèle de cette spécification.

## 1. Principes non négociables

1. **Zéro dépendance npm.** Uniquement `node:http`, `node:fs`, `node:path`,
   `node:sqlite` (natifs). Lancement : `node server.js`.
2. **Mode dual.** La page doit fonctionner *identiquement* ouverte en
   `file://` (ou servie statiquement) sans serveur. Aucune fonctionnalité
   ne doit cesser de marcher sans backend.
3. **Lighthouse 100/100/100** dans les deux modes et les deux thèmes.
   Aucune erreur console dans aucun des deux modes.
4. **Le cœur de chaque démo est préservé** : mêmes écrans, mêmes
   fonctionnalités, même design, mêmes règles de validation.
5. Commentaires et libellés en **français**, style du repo (IIFE, `'use strict'`,
   2 espaces, fonctions `function`, `try/catch` sur tout accès `localStorage`).

## 2. Le serveur (`<app>/server.js`)

Réutiliser obligatoirement la bibliothèque commune `serveur/commun.js`
(`creerServeur` gère statique, alias `/shared`, en-tête `X-Serveur`, corps
JSON, journal des requêtes, hub SSE).

```js
const { creerServeur, normaliser } = require('../serveur/commun.js');
creerServeur({
  nom:        'Nom de l\'app — full-stack',   // devient l'en-tête X-Serveur
  port:       310X,                            // voir §7
  base:       path.join(__dirname, 'donnees', 'bdd.sqlite'),
  racine:     __dirname,
  alias:      [{ prefixe: '/shared', dossier: path.join(__dirname, '..', 'shared') }],
  routes:     [ /* { methode, motif, traiter(ctx) } */ ],
  surDemarrage: function (db) { /* CREATE TABLE + seed si vide */ }
}).catch(...);
```

- `traiter(ctx)` reçoit `{ req, res, params, query, corps, db, flux }` et
  renvoie `{ statut, corps }` (ou `undefined` si la réponse est déjà écrite,
  cas SSE).
- **Schéma relationnel réel** (colonnes typées, index, clés étrangères si
  pertinent) — pas de fourre-tout JSON. Stocker les colonnes normalisées
  (`normaliser()` de commun.js) pour la recherche/tri insensibles aux accents.
- **Routes REST suivant les vraies opérations de l'app**, mêmes formes de
  réponse et mêmes messages d'erreur que le code front existant (l'utilisateur
  ne doit pas voir la sémantique changer).
- **Seed** : reprendre les données d'exemple hardcodées du frontend
  (`EXEMPLES`, `LIEUX_DEFAUT`, `baseDemonstration`…), insérées au premier
  lancement seulement (`SELECT COUNT(*) = 0`), dans une transaction.
- Route `GET /api/reinit` (ou l'équivalent propre à l'app) pour réinitialiser.
- Les chemins `data-*`/clés localStorage de l'app sont remplacés par des
  **en-têtes REST** ; ne jamais exposer de clé technique côté client.
- **Ne jamais servir** le dossier `donnees/` : `commun.js` sert `racine`,
  donc poser `donnees/` *hors* de `racine` si possible, ou s'assurer que le
  chemin n'est pas requis. (Le plus sûr : `base: path.join(__dirname, '..', 'donnees-<app>', 'bdd.sqlite')` — voir §7.)

## 3. La détection (`shared/api-client.js`)

Déjà écrit et testé. Chargé par `<script src="../shared/api-client.js">`
**avant** le script de l'app. API :

- `window.LumeAPI.detecter()` → `Promise<boolean>` — en-tête `HEAD`,
  résout `true` si `X-Serveur` présent. `window.LumeAPI.actif`.
- `window.LumeAPI.appeler(methode, chemin, corps)` → `Promise<{statut, corps}>`
  — appel REST générique, `{statut:204, corps:null}` pour le 204.

## 4. L'adaptateur dual côté front

Les apps sont **synchrone** (localStorage). Le serveur est **asynchrone**.
On ne réécrit donc pas toute l'app : on branche un **adaptateur en
écriture-transit** (*write-through*) sur la couche de stockage existante.

### 4.1 Détection (dans `init()`)

```js
async function init() {
  try { await window.LumeAPI.detecter(); } catch (e) { /* mode local */ }
  if (window.LumeAPI.actif) await brancherModeServeur();   // §4.2
  ...
}
```

### 4.2 Préchargement (une seule fois, avant tout affichage)

Récupérer chaque collection gérée par le serveur et peupler le **cache mémoire**
que la couche `stockage` lira ensuite de façon synchrone :

```js
async function brancherModeServeur() {
  const r = await window.LumeAPI.appeler('GET', '<collection>');
  if (r.statut === 200) cache[CLE] = r.corps;   // la DB est source de vérité
}
```

### 4.3 Écriture-transit

Wrapper `stockage.ecrire(cle, valeur)` (la fonction est centralisée dans
chaque app — c'est pour ça qu'on la touche à peine) :

```js
const ecrireLocal = stockage.ecrire;          // comportement d'origine
stockage.ecrire = function (cle, valeur) {
  ecrireLocal(cle, valeur);                   // cache + localStorage (file://)
  if (window.LumeAPI.actif && SERVEUR[cle]) { // feu-oublie
    window.LumeAPI.appeler('PUT', SERVEUR[cle], valeur)
      .catch(function () { /* la UI reste correcte même si le PUT échoue */ });
  }
};
```

`SERVEUR` : table de correspondance `{ cleLocalStorage: 'chemin/rest' }`.
Le `PUT` remplace la collection côté serveur (les apps sont mono-utilisateur ;
remplacer est simple et robuste). Les **lectures** viennent du serveur au
préchargement (§4.2), donc jamais de divergence à l'affichage.

### 4.4 Ce qui est branché en REST direct

- **api-contacts** : la console d'API appelle les 6 verbes réels (référence).
- **api-express** : déjà un vrai serveur Express → son `apercu` peut appeler
  l'API réelle en option, sinon reste en rejou.
- Tout point déjà **asynchrone** dans une app (formulaire de création, etc.)
  peut appeler REST directement si c'est plus lisible que le write-through.

### 4.5 Indicateur d'interface (recommandé, mais optionnel)

Un chip/mention qui bascule entre « base SQLite » et « localStorage »,
comme dans api-contacts. **Facultatif** : s'il est ajouté, il ne doit ni
casser le design ni le score Lighthouse (élément existant réutilisé de
préférence).

## 5. Champs et validation

- Reprendre **exactement** les règles de validation du front (messages
  compris) : sinon le serveur rejetterait ce que le front accepte.
- Les formes de réponse (`{donnees, meta}` pour une liste, `{erreur, details}`
  pour un rejet, 404 `{erreur, id}`, 204 sans corps) doivent calquer celles
  du simulateur existant.

## 6. Vérification obligatoire (à rapporter)

Pour chaque app convertie, dans les **deux** modes :

1. `node server.js` → parcours CRUD complet en `curl` (création, lecture,
   mise à jour, suppression, 404, 400 sur invalide) — coller la sortie.
2. Mode serveur via le navigateur : chip moteur, données visibles,
   **0 erreur console**.
3. Mode local via `http://127.0.0.1:8913/<app>/` (serveur statique) :
   données visibles, **0 erreur console**, moteur « local ».
4. `file://` : la détection (`detecter()`) renvoie `false` (protocole), donc
   mode local garanti — vérifier par la lecture du code.
5. Lighthouse (accessibilité / bonnes pratiques / SEO) sur la page en mode
   serveur : **100/100/100**.
6. Ne **jamais** commit de fichier `donnees/` (voir `.gitignore`).

## 7. Ports et emplacement des bases

| App | Port | Base SQLite |
|---|---|---|
| api-contacts | 3101 | `api-contacts/donnees/bdd.sqlite` |
| suivi-depenses | 3102 | `donnees-suivi/bdd.sqlite` |
| boutique-souk | 3103 | `donnees-boutique/bdd.sqlite` |
| messagerie-temps-reel | 3104 | `donnees-messagerie/bdd.sqlite` |
| carte-points-interet | 3105 | `donnees-carte/bdd.sqlite` |
| quiz-culture-generale | 3106 | `donnees-quiz/bdd.sqlite` |
| mini-sgbd | 3107 | `donnees-sgbd/bdd.sqlite` |
| chain | 3108 | `donnees-chain/bdd.sqlite` |
| whiteboard | 3109 | `donnees-whiteboard/bdd.sqlite` |
| api-express | 3000 | `donnees-express/bdd.sqlite` |

Les bases sont posées **à la racine du repo** dans un dossier `donnees-*`
(gitignoré par le motif `donnees*`) pour ne jamais être servies en statique
par `racine: __dirname`.
→ Ajouter `donnees*` au `.gitignore` racine.

Serveur statique de test : `node serveur/statique.js` → port 8913.

## 8. Temps réel (messagerie, whiteboard)

Ces deux apps synchronisent via `BroadcastChannel`/`storage`. En mode serveur,
ajouter une couche **SSE** (`flux` de `commun.js`) *par-dessus*, sans
supprimer le mécanisme local :

- Route `GET /api/flux` : `ctx.flux.ouvrir(ctx.req, ctx.res)` (ne renvoyer
  rien d'autre).
- Après chaque mutation persistée : `ctx.flux.publier('<type>', donnees)`.
- Côté front, en mode serveur, `new EventSource('/api/flux')` et appeler la
  fonction de resynchronisation existante (`synchroniser()`, `publier()`…)
  à la réception. **En mode local, tout reste identique.**

## 9. Livrables par app

- `<app>/server.js`
- `<app>/README.md` : section « Mode full-stack » (lancement, routes, schéma).
- `<app>/index.html` (+ 1 ligne `<script src="../shared/api-client.js">`).
- `<app>/js/*.js` : détection + adaptateur (§4), rien d'autre.
- mise à jour de la fiche projet correspondante dans `portfolio/projets/*.html`
  (mentionner Node + SQLite dans la stack), **sans** toucher au design.
