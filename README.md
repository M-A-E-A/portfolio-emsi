# Portfolio — Abderrahmane El ADNANI

> Un portfolio vivant : 14 projets détaillés, un thème de fond animé, un mode sombre persistant, et 11 démos standalone.

---

## ✨ En une ligne

**Portfolio + 11 démo-apps + thème partagé (fond animé + dark/light)** — en pur HTML/CSS/JS, sans framework obligatoire, fonctionnel sur `file://`.

---

## 🏗 Structure

```
portfolio/           → site portfolio (14 projets détaillés, fond animé, thème)
shared/              → theme.css + theme.js + themes.css (fond animé, thème, 11 palettes)
python-analyse/      → CLI Python : analyse CSV (stats par colonne)
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
  (`bootstrap-demo-theme`, `souk-theme`, `quiz-theme`, `tailwind-theme`, `portfolio-theme`…) :
  les 11 apps ne se marchent pas dessus
- **Respect de `prefers-color-scheme`** au premier chargement
- **Un bouton `#theme`** par projet — chaque app conserve son propre mécanisme
  (aucun conflit entre le portfolio et les démos)
- **Tailwind compatible** : `tailwind-demo` active aussi `html.dark` pour les utilitaires `dark:`
- **Contraste garanti** : le jeton `--sur-accent` choisit automatiquement la couleur de texte
  posée sur un aplat d'accent (blanc en clair, encre en sombre) — plus de texte illisible

### 3. Accessibilité
- **Lien d'évitement** implémenté une seule fois dans `shared/theme.css` (identique dans les 11 démos)
- **`main#contenu`** unique par page, hiérarchie de titres continue (h1 → h2 → h3)
- **Contrastes WCAG AA** vérifiés par Lighthouse en mode clair **et** sombre
- **`aria-pressed` / `aria-label` / `title`** sur chaque bouton de thème

### 4. Performance
- **Aucun framework obligé** pour le portfolio — tout en vanilla
- **Lighthouse 100 / 100 / 100** (accessibilité, bonnes pratiques, SEO) sur **les 12 pages
  principales et les 14 fiches projet**, en mode clair comme en mode sombre
- **Pas de dépendance externe** au lancement (hors polices Google et Tailwind pour la démo)

---

## 🚀 Démos rapides

| Projet | Démo | Source |
|---|---|---|
| **Portfolio** | [index.html](portfolio/index.html) | `portfolio/` |
| **Analyse CSV (Python)** | `python-analyse/analyse.py` | `python-analyse/` |
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

---

## 📊 Technologies principales

- **HTML5 / CSS3 / JavaScript vanilla**
- **Python 3** (analyse CSV — `analyse.py`)
- **Tailwind CSS** (build réel : `npm run build` → `css/output.css`, `npm run watch` en continu)
- **PHP / WordPress** (`index.php`, `functions.php`, `style.css`)
- **Bootstrap 5** (démo tableau de bord)

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
