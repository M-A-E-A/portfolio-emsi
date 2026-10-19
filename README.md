# Portfolio — Abderrahmane El ADNANI

> Un portfolio vivant : 14 applications web complètes, un thème de fond animé, un mode sombre persistant, et 11 démos standalone.

---

## ✨ En une ligne

**Portfolio + 11 démo-apps + thème partagé (fond animé + dark/light)** — en pur HTML/CSS/JS, sans framework obligatoire, fonctionnel sur `file://`.

---

## 🏗 Structure

```
portfolio/           → site portfolio (14 projets détaillés, fond animé, thème)
shared/              → theme.css + theme.js (fond animé + toggle dark/light)
python-analyse/      → CLI Python : analyse CSV (stats par colonne)
tailwind-demo/       → page marketing construite avec Tailwind CSS
wp-theme-portfolio/  → thème WordPress minimal (index, single, archive, 404)
api-contacts/        → API REST simulée (recherche, tri, pagination)
bootstrap-demo/      → tableau de bord Bootstrap 5 (grille, cartes, formulaire)
boutique-souk/       → boutique artisanale (fiches, avis, panier, favoris)
duel-tri/            → duel de 6 algorithmes de tri (comparaisons comptées)
messagerie-temps-reel/ → messagerie instantanée entre onglets (reactions, réponses)
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
- **Mode sombre** : variables CSS `body.sombre` avec palette indigo (`#090621` → `#05031b`)

### 2. Thème clair / sombre
- **Persistance** via `localStorage` (`theme-sombre`, `portfolio-theme`, `duel-theme`, etc.)
- **Respect de `prefers-color-scheme`** au premier chargement
- **Un bouton `#theme`** par projet — chaque app conserve son propre mécanisme (aucun conflit entre le portfolio et les démos)
- **Tailwind compatible** : le partage active aussi `html.dark` pour les utilitaires `dark:`

### 3. Performance
- **Aucun framework obligé** pour le portfolio — tout en vanilla
- **Lighthouse 100/100/100** sur les pages clés (`portfolio/index.html`, `projets/*.html`)
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

---

## 📊 Technologies principales

- **HTML5 / CSS3 / JavaScript vanilla**
- **Python 3** (analyse CSV — `analyse.py`)
- **Tailwind CSS** (build réel : `npm run build` → `css/output.css`)
- **PHP / WordPress** (`index.php`, `functions.php`, `style.css`)
- **Bootstrap 5** (démo tableau de bord)

---

## 🛡 Licence

Contenu original d'Abderrahmane El ADNANI — EMSI Marrakech.  
Le code peut être réutilisé pour des projets scolaires ; merci de citer la source.

---

## 🔗 Liens utiles

- [Portfolio en ligne](https://github.com/M-A-E-A/M-A-E-A) (profil)
- [Repo `portfolio-emsi`](https://github.com/M-A-E-A/portfolio-emsi) (ce dépôt)
- [LinkedIn](https://linkedin.com/in/abderrahmane-el-adnani)
- [Instagram](https://instagram.com/m_a_eladnani)
