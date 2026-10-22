# Carte des points d'intérêt

Carte interactive de Marrakech (plan SVG, sans librairie) : monuments,
jardins, restaurants, shopping. Recherche, filtres par catégorie, ajout sur
le plan, déplacement à la souris/doigt **et** au clavier, mesure de distance,
fiche avec suppression en deux temps, export/import JSON.
Interface HTML/CSS/JS classique — aucun framework, aucune dépendance, tout
fonctionne en `file://`.

## Lancement (mode local)

Ouvrir simplement `index.html` (double-clic) : les lieux vivent dans le
`localStorage` du navigateur, sous la clé `lieux` (le thème, `carte-theme`,
reste local dans tous les cas).

## Mode full-stack

L'app se branche automatiquement sur un serveur Node **si** un serveur répond
à la sonde de `shared/api-client.js` (en-tête `X-Serveur`) : la base SQLite
devient alors la source de vérité, sans que rien ne change côté interface.
Sinon (page ouverte en `file://` ou servie en statique), tout reste en
`localStorage` — aucune fonctionnalité n'est perdue. L'export JSON reste
toujours local ; l'import, en plus du fichier, remplace la table SQLite via
l'écriture-transit.

### Lancement

```bash
node carte-points-interet/server.js    # http://localhost:3105
```

Zéro dépendance npm : uniquement `node:http`, `node:fs`, `node:path` et
`node:sqlite` (Node ≥ 22.5). Variables d'environnement acceptées :
`PORT` (port d'écoute), `BASE` (chemin de la base SQLite).

### Routes

| Méthode | Chemin | Description |
|---------|--------|-------------|
| GET | `/api/lieux` | tous les lieux, triés par nom → `{donnees, meta}` |
| GET | `/api/lieux/:id` | un lieu, ou 404 |
| POST | `/api/lieux` | création, validation, 201 |
| PUT | `/api/lieux/:id` | remplacement d'un lieu, 400 si invalide, 404 si absent |
| DELETE | `/api/lieux/:id` | suppression, 204 |
| PUT | `/api/lieux` | remplacement intégral (écriture-transit du frontend) |
| POST | `/api/lieux/import` | import complet : tableau nu ou `{"lieux":[…]}` |
| POST | `/api/reinit` | vide la table puis réinsère les 6 lieux d'exemple |
| GET | `/api/sante` | sonde de détection du mode full-stack |

Validation identique au formulaire : nom obligatoire (`Le nom est
obligatoire.`, réponse `{erreur, details}` en 400), nom borné à 60 caractères,
description à 180 (défaut « Aucune description. »), `x`/`y` bornés entre 0 et
100 %, catégorie inconnue ramenée à « Monuments ».

### Schéma

Base SQLite à la racine du repo : `donnees-carte/bdd.sqlite` (ignorée par git,
jamais servie en statique).

```sql
CREATE TABLE lieux (
  id          INTEGER PRIMARY KEY,
  nom         TEXT    NOT NULL,
  categorie   TEXT    NOT NULL DEFAULT 'Monuments'
              CHECK (categorie IN ('Monuments','Jardins','Restaurants','Shopping')),
  x           REAL    NOT NULL DEFAULT 50,   -- % de largeur
  y           REAL    NOT NULL DEFAULT 50,   -- % de hauteur
  description TEXT    NOT NULL DEFAULT '',
  tri_nom     TEXT    NOT NULL DEFAULT ''    -- version normalisée (tri sans accents)
);
CREATE INDEX idx_lieux_tri_nom   ON lieux(tri_nom);
CREATE INDEX idx_lieux_categorie ON lieux(categorie);
```

Au premier lancement, les 6 lieux de démonstration (Koutoubia, Jemaa el-Fna…)
sont insérés.

### Adaptateur dual (`js/script.js`)

- `initialiser()` devient asynchrone : détection (`LumeAPI.detecter()`) puis,
  si un serveur répond, `brancherModeServeur()` qui **précharge** la
  collection `lieux` dans un cache mémoire (lue ensuite de façon synchrone)
  et installe l'**écriture-transit** sur `stockage.ecrire` (PUT sans attendre :
  l'interface reste juste même si la requête échoue). Si l'API ne répond pas
  (serveur statique, backend injoignable), la bascule est annulée et l'app
  reste entièrement en `localStorage`.
- Ajout, glisser-déposer, déplacement clavier et import passent par
  `sauvegarder()` : un seul chemin d'écriture, local et distant.

### Exemples

```bash
curl http://localhost:3105/api/lieux
curl -X POST http://localhost:3105/api/lieux \
  -H 'Content-Type: application/json' \
  -d '{"nom":"Le Tombeaute Saadiens","categorie":"Monuments","x":38,"y":52,"description":"Salle aux colonnes de marbre."}'
curl -X PUT http://localhost:3105/api/lieux/1 \
  -H 'Content-Type: application/json' \
  -d '{"nom":"Koutoubia","categorie":"Monuments","x":42,"y":38,"description":"Le minaret repère de la médina."}'
curl -X DELETE http://localhost:3105/api/lieux/2
curl -X POST http://localhost:3105/api/reinit
```
