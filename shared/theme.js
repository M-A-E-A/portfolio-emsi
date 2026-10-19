/* =====================================================================
   Thème partagé — calque .fond-anime animé pour tous les projets.
   ---------------------------------------------------------------------
   Ce script est inclus en fin de chaque page. Il :
     - s'assure que la page contient un calque .fond-anime animé ;
     - NE touche pas le bouton #theme : chaque projet gère son propre
       bouton (duel-tri, tri-visualiseur, api-contacts, etc.) ;
     - pour les pages sans bouton (tailwind-demo), il crée un bouton
       minimal qui bascule body.sombre + html.dark.
   ===================================================================== */
(function () {
  'use strict';

  /* --- Calque .fond-anime : on le recrée si absent --- */
  function assurerFondAnime() {
    if (document.querySelector('.fond-anime')) return;
    const div = document.createElement('div');
    div.className = 'fond-anime';
    div.setAttribute('aria-hidden', 'true');
    div.innerHTML =
      (function () {
        const f = document.body.getAttribute('data-fond') || 'aurore';
        if (f === 'aurore') return '<span class="blob blob-1"></span><span class="blob blob-2"></span><span class="blob blob-3"></span><span class="blob blob-4"></span>';
        if (f === 'ruban' || f === 'soie') return '<span class="ruban ruban-1"></span><span class="ruban ruban-2"></span><span class="ruban ruban-3"></span>';
        return '';
      })() + '<span class="grain"></span>';
    const fond = document.body.getAttribute('data-fond') || 'aurore';
    div.setAttribute('data-fond', fond);
    document.body.insertBefore(div, document.body.firstChild);
  }

  /* --- Bouton thème minimal, utilisé si la page n'en a pas un --- */
  function creerBoutonTheme() {
    if (document.getElementById('theme')) return;
    const btn = document.createElement('button');
    btn.id = 'theme';
    btn.type = 'button';
    btn.className = 'bouton-icone';
    btn.setAttribute('aria-label', 'Activer le thème sombre');
    btn.title = 'Mode sombre';
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>';
    btn.addEventListener('click', function () {
      const sombre = !document.body.classList.contains('sombre');
      document.body.classList.toggle('sombre', sombre);
      document.documentElement.classList.toggle('dark', sombre);
      btn.setAttribute('aria-pressed', String(sombre));
      btn.setAttribute('aria-label', sombre ? 'Activer le thème clair' : 'Activer le thème sombre');
      btn.title = sombre ? 'Mode clair' : 'Mode sombre';
      try { localStorage.setItem('theme-sombre', sombre ? 'sombre' : 'clair'); } catch (e) { /* indisponible */ }
    });
    const header = document.querySelector('.entete, header');
    if (header) header.appendChild(btn);
    else document.body.appendChild(btn);
  }

  /* --- Lancement --- */
  function initialiser() {
    assurerFondAnime();
    // Ne pas créer de bouton si un existe déjà (le projet gère le sien)
    if (!document.getElementById('theme')) {
      creerBoutonTheme();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialiser);
  } else {
    initialiser();
  }
})();
