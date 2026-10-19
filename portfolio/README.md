# Portfolio — Abderrahmane El ADNANI

Portfolio personnel (CV en ligne) en **HTML, CSS et JavaScript**, sans aucune
dépendance ni librairie externe.

## Structure

```
portfolio/
├── index.html          page principale (sections ancrées)
├── css/style.css       jetons de design, mise en forme, responsive, mode sombre, 6 fonds
├── js/script.js        10 interactions (+ bonus), en JavaScript « vanilla »
├── projets/            une page de détail par projet
│   ├── projet.css      styles communs à ces pages
│   ├── projet.js       aperçu détaillé + visionneuse et démos interactives
│   ├── souk.html
│   ├── api-rest.html
│   ├── messagerie.html
│   ├── depenses.html
│   ├── carte.html
│   ├── quiz.html
│   ├── tri.html
│   ├── sgbd.html
│   ├── duel.html
│   ├── bootstrap.html
│   ├── tailwind.html
│   ├── wordpress.html
│   └── python.html
├── img/photo.svg       portrait (à remplacer par votre photo)
├── img/m3.png          logo affiché dans l'en-tête
├── img/favicon.svg     icône de l'onglet
└── README.md
```

Pour l'ouvrir : double-cliquez sur `index.html`. Chaque projet ouvre sa propre
page dans `projets/` ; le lien « ← Retour au portfolio » ramène à la section
*Projets*. Depuis une page projet, le bouton **« Voir la démo »** ouvre
l'application complète du projet, livrée dans le dossier parent (voir
*Applications de démonstration* plus bas).

## Design

Direction « dessin technique » : papier froid, encre, **un seul accent bleu**.

- **Couleurs** — centralisées dans `:root` : `--papier`, `--encre`, `--accent`…
- **Typographie** — *Space Grotesk* pour les titres, *Inter* pour le texte
  (repli automatique sur les polices système si indisponibles).
- **Mise en page** — filets de séparation, mesures de lecture limitées,
  chiffres tabulaires (pourcentages, années).
- **Icônes** — petit jeu de symboles SVG intégré (`<symbol>` + `<use>`),
  donc net à toute taille et sans fichier externe (réseaux, outils, projets).
- **Fond animé** — calque fixe placé derrière le contenu (`.fond-anime`) :
  un dégradé de base et quatre halos radiaux qui dérivent lentement. Très
  discret en clair ; en sombre il reprend l'ambiance « nuit indigo » du fond
  d'écran fourni.

## Pages projet

Chaque projet du portfolio possède sa page (`projets/*.html`). Elles suivent
toutes le même plan :

| Section | Contenu |
|---------|---------|
| En-tête | fil d'Ariane « ← Tous les projets », titre, année, bouton **« Voir la démo »** |
| Fiche | rôle, contexte, statut |
| Technologies | étiquettes (`.stack`) |
| Le point de départ | pourquoi le projet, ce qui a motivé le choix |
| L'objectif | ce que le résultat devait permettre |
| Ce que j'ai construit | liste des fonctionnalités (`.liste-puces`) |
| Les étapes | déroulé numéroté (`.etapes` + `.etape-num`) |
| Aperçu | aperçu cliquable (`.apercu-bouton`) : ouvre l'application en grand |
| Les difficultés | ce qui a bloqué et comment c'est résolu |
| Ce que j'en retiens | le bilan |

Elles réutilisent `css/style.css` (mêmes jetons, en-tête et pied de page) et
ajoutent `projets/projet.css` pour la mise en page propre au détail. Le mode
sombre et l'année du pied de page y fonctionnent aussi, via le même
`js/script.js`.

La section **Aperçu** est agrandissable : la maquette est un bouton qui ouvre
une visionneuse (lightbox) affichant **l'application du projet en grand**. Il
ne s'agit pas de blocs gris mais d'une petite interface réaliste, avec du texte
et des chiffres réels, et quelques interactions :

| Projet | Aperçu agrandi | Interaction |
|--------|----------------|-------------|
| Boutique « Souk » | mini-catalogue (noms, prix, panier) | « Ajouter » incrémente le panier |
| API REST « Contacts » | routes GET/POST/PUT/DELETE et réponses JSON | cliquer une route affiche sa réponse |
| Messagerie | liste de salons et fil de messages | écrire puis « Envoyer » ajoute un message |
| Suivi de dépenses | tuiles de totaux, graphique par mois, historique | cliquer un mois affiche son total |
| Carte des points d'intérêt | plan quadrillé, marqueurs, liste des lieux | cliquer un lieu met en avant son marqueur |
| Quiz | question, 4 réponses, progression et score | cliquer une réponse donne le résultat |
| Tri-visualiseur | barres de hauteurs différentes, compteurs, tableau des complexités | lancer puis suivre l'exécution |

