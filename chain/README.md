# Blockchain from scratch — preuve de travail, Merkle et signatures

Une chaîne de blocs écrite à la main en JavaScript : blocs, transactions
signées (ECDSA P-256 via WebCrypto), arbre de Merkle, preuve de travail
SHA-256, portefeuille, explorateur et mini-marché. La démo fonctionne
telle quelle, ouverte en `file://` ou servie en statique — aucun back-end
requis.

**Sécurité** : la clé privée du portefeuille (`chain-portefeuille`) est
et reste dans le `localStorage` du navigateur. Il n'existe **aucune**
route serveur pour la recevoir ni la servir. Seule la chaîne de blocs —
qui est publique par nature — est persistée côté serveur.

## Lancement local (aucun serveur)

Ouvrir `index.html` en `file://`, ou servir le dossier en statique
(par ex. `node serveur/statique.js` → `http://127.0.0.1:8913/chain/`).
Minage, transferts signés, achats et vérification fonctionnent entièrement
en `localStorage`.

## Mode full-stack

```bash
node chain/server.js         # ou PORT=3108 BASE=… node server.js
```

Puis ouvrir `http://localhost:3108/`.

- **Détection** : sonde `HEAD` (shared/api-client.js) ; la présence de
  l'en-tête `X-Serveur` bascule l'app sur SQLite, sinon tout reste local.
- **Architecture** : préchargement `GET /api/chaine` au démarrage, puis
  écriture-transit (*write-through* en feu-oublie) depuis `sauvegarder()`
  après chaque minage, changement de difficulté ou réinitialisation. Les
  transactions signées qui attendent d'être minées ne sont persistées
  que lorsqu'elles entrent dans un bloc — comme avant.

### Routes

| Méthode | Chemin | Description |
|---------|--------|-------------|
| GET | `/api/sante` | sonde de détection (`X-Serveur`) |
| GET | `/api/chaine` | `{ blocs, difficulte, compteur }`, même forme que localStorage |
| PUT | `/api/chaine` | remplacement intégral — **400 si un lien `previousHash` est rompu** |
| POST | `/api/reinit` | repart d'une chaîne vide (pas de bloc de genèse dans la démo) |

### Schéma (`donnees-chain/bdd.sqlite`, à la racine du repo, gitignoré)

```sql
CREATE TABLE blocs (
  "index"       INTEGER PRIMARY KEY,  -- position dans la chaîne
  transactions  TEXT    NOT NULL,     -- JSON [{ expediteur, destinataire, … }]
  previous_hash TEXT    NOT NULL,     -- lien cryptographique
  difficulty    INTEGER NOT NULL,
  timestamp     INTEGER NOT NULL,
  nonce         INTEGER NOT NULL,
  merkle_root   TEXT    NOT NULL,
  hash          TEXT    NOT NULL,
  duree_ms      INTEGER
);
CREATE TABLE parametres (
  cle    TEXT PRIMARY KEY,   -- 'difficulte', 'compteur'
  valeur TEXT NOT NULL
);
```

La validation du `PUT` rejette toute chaîne dont l'index est incohérent
ou dont le `previousHash` d'un bloc ne correspond pas au `hash` du bloc
précédent : la base distante ne peut pas devenir incohérente avec ce que
le mineur a produit.

### Exemples

```bash
# État de la chaîne
curl http://localhost:3108/api/chaine

# Chaîne valide (vide) acceptée
curl -X PUT http://localhost:3108/api/chaine \
  -H 'Content-Type: application/json' \
  -d '{"blocs":[],"difficulte":2,"compteur":0}'

# Chaîne rompue → 400
curl -i -X PUT http://localhost:3108/api/chaine \
  -H 'Content-Type: application/json' \
  -d '{"blocs":[{"index":0,"transactions":[],"previousHash":"00","difficulty":1,"timestamp":1,"nonce":0,"merkleRoot":"00","hash":"aa"},{"index":1,"transactions":[],"previousHash":"ff","difficulty":1,"timestamp":2,"nonce":0,"merkleRoot":"00","hash":"bb"}],"difficulte":2,"compteur":0}'

# Réinitialisation
curl -X POST http://localhost:3108/api/reinit
```

Le thème (`chain-theme`) et le portefeuille (`chain-portefeuille`) ne
passent jamais par le serveur.
