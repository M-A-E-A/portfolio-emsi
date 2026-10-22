# Suivi de dépenses

Application de budget personnel : dépenses par catégorie, enveloppes mensuelles,
graphique sur 6 mois, répartition du mois (anneau), variations, export CSV.
Interface HTML/CSS/JS classique — aucun framework, aucune dépendance, tout
fonctionne en `file://`.

## Lancement (mode local)

Ouvrir simplement `index.html` (double-clic) : les données vivent dans le
`localStorage` du navigateur, sous les clés `depenses` et `depenses-budgets`
(le thème, `depenses-theme`, reste local dans tous les cas).

## Mode full-stack

L'app se branche automatiquement sur un serveur Node **si** un serveur répond
à la sonde de `shared/api-client.js` (en-tête `X-Serveur`) : la base SQLite
devient alors la source de vérité, sans que rien ne change côté interface.
Sinon (page ouverte en `file://` ou servie en statique), tout reste en
`localStorage` — aucune fonctionnalité n'est perdue.

### Lancement

```bash
node suivi-depenses/server.js    # http://localhost:3102
```

Zéro dépendance npm : uniquement `node:http`, `node:fs`, `node:path` et
`node:sqlite` (Node ≥ 22.5). Variables d'environnement acceptées :
`PORT` (port d'écoute), `BASE` (chemin de la base SQLite).

### Routes

| Méthode | Chemin | Description |
|---------|--------|-------------|
| GET | `/api/depenses` | toutes les dépenses, triées date décroissante → `{donnees, meta}` |
| GET | `/api/depenses/:id` | une dépense, ou 404 |
| POST | `/api/depenses` | création, validation, 201 |
| PUT | `/api/depenses/:id` | remplacement d'une dépense, 400 si invalide, 404 si absente |
| DELETE | `/api/depenses/:id` | suppression, 204 |
| PUT | `/api/depenses` | remplacement intégral (écriture-transit du frontend) |
| GET | `/api/budgets` | enveloppes `{ catégorie: montant }` |
| PUT | `/api/budgets` | remplacement intégral (un objet vide retire toutes les enveloppes) |
| DELETE | `/api/budgets` | retire toutes les enveloppes, 204 |
| POST | `/api/reinit` | vide les tables puis réinsère les 12 dépenses d'exemple |
| GET | `/api/sante` | sonde de détection du mode full-stack |

Les messages d'erreur reprennent exactement ceux du formulaire :
`Indiquez un libellé.`, `Saisissez un montant supérieur à 0.`,
`Choisissez une date valide.` (réponses `{erreur, details}` en 400).

### Schéma

Base SQLite à la racine du repo : `donnees-suivi/bdd.sqlite` (ignorée par git,
jamais servie en statique).

```sql
CREATE TABLE depenses (
  id          INTEGER PRIMARY KEY,
  libelle     TEXT    NOT NULL,
  montant     REAL    NOT NULL,
  categorie   TEXT    NOT NULL DEFAULT 'Autre'
              CHECK (categorie IN ('Alimentation','Transport','Logement','Loisirs','Santé','Autre')),
  date        TEXT    NOT NULL,             -- « AAAA-MM-JJ »
  tri_libelle TEXT    NOT NULL DEFAULT ''   -- version normalisée (tri sans accents)
);
CREATE INDEX idx_depenses_date      ON depenses(date);
CREATE INDEX idx_depenses_categorie ON depenses(categorie);
CREATE INDEX idx_depenses_tri       ON depenses(tri_libelle);

CREATE TABLE budgets (
  categorie TEXT PRIMARY KEY CHECK (categorie IN ('Alimentation','Transport','Logement','Loisirs','Santé','Autre')),
  montant   REAL NOT NULL CHECK (montant > 0)
);
```

Au premier lancement, les 12 dépenses d'exemple du frontend sont insérées
(dates calculées par rapport au jour du lancement).

### Adaptateur dual (`js/script.js`)

- `init()` devient asynchrone : détection (`LumeAPI.detecter()`) puis, si un
  serveur répond, `brancherModeServeur()` qui **précharge** les deux
  collections dans un cache mémoire (lues ensuite de façon synchrone) et
  installe l'**écriture-transit** sur `stockage.ecrire` / `stockage.supprimer`
  (PUT sans attendre : l'interface reste juste même si la requête échoue).
  Si l'API ne répond pas (serveur statique, backend injoignable), la bascule
  est annulée et l'app reste entièrement en `localStorage`.
- L'export CSV lit, comme avant, la liste filtrée en mémoire — il fonctionne
  dans les deux modes.

### Exemples

```bash
curl http://localhost:3102/api/depenses
curl -X POST http://localhost:3102/api/depenses \
  -H 'Content-Type: application/json' \
  -d '{"libelle":"Taxi","montant":32.5,"categorie":"Transport","date":"2026-10-01"}'
curl -X PUT http://localhost:3102/api/budgets \
  -H 'Content-Type: application/json' \
  -d '{"Transport":600,"Logement":3500}'
curl -X DELETE http://localhost:3102/api/depenses/1
curl -X POST http://localhost:3102/api/reinit
```
