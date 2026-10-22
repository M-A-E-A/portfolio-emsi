# Mini-SGBD — moteur SQL écrit à la main

Un moteur de base de données en JavaScript pur : analyse lexicale, analyse
syntaxique descendante récursive, puis exécution de `SELECT`, `JOIN`,
`GROUP BY`, `INSERT`, `UPDATE`, `DELETE` et `CREATE TABLE` sur des tables
en mémoire. Aucune librairie, aucun back-end requis : la page fonctionne
telle quelle, ouverte en `file://` ou servie en statique.

Le moteur **reste dans le navigateur** — c'est la démonstration. Le rôle
du serveur full-stack est uniquement de **persister l'état du moteur**
(base + historique), pour que le travail survive à une fermeture du
navigateur et soit partagé entre sessions.

## Lancement local (aucun serveur)

Ouvrir `index.html` en `file://`, ou servir le dossier via n'importe quel
serveur statique (par ex. `node serveur/statique.js` → `http://127.0.0.1:8913/mini-sgbd/`).
Tout fonctionne en `localStorage`, comme avant.

## Mode full-stack

```bash
node mini-sgbd/server.js     # ou PORT=3107 BASE=… node server.js
```

Puis ouvrir `http://localhost:3107/`.

- **Détection** : la page envoie une requête `HEAD` (shared/api-client.js) ;
  si la réponse porte l'en-tête `X-Serveur`, elle bascule sur SQLite,
  sinon elle reste en `localStorage`. Aucune fonctionnalité n'est perdue
  dans les deux modes.
- **Architecture** : la détection, un préchargement (`GET /api/base` +
  `GET /api/historique` vers un cache mémoire) et une écriture-transit
  (*write-through* en feu-oublie sur `stockage.ecrire`) suffisent. Le
  moteur SQL, l'annulation (`Annuler la modification`), le reset et
  l'historique fonctionnent exactement comme en mode local.

### Routes

| Méthode | Chemin | Description |
|---------|--------|-------------|
| GET | `/api/sante` | sonde de détection (`X-Serveur`) |
| GET | `/api/base` | état du moteur `{ tables: … }`, 404 si absent |
| PUT | `/api/base` | remplacement intégral, 400 si la forme est invalide |
| GET | `/api/historique` | 12 dernières entrées `[{ q, s }]`, la plus récente en tête |
| PUT | `/api/historique` | remplacement intégral, 400 si invalide |
| POST | `/api/reinit` | restaure la base de démonstration, vide l'historique |

### Schéma (`donnees-sgbd/bdd.sqlite`, à la racine du repo, gitignoré)

```sql
-- Table « mono-ligne » : l'état sérialisé du moteur { tables: … }.
-- Choix assumé et documenté : l'objet d'un moteur de requêtes (tables
-- créées à la volée, colonnes typées, lignes hétérogènes) n'est pas une
-- donnée à dénormaliser en colonnes SQL — le dénormaliser figerait le
-- langage de l'application. Le schéma relationnel réel s'applique aux
-- données de l'app, pas à l'objet métier du moteur.
CREATE TABLE base (
  id     INTEGER PRIMARY KEY CHECK (id = 1),
  donnees TEXT NOT NULL           -- JSON { tables: { nom: { colonnes, lignes } } }
);
-- Historique : vraie table normalisée, 12 lignes maximum.
CREATE TABLE historique (
  position INTEGER PRIMARY KEY,   -- 0 = plus récente
  requete  TEXT NOT NULL,
  resultat TEXT NOT NULL
);
```

### Exemples

```bash
# Lecture de l'état
curl http://localhost:3107/api/base

# Écriture (PUT intégral)
curl -X PUT http://localhost:3107/api/base \
  -H 'Content-Type: application/json' \
  -d '{"tables":{"t":{"nom":"t","colonnes":[{"nom":"id","type":"INTEGER","cle":true,"nonNul":true,"unique":false,"aDefaut":false,"defaut":null}],"lignes":[{"id":1}]}}}'

# Corps invalide → 400
curl -i -X PUT http://localhost:3107/api/base -H 'Content-Type: application/json' -d '{"tables":{}}'

# Historique
curl http://localhost:3107/api/historique

# Réinitialisation complète
curl -X POST http://localhost:3107/api/reinit
```

Le thème (`sgbd-theme`) reste volontairement hors du serveur : c'est une
préférence d'affichage, pas une donnée de l'application.
