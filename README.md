# Portfolio — Abderrahmane El ADNANI

> Un portfolio vivant : 20 projets détaillés, un thème de fond animé, un mode sombre persistant, et 17 démos standalone.

---

## ✨ En une ligne

**Portfolio + 17 démo-apps + thème partagé (fond animé + dark/light)** — en pur HTML/CSS/JS, sans framework obligatoire, fonctionnel sur `file://`.

---

## 🏗 Structure

```
portfolio/           → site portfolio (20 projets détaillés, fond animé, thème)
shared/              → theme.css + theme.js + themes.css (fond animé, thème, 17 palettes)
python-analyse/      → CLI Python : analyse CSV (stats par colonne)
api-express/         → API REST Express.js (routes, validation, codes HTTP)
tailwind-demo/       → page marketing construite avec Tailwind CSS
wp-theme-portfolio/  → thème WordPress minimal (index, single, archive, 404)
api-contacts/        → API REST simulée (recherche, tri, pagination)
bootstrap-demo/      → tableau de bord Bootstrap 5 (grille, cartes, formulaire)
boutique-souk/       → boutique artisanale (fiches, avis, panier, favoris)
duel-tri/            → duel de 6 algorithmes de tri (comparaisons comptées)
messagerie-temps-reel/ → messagerie instantanée entre onglets (réactions, réponses)
mini-sgbd/           → moteur SQL en JS (SELECT, JOIN, GROUP BY, INSERT)
quiz-culture-generale/ → quiz chronométré (12 questions, explications, score)
suivi-depenses/      → suivi des dépenses (catégories, graphique, filtre)
tri-visualiseur/     → visualiseur de 5 algorithmes de tri (pas à pas)
raytracer/           → moteur de rendu 3D logiciel (ray tracing, Fresnel, Snell)
lang/                → interpréteur de langage + débogueur visuel (pas à pas)
chain/               → blockchain (proof-of-work, Merkle, ECDSA, explorateur)
p2p/                 → messagerie pair à pair chiffrée (WebRTC + WebCrypto)
whiteboard/          → tableau blanc collaboratif (CRDT OR-Set, undo/redo)
nn/                  → réseau de neurones (backpropagation, Adam, CNN)
```

---

## 🎨 Ce qui rend ce repo remarquable

### 1. Fond animé partagé (`shared/theme.css` + `shared/theme.js`)
- **6 variantes** : `grille`, `soie`, `contours`, `plat`, `ruban`, `aurore` (blobs + grain)
- **Animation CSS pure** : `@keyframes derive` (30–44 s) — pas de JS, pas de filtre blur
- **Une variante par projet**, portée par `data-fond` sur `<body>` et `data-projet` pour la palette
- **Un seul calque `.fond-anime`** injecté par `shared/theme.js`, commun à toutes les démos
- **Mouvement réduit** : une règle unique dans `shared/theme.css` neutralise le fond pour
  tous les projets quand `prefers-reduced-motion: reduce` est actif

### 2. Thème clair / sombre
- **Persistance** via `localStorage`, avec une clé isolée par démo
  (`bootstrap-demo-theme`, `souk-theme`, `raytracer-theme`, `chain-theme`…) :
  les 17 apps ne se marchent pas dessus
- **Appliqué avant le premier rendu** : un script en ligne dans `<body>` pose la classe
  `sombre` — pas de flash clair au chargement
- **Un bouton `#theme`** par projet — chaque app conserve son propre mécanisme
  (aucun conflit entre le portfolio et les démos)
- **Tailwind compatible** : `tailwind-demo` active aussi `html.dark` pour les utilitaires `dark:`
- **Contraste garanti** : le jeton `--sur-accent` choisit automatiquement la couleur de texte
  posée sur un aplat d'accent (blanc en clair, encre en sombre) — plus de texte illisible

### 3. Accessibilité
- **Lien d'évitement** implémenté une seule fois dans `shared/theme.css` (identique dans les 17 démos)
- **`main#contenu`** unique par page, hiérarchie de titres continue (h1 → h2 → h3)
- **Contrastes WCAG AA** vérifiés par Lighthouse en mode clair **et** sombre
- **`aria-pressed` / `aria-label` / `title`** sur chaque bouton de thème

### 4. Performance
- **Aucun framework obligé** pour le portfolio — tout en vanilla
- **Lighthouse 100 / 100 / 100** (accessibilité, bonnes pratiques, SEO) sur **les 18 pages
  principales et les 20 fiches projet**, en mode clair comme en mode sombre
