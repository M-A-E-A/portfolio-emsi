/* Démonstration Bootstrap 5 — interactions en JavaScript classique. */
(function () {
  'use strict';

  const stockage = {
    lire(cle, defaut) {
      try { const v = localStorage.getItem(cle); return v === null ? defaut : JSON.parse(v); }
      catch (e) { return defaut; }
    },
    ecrire(cle, valeur) {
      try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch (e) { /* indisponible */ }
    }
  };

  const $ = (sel) => document.querySelector(sel);

  function appliquerTheme(sombre) {
    document.documentElement.setAttribute('data-bs-theme', sombre ? 'dark' : 'light');
    document.body.classList.toggle('sombre', sombre);
    const btn = $('#theme');
    if (btn) {
      btn.setAttribute('aria-label', sombre ? 'Activer le thème clair' : 'Activer le thème sombre');
      btn.setAttribute('aria-pressed', String(sombre));
      btn.title = sombre ? 'Mode clair' : 'Mode sombre';
    }
    stockage.ecrire('bootstrap-demo-theme', sombre ? 'sombre' : 'clair');
  }

  function themeInitial() {
    const m = stockage.lire('bootstrap-demo-theme', null);
    if (m !== null) return m === 'sombre';
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  document.addEventListener('DOMContentLoaded', function () {
    const annee = document.getElementById('annee');
    if (annee) annee.textContent = String(new Date().getFullYear());

    appliquerTheme(themeInitial());

    const btnTheme = $('#theme');
    if (btnTheme) {
      btnTheme.addEventListener('click', function () {
        appliquerTheme(document.documentElement.getAttribute('data-bs-theme') !== 'dark');
      });
    }

    // Validation du formulaire + toast
    const form = document.getElementById('formClient');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!form.checkValidity()) {
          form.classList.add('was-validated');
          return;
        }
        form.classList.remove('was-validated');
        form.reset();

        const toastEl = document.getElementById('toast');
        if (toastEl && window.bootstrap) {
          const toast = window.bootstrap.Toast.getOrCreateInstance(toastEl);
          toast.show();
        }
      });
    }

    // Empêcher la soumission du formulaire de recherche
    const recherche = document.querySelector('form[role="search"]');
    if (recherche) {
      recherche.addEventListener('submit', function (e) { e.preventDefault(); });
    }
  });
})();