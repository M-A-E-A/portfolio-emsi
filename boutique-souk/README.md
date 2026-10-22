# Souk — boutique artisanale

Boutique en ligne d'objets artisanaux marocains en HTML, CSS et JavaScript
vanilla : catalogue filtrable, fiches produit, avis clients, favoris,
panier et commande avec confirmation.

- **Mode local (par défaut)** : la page fonctionne en `file://` ou servie
  statiquement — catalogue en dur, panier / avis / favoris en
  `localStorage`, thème local (`souk-theme`).
- **Mode full-stack** : un serveur Node embarque le catalogue, les avis, le
  panier, les favoris et les commandes dans une base SQLite.

## Mode full-stack

### Lancement

```bash
node server.js        # puis ouvrir http://localhost:3103
```

Aucune dépendance npm : uniquement `node:http`, `node:fs`, `node:path` et
`node:sqlite` (natifs, Node ≥ 22.5). Variables d'environnement facultatives :
`PORT` (port d'écoute), `BASE` (chemin de la base SQLite).

Base : `donnees-boutique/bdd.sqlite` **à la racine du repo** (dossier
gitignoré `donnees*` — jamais servi en statique).

### Détection et adaptateur

`index.html` charge `../shared/api-client.js` avant `js/script.js`.
À l'ouverture, `initialiser()` appelle `LumeAPI.detecter()` (en-tête
`X-Serveur`) ; si un serveur Node répond, `brancherModeServeur()` précharge
le catalogue, les avis, le panier et les favoris, puis installe une
écriture-transit sur `stockage.ecrire` : chaque changement de panier ou de
favoris remplace la collection côté serveur (`PUT`, feu-oublie). La
publication d'un avis part directement en `POST /api/avis` et la validation
de commande en `POST /api/commandes` (avant de vider le panier). Sans
serveur, tout reste en `localStorage`, à l'identique.

### Routes

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/api/sante` | sonde de détection (`X-Serveur`) |
| GET | `/api/articles` | catalogue → `{donnees, meta}` |
| GET | `/api/articles/:id` | un article (404 si inconnu) |
| GET | `/api/avis` | avis groupés par article → `{donnees, meta}` |
| POST | `/api/avis` | crée un avis (validations identiques au formulaire, 400) |
| DELETE | `/api/avis/:id` | supprime un avis (404 si inconnu) |
| GET | `/api/panier` | panier → `{donnees: [{id, qte}]}` |
| PUT | `/api/panier` | remplacement intégral (400 sur article/quantité invalide) |
| DELETE | `/api/panier` | vide le panier (204) |
| GET | `/api/favoris` | favoris → `{donnees: [id]}` |
| PUT | `/api/favoris` | remplacement intégral (400 si article inconnu) |
| POST | `/api/commandes` | journalise la commande validée (400 si invalide) |
| POST | `/api/reinit` | remet catalogue + avis de démonstration, vide panier/favoris |

### Schéma

```sql
articles (id TEXT PK, nom, prix, categorie, stock, accroche, description,
          details TEXT/*JSON*/, recherche, tri_nom /* normalisés */)
avis     (id TEXT PK, article_id → articles(id), auteur, note 1-5, texte, date)
panier   (article_id PK → articles(id), qte)
favoris  (article_id PK → articles(id))
commandes(id INTEGER PK, numero, nom, email, adresse, lignes TEXT/*JSON*/,
          sous_total, livraison, total, date)
```

Les identifiants texte (`theiere`, `tapis`…) sont ceux du front : panier,
favoris et avis restent compatibles entre les deux modes.
