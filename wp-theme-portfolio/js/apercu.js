/* =====================================================================
   Aperçu du thème WordPress — gabarits simulés.
   ---------------------------------------------------------------------
   Chaque gabarit reproduit la structure HTML que produirait le .php
   correspondant, avec les mêmes classes (pour que style.css s'applique).
   ===================================================================== */
(function (global) {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const CLE_THEME = 'wp-theme-theme';

  /* ---------------------------------------------------------------- */
  /* Contenu de démonstration                                          */
  /* ---------------------------------------------------------------- */

  const ARTICLES = [
    {
      id: 12,
      titre: 'Écrire un raytracer en JavaScript',
      date: '12 mars 2026',
      auteur: 'Abderrahmane El ADNANI',
      categorie: 'Graphique',
      extrait: 'Z-buffer, ombres portées, réflexion et réfraction : ce que donne un moteur de rendu écrit à la main, sans WebGL ni bibliothèque.',
      contenu: [
        'Le point de départ est simple : un rayon part de la caméra, et on cherche ce qu’il touche. Tout le reste — l’ombrage, les ombres portées, la réflexion sur une sphère métallique, la réfraction dans une sphère de verre — découle de cette idée.',
        'La difficulté n’est pas dans la théorie mais dans le débogage : une inversion de signe dans l’équation de la sphère rend le moteur parfaitement silencieux. Il ne lève aucune erreur, il dessine simplement un sol vide.'
      ]
    },
    {
      id: 11,
      titre: 'Un CRDT pour dessiner à plusieurs',
      date: '28 février 2026',
      auteur: 'Abderrahmane El ADNANI',
      categorie: 'Réparti',
      extrait: 'Pourquoi l’ordre d’arrivée des messages ne doit pas changer le résultat — et comment on le prouve en rejouant le journal dans trois ordres.',
      contenu: [
        'Le modèle le plus simple qui tienne la route est l’OR-Set : chaque élément porte un ensemble de jetons d’ajout et un ensemble de jetons de suppression. Fusionner, c’est prendre l’union.',
        'L’annulation fonctionne de la même façon : elle supprime un jeton d’ajout plutôt que d’effacer l’élément. Elle reste donc, elle aussi, commutative.'
      ]
    },
    {
      id: 10,
      titre: 'Rétropropagation, à la main',
      date: '9 février 2026',
      auteur: 'Abderrahmane El ADNANI',
      categorie: 'Apprentissage automatique',
      extrait: 'Écrire la règle de la chaîne couche par couche, et vérifier chaque gradient par différences finies.',
      contenu: [
        'La rétropropagation n’est pas une formule à réciter : c’est une question posée à chaque neurone. De combien ma sortie varie-t-elle si ce poids varie un peu ?',
        'La vérification se fait par différences finies : on perturbe un poids, on recalcule la perte, on compare. L’accord à 0,01 % près est la preuve que la dérivée est juste.'
      ]
    }
  ];

  /* ---------------------------------------------------------------- */
  /* Fragments de gabarit                                              */
  /* ---------------------------------------------------------------- */

  function enTete() {
    return '<header class="site-header">' +
      '<p class="site-title"><a href="#contenu">Portfolio</a></p>' +
      '<nav class="site-nav" aria-label="Navigation"><ul>' +
      '<li><a href="#contenu">Accueil</a></li>' +
      '<li><a href="#contenu">Projets</a></li>' +
      '<li><a href="#contenu">À propos</a></li>' +
      '<li><a href="#contenu">Contact</a></li>' +
      '</ul></nav>' +
      '</header>';
  }

  function barreLaterale() {
    return '<aside class="sidebar">' +
      '<h2>Rechercher</h2>' +
      '<form role="search" onsubmit="return false"><input type="search" placeholder="Rechercher…" aria-label="Rechercher" style="width:100%;padding:.4rem .6rem;border:1px solid currentColor;border-radius:.4rem;background:transparent;color:inherit"></form>' +
      '<h2>Articles récents</h2>' +
      '<ul>' +
      ARTICLES.map(function (a) { return '<li><a href="#contenu">' + a.titre + '</a></li>'; }).join('') +
      '</ul>' +
      '<h2>Catégories</h2>' +
      '<ul>' +
      '<li><a href="#contenu">Graphique (1)</a></li>' +
      '<li><a href="#contenu">Réparti (1)</a></li>' +
      '<li><a href="#contenu">Apprentissage automatique (1)</a></li>' +
      '</ul>' +
      '</aside>';
  }

  function pied() {
    return '<footer class="site-footer">' +
      '<p>Portfolio Theme — thème WordPress minimal par Abderrahmane El ADNANI. ' +
      'Propulsé par WordPress.</p>' +
      '</footer>';
  }

  function article(a, complet) {
    return '<article id="post-' + a.id + '" class="entry">' +
      '<header class="entry-header">' +
      '<h' + (complet ? '1' : '2') + ' class="entry-title"><a href="#contenu">' + a.titre + '</a></h' + (complet ? '1' : '2') + '>' +
      '</header>' +
      '<p class="entry-meta">' + a.date + ' — ' + a.auteur + (complet ? ' — ' + a.categorie : '') + '</p>' +
      '<div class="entry-content">' +
      (complet
        ? a.contenu.map(function (p) { return '<p>' + p + '</p>'; }).join('')
        : '<p>' + a.extrait + '</p>') +
      '</div>' +
      '</article>';
  }

  const GABARITS = {
    index: {
      label: 'index.php',
      rendu: function () {
        return enTete() +
          '<div class="site-main"><div class="site-content">' +
          ARTICLES.map(function (a) { return article(a, false); }).join('') +
          '<div class="pagination"><span>Précédent</span><span>1</span><span>2</span><span>Suivant</span></div>' +
          '</div>' + barreLaterale() + '</div>' + pied();
      }
    },
    single: {
      label: 'single.php',
      rendu: function () {
        const a = ARTICLES[0];
        return enTete() +
          '<div class="site-main"><div class="site-content">' +
          article(a, true) +
          '<ul class="comment-list">' +
          '<li><p class="comment-meta">Yasmine — 13 mars 2026</p><p>Le passage de la sphere dans la refraction, c’est la partie que j’ai comprise avec tes schemas.</p></li>' +
          '<li><p class="comment-meta">Mehdi — 14 mars 2026</p><p>Est-ce que la version multi-lots change beaucoup les résultats ?</p></li>' +
          '</ul>' +
          '<nav class="post-navigation"><a href="#contenu">← Article précédent</a><a href="#contenu">Article suivant →</a></nav>' +
          '</div>' + barreLaterale() + '</div>' + pied();
      }
    },
    page: {
      label: 'page.php',
      rendu: function () {
        return enTete() +
          '<div class="site-main"><div class="site-content">' +
          '<h1 class="page-title">À propos</h1>' +
          '<div class="entry-content">' +
          '<p>Élève-ingénieur en informatique à l’EMSI de Marrakech, passionné par le développement web et la conception d’interfaces.</p>' +
          '<p>Ce thème WordPress est l’un des projets du portfolio : en-tête, boucle, article unique, page, archive, barre latérale, pagination et 404.</p>' +
          '</div>' +
          '</div>' + barreLaterale() + '</div>' + pied();
      }
    },
    archive: {
      label: 'archive.php',
      rendu: function () {
        return enTete() +
          '<div class="site-main"><div class="site-content">' +
          '<header class="archive-header"><h1>Catégorie : Graphique</h1><p>Les articles de la catégorie Graphique.</p></header>' +
          article(ARTICLES[0], false) +
          '<div class="pagination"><span>Précédent</span><span>1</span><span>Suivant</span></div>' +
          '</div>' + barreLaterale() + '</div>' + pied();
      }
    },
    erreur: {
      label: '404.php',
      rendu: function () {
        return enTete() +
          '<div class="site-main"><div class="site-content">' +
          '<div class="not-found"><h1>404</h1><p>La page demandée n’existe pas.</p></div>' +
          '</div>' + barreLaterale() + '</div>' + pied();
      }
    }
  };

  /* ---------------------------------------------------------------- */
  /* Interface                                                         */
  /* ---------------------------------------------------------------- */

  function afficherGabarits() {
    const zone = $('#gabarits');
    zone.innerHTML = Object.keys(GABARITS).map(function (cle) {
      return '<button type="button" class="puce" data-gabarit="' + cle + '" aria-pressed="' + (cle === 'index') + '">' +
        GABARITS[cle].label + '</button>';
    }).join('');
  }

  function afficherRendu(cle) {
    const gabarit = GABARITS[cle] || GABARITS.index;
    $('#rendu').innerHTML = gabarit.rendu();
    $$('[data-gabarit]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.gabarit === cle));
    });
  }

  function brancherUI() {
    $('#gabarits').addEventListener('click', function (e) {
      const bouton = e.target.closest('[data-gabarit]');
      if (!bouton) return;
      afficherRendu(bouton.dataset.gabarit);
    });
  }

  /* ---------------------------------------------------------------- */
  /* Thème                                                             */
  /* ---------------------------------------------------------------- */

  function appliquerTheme(sombre) {
    document.body.classList.toggle('sombre', sombre);
    const btn = $('#theme');
    if (btn) {
      btn.setAttribute('aria-pressed', String(sombre));
      btn.setAttribute('aria-label', sombre ? 'Passer au thème clair' : 'Passer au thème sombre');
      btn.title = sombre ? 'Mode clair' : 'Mode sombre';
    }
    try { localStorage.setItem(CLE_THEME, sombre ? 'sombre' : 'clair'); } catch (e) { /* file:// */ }
  }

  function initialiserTheme() {
    const sombre = document.body.classList.contains('sombre');
    const btn = $('#theme');
    if (btn) {
      btn.setAttribute('aria-pressed', String(sombre));
      btn.setAttribute('aria-label', sombre ? 'Passer au thème clair' : 'Passer au thème sombre');
      btn.title = sombre ? 'Mode clair' : 'Mode sombre';
      btn.addEventListener('click', function () {
        appliquerTheme(!document.body.classList.contains('sombre'));
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Démarrage                                                         */
  /* ---------------------------------------------------------------- */

  function demarrer() {
    afficherGabarits();
    brancherUI();
    initialiserTheme();
    afficherRendu('index');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer);
  } else {
    demarrer();
  }
})(window);
