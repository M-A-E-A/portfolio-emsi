# API REST Contacts — Express.js + SQLite

Preuve concrète pour la compétence **Node.js & Express** affichée dans le
portfolio. Contrairement à la démo « API REST Contacts » du portfolio (qui est
une simulation côté navigateur), celle-ci est une vraie API Express, avec un
serveur Node, des routes, de la validation et des codes HTTP réels — et
depuis la version full-stack, une vraie base **SQLite**.

## Lancement

```bash
cd api-express
npm install
npm start
```

Puis ouvrir `http://localhost:3000/api/contacts` (et l'aperçu
`http://localhost:3000/apercu.html`).

En développement, `npm run dev` relance le serveur à chaque modification.

La base est créée automatiquement au premier lancement :
`donnees-express/bdd.sqlite` (racine du repo, dossier `donnees*` gitignoré).

## Routes

| Méthode | Chemin | Description |
|---------|--------|-------------|
| GET | `/api/contacts` | liste, recherche (`q`), filtre (`ville`), tri (`tri`, `ordre`), pagination (`page`, `parPage`) |
| GET | `/api/contacts/:id` | un contact, ou 404 |
| POST | `/api/contacts` | création, validation, 201 |
| PUT | `/api/contacts/:id` | mise à jour, 400 si invalide, 404 si absent |
| DELETE | `/api/contacts/:id` | suppression, 204 |
| GET | `/api/stats` | total et répartition par ville |
| POST | `/api/reinit` | vide la table et réinsère les 3 contacts d'exemple |

## Exemples

```bash
# Liste paginée
curl "http://localhost:3000/api/contacts?page=1&parPage=2"

# Recherche
curl "http://localhost:3000/api/contacts?q=bennani"

# Recherche insensible aux accents (fes → Fès)
curl "http://localhost:3000/api/contacts?q=fes"

# Création
curl -X POST http://localhost:3000/api/contacts \
  -H 'Content-Type: application/json' \
  -d '{"nom":"Test","email":"test@example.com","ville":"Marrakech"}'

# Suppression
curl -X DELETE http://localhost:3000/api/contacts/2

# Réinitialisation (3 contacts d'exemple)
curl -X POST http://localhost:3000/api/reinit
```

## Mode full-stack / SQLite

Conformément à `serveur/MODELE.md`, l'app est persistée dans une vraie base
SQLite grâce au module natif **`node:sqlite`** — **zéro dépendance npm
supplémentaire**, Express reste la seule dépendance installée.

**Lancement** : `cd api-express && npm install && npm start` →
`http://localhost:3000` (aucune configuration, le dossier `donnees-express/`
est créé et peuplé automatiquement).

**Base** : `donnees-express/bdd.sqlite` (racine du repo, dossier
`donnees*` gitignoré, donc jamais servi en fichiers statiques).
Pragmas `journal_mode = WAL` et `foreign_keys = ON`.

**Schéma** :

```sql
CREATE TABLE contacts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nom       TEXT NOT NULL,
  email     TEXT NOT NULL,
  ville     TEXT,
  telephone TEXT,
  recherche TEXT,   -- colonne normalisée : nom+e-mail+ville+téléphone
  tri_nom   TEXT,   -- colonne normalisée : nom
  tri_ville TEXT    -- colonne normalisée : ville
);
-- index sur tri_nom, tri_ville, recherche
```

Les colonnes `recherche`, `tri_nom` et `tri_ville` sont recalculées à chaque
écriture via `normaliser()` (`serveur/commun.js` : NFD, sans accents,
minuscules) : la recherche et le tri sont donc **insensibles aux accents et à
la casse, en SQL** — `?q=fes` trouve bien « Fès » — sans charger la table en
mémoire.

**Semis** : les 3 contacts d'exemple sont insérés au premier lancement
(seulement si la table est vide), dans une transaction ; `POST /api/reinit`
vide la table et les réinsère.

**Persistance** : les écritures survivent au redémarrage du serveur
(création → `Ctrl+C` → `npm start` → le contact est toujours là).

**Routes** : identiques à la version en mémoire (`GET/POST/PUT/DELETE
/api/contacts`, `GET /api/stats`), mêmes formes de réponse et mêmes messages
d'erreur, plus `POST /api/reinit`.

**Aperçu** : `apercu.html` est mode double (`shared/api-client.js`) —
ouvert sur `localhost:3000`, il appelle la vraie API Express ; ouvert en
`file://` ou via le serveur statique `http://127.0.0.1:8913/api-express/apercu.html`,
il bascule automatiquement en rejeu local, sans aucune requête réseau.
Même design, même affichage, 0 erreur console dans les deux modes.

## Ce que ça démontre

- Routing Express (`app.get/post/put/delete`)
- Middleware (`express.json`, journalisation, en-tête `X-Serveur`, gestion d'erreurs)
- Codes HTTP réels : 200, 201, 204, 400, 404, 500
- Validation des entrées et messages d'erreur structurés
- Pagination, tri et recherche côté serveur (tri/recherche SQL insensibles aux accents)
- Persistance SQLite native (`node:sqlite`) : schéma relationnel, index,
  transaction de semis, mode WAL — sans ajouter une seule dépendance npm
- Organisation en couches (base, validation, routes, erreurs)