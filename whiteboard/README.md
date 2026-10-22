# Tableau blanc collaboratif — CRDT OR-Set

Dessin collaboratif temps réel : crayon, ligne, rectangle, ellipse, texte,
gomme, annuler/rétablir, curseurs distants et présence. Le cœur de la démo
est un **CRDT OR-Set** (`js/crdt.js`) : chaque élément porte un ensemble de
jetons d'ajout et un ensemble de jetons de suppression ; fusionner, c'est
prendre l'union des ensembles — l'opération est commutative et idempotente.

## Mode local (fichier)

Ouvrir `index.html` directement (`file://`) : le tableau vit en mémoire et
se synchronise entre onglets via `BroadcastChannel('whiteboard-lume')`.

## Mode full-stack

### Lancement

```bash
node server.js          # http://localhost:3109
```

Zéro dépendance npm : uniquement `node:http`, `node:fs`, `node:path` et
`node:sqlite` (natifs), via la bibliothèque commune `serveur/commun.js`.
Variables d'environnement : `PORT` (port d'écoute), `BASE` (chemin de la
base SQLite).

Base : `donnees-whiteboard/bdd.sqlite` (à la racine du repo, gitignorée —
jamais servie en statique).

### Bascule des modes

`shared/api-client.js` sonde le serveur (en-tête `X-Serveur`) au démarrage.
- **Serveur détecté** : `GET /api/etat` hydrate le CRDT à l'arrivée, chaque
  opération publiée est aussi `PUT` côté serveur (upsert), et un
  `EventSource('/api/flux')` retransmet les opérations des autres clients
  — appliquées par le chemin CRDT existant.
- **Aucun serveur** (`file://` ou hébergement statique) : fonctionnement
  local identique à avant.

L'identité de session (`whiteboard-auteur`) reste dans `sessionStorage`
(par onglet) et n'est **jamais** envoyée au serveur.

### Routes

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/api/flux` | flux SSE (événements `operation`, `etat`) |
| GET | `/api/etat` | état complet du tableau (hydratation d'un client qui arrive) |
| PUT | `/api/elements/:id` | upsert d'un élément CRDT (400 si type/props invalides) |
| DELETE | `/api/elements/:id` | suppression franche d'un élément |
| POST | `/api/reinit` | vide le tableau partagé |

### Schéma

`elements(id TEXT PK, auteur TEXT, type TEXT, props TEXT (JSON),
horodatage INTEGER, ajouts TEXT (JSON), suppressions TEXT (JSON))` —
les `Set` du CRDT sont sérialisés en tableaux pour le stockage, et
reconstruits en `Set` au rechargement (`CRDT.Element.depuis`).
Index sur `horodatage`.

### Temps réel

Chaque `PUT /api/elements/:id` est retransmis en événement `operation` ;
les clients le fusionnent (union des jetons) via leur chemin existant —
la convergence du CRDT est préservée quel que soit l'ordre d'arrivée.
Le `BroadcastChannel` reste actif pour les onglets d'un même navigateur.
