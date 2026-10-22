# Messagerie — salons synchronisés en temps réel

Messagerie en temps réel : salons, réactions, réponses citées, édition en
place, accusés de lecture et indicateur de saisie. La synchronisation
fonctionne entre les onglets d'un navigateur (BroadcastChannel + repli
`storage`) **et**, en mode full-stack, entre tous les navigateurs via un
serveur Node + SQLite et un flux Server-Sent Events.

## Mode local (fichier)

Ouvrir `index.html` directement (`file://`) : tout est en `localStorage`,
aucun serveur requis.

## Mode full-stack

### Lancement

```bash
node server.js          # http://localhost:3104
```

Zéro dépendance npm : uniquement `node:http`, `node:fs`, `node:path` et
`node:sqlite` (natifs), via la bibliothèque commune `serveur/commun.js`.
Variables d'environnement : `PORT` (port d'écoute), `BASE` (chemin de la
base SQLite).

Base : `donnees-messagerie/bdd.sqlite` (à la racine du repo, gitignorée —
jamais servie en statique).

### Bascule des modes

`shared/api-client.js` sonde le serveur (en-tête `X-Serveur`) au démarrage.
- **Serveur détecté** : les salons et messages sont préchargés depuis
  l'API, les écritures partent en REST (écriture-transit différentielle :
  POST/PUT/DELETE par identifiant) et un `EventSource('/api/flux')`
  rechargent l'état à chaque événement.
- **Aucun serveur** (`file://` ou hébergement statique) : fonctionnement
  local identique à avant, `localStorage` + `BroadcastChannel`.

### Routes

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/api/flux` | flux SSE (événements `message`, `saisie`) |
| GET | `/api/salons` | liste des salons |
| POST | `/api/salons` | création (400 si nom vide ou doublon) |
| GET/PUT/DELETE | `/api/salons/:id` | lecture / modification (nom, épingle) / suppression (messages en cascade) |
| GET | `/api/messages` | liste des messages (`?salonId=` optionnel) |
| POST | `/api/messages` | envoi (400 si texte ou auteur vide, salon inconnu) |
| PUT/DELETE | `/api/messages/:id` | édition, réactions, vus / suppression |
| POST | `/api/reinit` | réinitialise avec le jeu de démonstration |
| POST | `/api/saisie` | relais de l'indicateur « est en train d'écrire… » (non persisté) |

### Schéma

- `salons(id TEXT PK, nom TEXT, epingle TEXT)` — `epingle` référence l'id
  du message épinglé du salon.
- `messages(id TEXT PK, salon_id TEXT → salons(id) ON DELETE CASCADE,
  auteur, texte, date, repond_a JSON, modifie, reactions JSON, vu JSON)`.
- Index : `messages(salon_id)`, `messages(date)`.

### Temps réel

Après chaque mutation persistée, le serveur diffuse un événement `message`
sur le hub SSE ; chaque client recharge alors les deux collections et
réutilise sa fonction `synchroniser()` existante. Le mécanisme
`BroadcastChannel`/`storage` reste intact pour les onglets locaux.
