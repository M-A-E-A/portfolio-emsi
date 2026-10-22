# API Contacts — API REST « Contacts »

Une API REST complète avec console de test intégrée. Elle existe en deux
modes, permutés automatiquement :

- **mode full-stack** : serveur Node.js natif (`node:http`) + base **SQLite**
  (`node:sqlite`) — zéro dépendance npm ;
- **mode local** : simulateur d'API dans la page, données en `localStorage`.

## Lancement (mode local)

Ouvrir `index.html` directement en `file://`, ou servir le dossier avec un
serveur statique (par ex. `node serveur/statique.js` →
`http://127.0.0.1:8913/api-contacts/`). Tout fonctionne, comme avant.

## Mode full-stack

```bash
node server.js        # → http://localhost:3101
```

Variable d'environnement : `PORT` (port d'écoute), `BASE` (chemin du fichier
SQLite).

La page détecte le serveur au démarrage (requête `HEAD` vérifiant l'en-tête
`X-Serveur` posé par `serveur/commun.js`), bascule les six points d'API sur
de véritables requêtes HTTP et affiche le moteur utilisé dans les puces
d'en-tête (« moteur Node.js · node:sqlite » ou « moteur local »). Le journal
des requêtes et la console de test fonctionnent dans les deux cas.

Sans serveur (`file://`, hébergement statique), la sonde échoue proprement :
aucune erreur console, mode local intégral.

### Routes

| Méthode | Chemin | Rôle |
|---|---|---|
| `GET` | `/api/sante` | sonde de détection (JSON `{ serveur: true }`) |
| `GET` | `/api/contacts` | liste : `q`, `tri` (`id`/`nom`/`ville`), `sens`, `page`, `limit` → `{ donnees, meta }` |
| `GET` | `/api/contacts/:id` | lecture unitaire → 200 ou 404 |
| `POST` | `/api/contacts` | création → 201, ou 400 `{ erreur, details }` |
| `PUT` | `/api/contacts/:id` | remplacement intégral |
| `PATCH` | `/api/contacts/:id` | mise à jour partielle (au moins un champ) |
| `DELETE` | `/api/contacts/:id` | suppression → 204 ou 404 |
| `POST` | `/api/reinitialiser` | vide la table puis réinsère les 8 exemples |

Les formes de réponse et les messages d'erreur sont identiques à celles du
simulateur local : l'interface ne voit pas la différence.

### Schéma (`donnees/bdd.sqlite`, gitignoré)

```sql
contacts(
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nom, email, ville, telephone,
  recherche TEXT  -- nom+email+ville+telephone normalisés (sans accent, minuscules)
  tri_nom   TEXT  -- colonnes fantômes recalculées à chaque écriture :
  tri_ville TEXT  -- recherche et tri insensibles aux accents FAITS EN SQL
)
```

Index sur `recherche`, `tri_nom`, `tri_ville`. Jeu de démonstration (8
contacts) inséré au premier lancement, dans une transaction.

### Exemples

```bash
# Liste paginée
curl "http://localhost:3101/api/contacts?limit=3"

# Recherche insensible aux accents : « fes » trouve « Fès »
curl "http://localhost:3101/api/contacts?q=fes"

# Tri par nom décroissant
curl "http://localhost:3101/api/contacts?tri=nom&sens=desc"

# Création (201), validation (400), suppression (204)
curl -X POST http://localhost:3101/api/contacts -H "Content-Type: application/json" \
     -d '{"nom":"Amine Sekkat","email":"amine.sekkat@example.ma","ville":"Rabat"}'
curl http://localhost:3101/api/contacts/999        # 404
curl -X DELETE http://localhost:3101/api/contacts/9
```

## Fichiers

- `server.js` — serveur + routes + schéma SQLite
- `js/script.js` — logique applicative, simulateur local, adaptateur dual
  (`brancherMoteurDistant()`, `envelopperJournal()`)
- `../serveur/commun.js` — bibliothèque serveur partagée
- `../shared/api-client.js` — détection du mode et appels HTTP génériques
- `../serveur/MODELE.md` — spécification de la passerelle full-stack