- **Pas de dépendance externe** au lancement (hors polices Google et Tailwind pour la démo)

### 5. Les six projets « from scratch »
| Projet | Ce qui est écrit à la main |
|---|---|
| `raytracer` | Lancer de rayons, z-buffer, ombres douces, Fresnel, Snell, tone mapping ACES |
| `lang` | Lexer, analyseur récursif descendant, arbre syntaxique, évaluateur générateur, débogueur |
| `chain` | Blocs, transactions signées ECDSA, arbre de Merkle, preuve de travail SHA-256 |
| `p2p` | Signalisation WebRTC, DataChannel, ECDH P-256, AES-GCM 256, empreintes de clés |
| `whiteboard` | OR-Set, fusion commutative, LWW, undo par sémaphore, convergence vérifiée |
| `nn` | Forward pass, rétropropagation, Adam, jeu de données synthétiques |

---

## 🚀 Démos rapides

| Projet | Démo | Source |
|---|---|---|
| **Portfolio** | [index.html](portfolio/index.html) | `portfolio/` |
| **Raytracer 3D** | [raytracer/index.html](raytracer/index.html) | `raytracer/` |
| **Interpréteur** | [lang/index.html](lang/index.html) | `lang/` |
| **Blockchain** | [chain/index.html](chain/index.html) | `chain/` |
| **P2P chiffré** | [p2p/index.html](p2p/index.html) | `p2p/` |
| **Tableau blanc** | [whiteboard/index.html](whiteboard/index.html) | `whiteboard/` |
| **Réseau de neurones** | [nn/index.html](nn/index.html) | `nn/` |
| **Analyse CSV (Python)** | [apercu.html](python-analyse/apercu.html) | `python-analyse/` |
| **API Express (Node.js)** | [apercu.html](api-express/apercu.html) | `api-express/` |
| **Thème WordPress** | [apercu.html](wp-theme-portfolio/apercu.html) | `wp-theme-portfolio/` |
| **Tailwind** | [tailwind-demo/index.html](tailwind-demo/index.html) | `tailwind-demo/` |
| **WordPress** | `wp-theme-portfolio/index.php` | `wp-theme-portfolio/` |
| **API Contacts** | [api-contacts/index.html](api-contacts/index.html) | `api-contacts/` |
| **Duel de tris** | [duel-tri/index.html](duel-tri/index.html) | `duel-tri/` |

### Lancer en local

```bash
# n'importe quel serveur statique suffit
python -m http.server 8000
# puis http://127.0.0.1:8000/portfolio/index.html
```

Les pages fonctionnent aussi ouvertes directement en `file://` (stockage protégé par `try/catch`).

### Les trois projets qui ne sont pas des pages web

`api-express/`, `python-analyse/` et `wp-theme-portfolio/` sont un serveur Node, un script
Python et un thème PHP. Chacun a une **page d'aperçu** dans le navigateur, qui rejoue le
comportement réel :

| Projet | Aperçu | Pour le lancer pour de vrai |
|---|---|---|
| `api-express` | [apercu.html](api-express/apercu.html) | `cd api-express && npm install && npm start` |
| `python-analyse` | [apercu.html](python-analyse/apercu.html) | `python analyse.py donnees.csv --groupe ville` |
| `wp-theme-portfolio` | [apercu.html](wp-theme-portfolio/apercu.html) | copier le dossier dans `wp-content/themes/` |

---

## 📊 Technologies principales

- **HTML5 / CSS3 / JavaScript vanilla**
- **Python 3** (analyse CSV — `analyse.py`)
- **Tailwind CSS** (build réel : `npm run build` → `css/output.css`, `npm run watch` en continu)
- **PHP / WordPress** (`index.php`, `functions.php`, `style.css`)
- **Bootstrap 5** (démo tableau de bord)
- **WebCrypto** (ECDSA, ECDH, SHA-256, AES-GCM) et **WebRTC** (DataChannel)

---

## 🛡 Licence

Contenu original d'Abderrahmane El ADNANI — EMSI Marrakech.
Le code peut être réutilisé pour des projets scolaires ; merci de citer la source.

---

## 🔗 Liens utiles

- [Profil GitHub](https://github.com/M-A-E-A) (portfolio en ligne)
- [Repo `portfolio-emsi`](https://github.com/M-A-E-A/portfolio-emsi) (ce dépôt)
- [LinkedIn](https://linkedin.com/in/abderrahmane-el-adnani)
- [Instagram](https://instagram.com/m_a_eladnani)