La visionneuse s'ouvre au clic, se ferme avec le bouton ✕, un clic sur le fond
ou la touche `Échap`, et le focus revient sur l'aperçu. Sans JavaScript,
l'aperçu réduit reste visible et la page fonctionne : rien n'est cassé.

Pour ajouter une page : copiez un fichier de `projets/`, changez le titre, le
texte, l'icône (`<use href="#i-…">`) et ajoutez le lien correspondant dans la
section *Projets* de `index.html`.

## Applications de démonstration

Les douze projets existent aussi en **application complète**, livrée à part dans
le dossier parent. Chaque démo est un mini-site autonome
(`index.html` + `css/style.css` + `js/script.js`), sans librairie, sans
serveur ni étape de compilation.

```
PROJECTS/
├── portfolio/             ce portfolio (CV en ligne)
├── boutique-souk/         boutique en ligne (catalogue, fiches produit, avis, favoris, panier)
├── api-contacts/          API REST simulée (recherche, tri, pagination) + console
├── api-express/           vraie API REST en Express.js (routes CRUD, validation, codes HTTP)
├── messagerie-temps-reel/ messagerie synchronisée (réactions, réponses citées, édition)
├── suivi-depenses/        suivi de budget (saisie, budgets, répartition en anneau, graphique, CSV)
├── carte-points-interet/  carte SVG de Marrakech (déplacement, import/export JSON)
├── quiz-culture-generale/ quiz de 12 questions (thèmes, difficulté, chrono, révision)
├── tri-visualiseur/       5 algorithmes de tri animés (pas à pas, compteurs, complexités)
├── mini-sgbd/             moteur SQL (analyse lexicale, parseur, exécution de SELECT et UPDATE)
├── duel-tri/              duel de tris (six algorithmes, même tableau, bilan par mesure)
├── bootstrap-demo/        tableau de bord Bootstrap 5 (grille, cartes, tableau, modale, thème)
├── tailwind-demo/         page marketing Tailwind CSS (utility-first, responsive, mode sombre)
├── wp-theme-portfolio/    thème WordPress (templates, boucle, 404, menus, widgets)
└── python-analyse/        outil CLI Python (statistiques CSV, regroupement)
```

