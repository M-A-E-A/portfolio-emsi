# Quiz de culture générale

Quiz de 12 questions (Maroc, géographie, sciences, histoire & culture) en
HTML, CSS et JavaScript vanilla. Thème et difficulté au choix, chronomètre,
explications, meilleur score mémorisé et partage du score par lien URL.

- **Mode local (par défaut)** : la page fonctionne en `file://` ou servie
  statiquement — banque de questions en dur, meilleur score en
  `localStorage` (`quiz-meilleur`), réglage de thème local (`quiz-theme`).
- **Mode full-stack** : un serveur Node embarque la banque de questions et
  les records dans une base SQLite.

## Mode full-stack

### Lancement

```bash
node server.js        # puis ouvrir http://localhost:3106
```

Aucune dépendance npm : uniquement `node:http`, `node:fs`, `node:path` et
`node:sqlite` (natifs, Node ≥ 22.5). Variables d'environnement facultatives :
`PORT` (port d'écoute), `BASE` (chemin de la base SQLite).

Base : `donnees-quiz/bdd.sqlite` **à la racine du repo** (dossier
gitignoré `donnees*` — jamais servi en statique).

### Détection et adaptateur

`index.html` charge `../shared/api-client.js` avant `js/script.js`.
À l'ouverture, `init()` appelle `LumeAPI.detecter()` (en-tête `X-Serveur`) :
si un serveur Node répond, `brancherModeServeur()` précharge la banque
(`GET /api/questions`) et le meilleur score (`GET /api/records`), puis
installe une écriture-transit sur `stockage.ecrire` : chaque nouveau record
part en `POST /api/records` (feu-oublie). Sans serveur, la page reste
identique en `localStorage`.

### Routes

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/api/sante` | sonde de détection (`X-Serveur`) |
| GET | `/api/questions` | banque de 12 questions → `{donnees, meta}` |
| GET | `/api/records` | meilleur score → `{meilleur, meta}` |
| POST | `/api/records` | enregistre une partie (400 si invalide) |
| POST | `/api/reinit` | efface les records, la banque est recréée si besoin |

### Schéma

```sql
questions(id INTEGER PK, theme, question, options TEXT/*JSON[4]*/,
          bonne INTEGER/*0..3*/, explication)
records  (id INTEGER PK, score INTEGER, total INTEGER, theme TEXT, date TEXT)
```

Le score partagé par URL (`?score=…&total=…`) reste strictement validé côté
client et fonctionne dans les deux modes.
