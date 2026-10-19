# Idées pour aller plus loin

Ce document rassemble des pistes pour prolonger le portfolio : d'abord des
évolutions des **six applications existantes**, puis de **nouvelles idées de
projets** à ajouter à côté. Rien n'est engagé — c'est une réserve d'idées,
classée par difficulté.

Difficulté : ● facile · ●● moyen · ●●● avancé.
Tout reste faisable en HTML, CSS et JavaScript vanilla, sans serveur ni étape
de compilation, comme les six démos actuelles.

---

## 1. Évolutions des six applications

### Boutique « Souk »

| Idée | Ce que ça apporte | Niveau |
|------|-------------------|:------:|
| Fiche produit (fenêtre) | image/galerie, description longue, ajout au panier depuis la fiche | ● |
| Tri et fourchette de prix | trier par prix ou nouveauté, curseur de prix | ● |
| Codes promo | champ « code » qui applique une remise au sous-total | ●● |
| Favoris (liste d'envies) | cœur sur chaque article, page dédiée, conservé en local | ●● |
| Avis clients | notation en étoiles et commentaires par article | ●● |
| Suivi de commande | après validation, une page de statut (préparée / expédiée / livrée) | ●● |
| Panier partagé entre onglets | réutiliser `BroadcastChannel` : même panier dans tous les onglets | ●● |
| Annonces vocales du panier | `aria-live` pour annoncer « ajouté », « total mis à jour » | ● |

### API « Contacts »

| Idée | Ce que ça apporte | Niveau |
|------|-------------------|:------:|
| Passer à IndexedDB | une vraie base dans le navigateur, plus proche d'un SGBD | ●●● |
| Recherche et pagination | `?q=`, `?page=&limit=`, `?tri=nom` sur `GET /contacts` | ●● |
| Route `PATCH` | mise à jour partielle (un seul champ) | ● |
| Authentification simulée | jeton requis, réponse `401` sinon | ●● |
| Journal des requêtes | historique des appels (méthode, statut, durée) | ● |
| Limitation de débit | refuser au-delà de X appels/minute (`429`) | ●● |
| Tests automatisés | une petite suite qui vérifie les cinq routes | ●● |
| Documentation intégrée | une page « référence » listant routes et exemples | ● |

### Messagerie

| Idée | Ce que ça apporte | Niveau |
|------|-------------------|:------:|
| Réactions emoji | réagir à un message, compteurs par emoji | ●● |
| Répondre / citer | fil de réponse sur un message précis | ●● |
| Modifier / supprimer | édition limitée à ses messages, mention « message supprimé » | ●● |
| « Vu par » | accusés de lecture entre onglets | ●● |
| Recherche dans les messages | filtrer l'historique par mot-clé | ● |
| Notifications | `Notification` du navigateur pour un nouveau message | ●● |
| Historique paginé | charger les anciens messages par paquets | ●● |
| Salons protégés | mot de passe simulé pour rejoindre un salon | ●●● |

### Suivi de dépenses

| Idée | Ce que ça apporte | Niveau |
|------|-------------------|:------:|
| Budgets par catégorie | une enveloppe mensuelle + barre d'alerte quand on approche | ●● |
| Répartition (camembert) | part de chaque catégorie, en plus des barres par mois | ●● |
| Comparaison au mois précédent | flèche « +12 % » sur chaque tuile | ● |
| Dépenses récurrentes | loyer, abonnements générés automatiquement | ●● |
| Import CSV | en plus de l'export : relire un fichier exporté | ●● |
| Objectif d'épargne | un montant cible et sa progression | ● |
| Multi-devises | saisie dans une autre devise + taux fixe | ●●● |
| Export PDF | une version imprimable du mois | ●● |

### Carte des points d'intérêt

| Idée | Ce que ça apporte | Niveau |
|------|-------------------|:------:|
| Itinéraire entre deux lieux | un chemin calculé sur le plan (voir Dijkstra plus bas) | ●●● |
| Quartiers / zones | colorer des zones et filtrer par quartier | ●● |
| Regroupement des punaises | regrouper les points proches quand on dézoome | ●●● |
| Déplacer un lieu | glisser une punaise pour la repositionner | ●● |
| Import / export | lire et écrire un fichier de lieux (type GeoJSON simplifié) | ●● |
| Mesurer une distance | tracer deux points et lire la distance approximative | ●● |
| « Près de moi » | géolocalisation du navigateur et tri par distance | ●● |
| Photos de lieu | une image par lieu (fichier local en dataURL) | ●● |

### Quiz de culture générale

| Idée | Ce que ça apporte | Niveau |
|------|-------------------|:------:|
| Catégories et difficulté | choisir un thème et un niveau avant de jouer | ●● |
| Chronomètre | temps limité par question ou au total | ●● |
| Mode révision | rejouer uniquement les questions ratées | ●● |
| Statistiques | progression dans le temps, meilleur score par thème | ●● |
| Partage du score | lien avec le score dans l'adresse (`?score=9&total=12`) | ● |
| Deux joueurs (même écran) | chacun son tour, duel à la fin | ●● |
| Banque de questions externe | charger les questions depuis un fichier JSON | ●● |
| Indices | un indice coûte la moitié des points de la question | ●● |

---

## 2. Nouvelles idées de projets

Des projets à ajouter comme septième, huitième… application. Ils élargissent le
profil au-delà de l'interface : algorithmique, jeux, API, persistance.

| Projet | En une phrase | Stack | Ce que ça prouve | Niveau |
|--------|---------------|-------|------------------|:------:|
| **Visualiseur de tris** | Des barres qui se réordonnent sous vos yeux (bulles, insertion, rapide, fusion). | JS + CSS/SVG | algorithmique, animation | ●● |
| **Plus court chemin** | Un graphe de villes, et le chemin le plus court mis en évidence (Dijkstra). | JS + SVG | graphes, algorithmes | ●●● |
| **Duel à deux onglets** | Morpion ou Puissance 4 joué dans deux onglets, en direct. | JS + `BroadcastChannel` | temps réel (déjà utilisée en messagerie) | ●● |
| **Kanban** | Tâches à glisser-déposer entre « à faire / en cours / terminé ». | JS + API Drag & Drop | glisser-déposer, état | ●● |
| **Météo** | Ville cherchée, prévisions sur 7 jours, favoris. | `fetch` + API publique | appels réseau, `async/await` | ●● |
| **Notes Markdown** | Écrire à gauche, voir le rendu à droite, rechercher et exporter. | JS | analyse syntaxique, rendu | ●● |
| **Calculatrice d'unités** | Longueurs, masses, devises, températures, avec historique. | JS + CSS | calculs, interface | ● |
| **Machine de Turing** | Un ruban, des états, on la fait tourner pas à pas. | JS + SVG | théorie des langages (EMSI) | ●●● |
| **Notes hors-ligne** | Un carnet installable qui marche sans réseau. | IndexedDB + Service Worker | persistance, PWA | ●●● |
| **Chiffrement ludique** | Chiffrer un message : César, Vigenère, puis un RSA simplifié. | JS + BigInt | crypto de base, maths | ●● |
| **Galerie photo** | Grille d'images, filtres, visionneuse plein écran. | JS + CSS | mise en page, lightbox | ● |
| **Gestionnaire de mots de passe local** | Générer un mot de passe fort, estimer sa solidité, tout stocker en local. | JS + Web Crypto | sécurité, `crypto` | ●● |

### Pistes transverses (autour du portfolio lui-même)

- **Hub de démos** : une page qui présente les six (bientôt sept…) applis avec un bouton « Ouvrir » pour chacune.
- **Version anglaise** du portfolio (ou une bascule FR / EN).
- **Impression du CV** : une feuille de style `@media print` pour un PDF propre.
- **Page « veille » / notes** : quelques articles courts sur ce qui est appris.
- **Déploiement GitHub Pages** : un lien en ligne à mettre sur LinkedIn.
- **Tests + intégration continue** : une petite suite de tests lancée à chaque `push` (GitHub Actions).

---

## 3. Ajouter un projet au portfolio (rappel du fonctionnement)

Pour chaque nouvelle idée retenue :

1. Créer un dossier frère de `portfolio/` : `PROJECTS/<nom-du-projet>/`
   avec `index.html`, `css/style.css`, `js/script.js`.
2. Créer sa page de détail : `portfolio/projets/<nom>.html`
   (copier une page existante, changer le titre, le texte, l'icône et le lien de
   démo), puis ajouter le bloc correspondant dans la section *Projets* de
   `portfolio/index.html`.
3. Compléter le tableau « Applications de démonstration » du `README.md`.

Ces trois étapes suffisent : la page de détail, la carte du portfolio et la
démo sont alors reliées dans les deux sens.

---

## 4. Par où commencer ?

Trois idées au meilleur rapport effort / effet sur un portfolio :

1. **Visualiseur de tris** — court à écrire, très parlant en entretien, et il
   ajoute de l'algorithmique au profil.
2. **Recherche + pagination sur l'API « Contacts »** — perfectionne une appli
   déjà solide et prépare un vrai raisonnement « back-end ».
3. **Budgets par catégorie** dans le suivi de dépenses — transforme un carnet en
   outil qu'on utilise vraiment, avec des alertes visuelles.