Depuis chaque page projet, le bouton **« Voir la démo »** ouvre l'application
correspondante dans un nouvel onglet. Chaque application s'ouvre aussi
directement, en double-cliquant son `index.html` (aucun serveur n'est requis).

| Projet | Dossier | Ce qu'on peut y faire |
|--------|---------|-----------------------|
| Boutique « Souk » | `boutique-souk/` | chercher, filtrer, ouvrir une fiche produit, lire et déposer un avis, gérer ses favoris, remplir le panier, commander |
| API « Contacts » | `api-contacts/` | appeler GET/POST/PUT/DELETE, lire les codes 200/201/204/400/404, rechercher, trier, paginer, gérer les contacts |
| Messagerie | `messagerie-temps-reel/` | créer des salons, envoyer des messages, réagir, citer, modifier, synchronisation entre onglets |
| Suivi de dépenses | `suivi-depenses/` | saisir des dépenses, fixer un budget par catégorie, voir la répartition du mois, filtrer, exporter en CSV |
| Carte des points d'intérêt | `carte-points-interet/` | chercher, filtrer, déplacer un lieu, ajouter et supprimer, importer et exporter en JSON |
| Quiz | `quiz-culture-generale/` | questions par thème et difficulté, chronomètre, correction, révision des erreurs, meilleur résultat |
| Tri-visualiseur | `tri-visualiseur/` | choisir un algorithme et une forme de données, lancer ou avancer pas à pas, lire les comparaisons et les écritures |
| Mini-SGBD | `mini-sgbd/` | écrire du SQL, voir les jetons puis l'arbre syntaxique, lire le trace d'exécution, jointures, agrégats, INSERT/UPDATE/DELETE, annuler ou réinitialiser |
| Duel de tris | `duel-tri/` | choisir deux algorithmes et une forme de données, les faire avancer côte à côte sur la même table, lire comparaisons et écritures séparément, voir qui termine |
| Tableau de bord Bootstrap | `bootstrap-demo/` | grille, cartes, tableau, formulaire validé, alertes, modale, barre de progression, mode sombre |
| Page Tailwind CSS | `tailwind-demo/` | page marketing utility-first, responsive, mode sombre — CSS généré par build Tailwind réel |
| Thème WordPress | `wp-theme-portfolio/` | thème WP complet (index, single, page, archive, 404, menus, widgets) — à installer dans wp-content/themes/ |
| API Express « Contacts » | `api-express/` | vraie API REST : routes CRUD, validation, pagination, tri, recherche, codes HTTP réels — à lancer avec `npm start` |
| Analyse CSV — Python | `python-analyse/` | outil CLI : statistiques par colonne, regroupement — à lancer avec `python analyse.py` |

Chaque application mémorise ses données dans le navigateur (`localStorage`) :
le panier, les contacts, les messages, les dépenses, les lieux, le meilleur
score, les réglages de visualisation et la base de démonstration sont conservés
d'une visite à l'autre.
Aucune donnée n'est envoyée à un serveur : tout se passe côté client. Le
contenu des projets (articles, contacts, lieux…) est un jeu de démonstration.

## Interactions JavaScript (10)

| # | Interaction | Détail |
|---|-------------|--------|
| 1 | **Mode sombre / clair** | bouton dans l'en-tête, choix mémorisé (`localStorage`) + préférence système |
| 2 | **Menu mobile** | ouverture / fermeture, fermeture au clic extérieur ou avec `Échap` |
| 3 | **Voir plus / moins** | déplie les détails d'un projet (délégation d'événement) |
| 4 | **Coordonnées en alerte** | affiche e-mail, téléphone et ville |
| 5 | **Message d'accueil selon l'heure** | Bonjour, Bon après-midi, Bonsoir, Bonne nuit |
| 6 | **Barres de compétences animées** | se remplissent à l'apparition (`IntersectionObserver`), avec un reflet continu |
| 7 | **Formulaire validé** | vérifie nom, e-mail, message et consentement, puis confirme |
| 8 | **Aperçu / démo du projet** | ouvre l'application en grand ; panier, envoi de message, routes d'API, mois, lieux et quiz y sont manipulables (pages `projets/`) |
| 9 | **Choix du fond** | bouton fixe en bas à gauche ouvrant une liste de radios : grille de points, rubans d'aurore, lignes de niveau, plat et lumière, constellation réactive au curseur, aurore d'origine. Le choix est mémorisé et suivi par toutes les pages |
| 10 | **Duel de tris** | deux candidats avancent opération par opération sur la même table ; les comparaisons et les écritures sont comptées séparément, et le bilan donne l'avantage mesure par mesure |

Bonus : année automatique dans le pied de page et lien du menu mis en évidence
pendant le défilement (`aria-current`).

Le fond est construit entièrement en JavaScript : une seule source `js/script.js`
tourne sur les dix pages, qui ne diffèrent que par l'attribut `data-fond` posé
sur `.fond-anime`. Sans JavaScript, la page garde l'aurore d'origine déjà
écrite dans le HTML, et le mouvement s'arrête sous `prefers-reduced-motion`.

## Accessibilité

- Lien d'évitement clavier, `aria-*` sur les boutons, focus visible soigné
- Contrastes vérifiés (WCAG AA) en clair comme en sombre
- Respect de `prefers-reduced-motion` (animations neutralisées, sauf le fond
  animé qui reste volontairement en mouvement, très lent)
- Contenu visible même sans JavaScript

## Personnalisation

- **Nom / textes** : modifiez `index.html`.
- **Contacts** : cherchez `m.a.eladnani1@gmail.com` et `+212 7 77 60 92 28`
  dans `index.html` **et** `js/script.js`.
- **Couleurs** : variables `:root` en haut de `css/style.css`.
- **Photo** : remplacez `img/photo.svg` et adaptez le `src`/`alt`.
- **Logo de l'en-tête** : remplacez `img/m3.png` (image à fond transparent,
  posée sur une pastille sombre pour rester lisible en clair comme en sombre).
- **Fond animé** : réglez les couleurs et l'opacité des halos avec les variables
  `--ciel-*` et `--blob-*` (section 12 de `css/style.css`).
- **Projets** : les entrées sont dans `index.html` (section *Projets*) ; leur
  page de détail est dans `projets/`.
