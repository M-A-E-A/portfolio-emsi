/* =====================================================================
   Aperçu statique de l'API Express.
   ---------------------------------------------------------------------
   Ce fichier rejoue, dans le navigateur, la logique de server.js :
   mêmes données, mêmes filtres, mêmes validations, mêmes codes HTTP.
   Aucune requête réseau n'est émise : tout se passe en mémoire.
   ===================================================================== */
(function (global) {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const CLE_THEME = 'api-express-theme';

  /* ---------------------------------------------------------------- */
  /* Les données — identiques à celles de server.js                   */
  /* ---------------------------------------------------------------- */

  const contacts = [
    { id: 1, nom: 'El ADNANI Abderrahmane', email: 'm.a.eladnani1@gmail.com', ville: 'Marrakech', telephone: '+212 7 77 60 92 28' },
    { id: 2, nom: 'Bennani Youssef', email: 'youssef.bennani@example.com', ville: 'Casablanca', telephone: '+212 6 12 34 56 78' },
    { id: 3, nom: 'Alaoui Fatima', email: 'fatima.alaoui@example.com', ville: 'Rabat', telephone: '+212 6 98 76 54 32' }
  ];
  let prochainId = 4;

  /* ---------------------------------------------------------------- */
  /* La logique — reprise de server.js                               */
  /* ---------------------------------------------------------------- */

  function trouver(id) {
    return contacts.find(function (c) { return c.id === id; });
  }

  function valider(corps) {
    const erreurs = [];
    if (!corps.nom || String(corps.nom).trim().length < 2) erreurs.push('nom : au moins 2 caractères');
    if (!corps.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(corps.email)) erreurs.push('email : format invalide');
    if (corps.ville && String(corps.ville).trim().length < 2) erreurs.push('ville : au moins 2 caractères');
    return erreurs;
  }

  /** Route une requête et renvoie { code, corps }. */
  function traiter(methode, chemin, corps) {
    const url = new URL(chemin, 'http://localhost:3000');
    const segments = url.pathname.split('/').filter(Boolean);

    // Route inconnue
    if (segments[0] !== 'api' || segments[1] !== 'contacts') {
      if (url.pathname === '/api/stats' && methode === 'GET') {
        const parVille = contacts.reduce(function (acc, c) {
          acc[c.ville] = (acc[c.ville] || 0) + 1;
          return acc;
        }, {});
        return { code: 200, corps: { total: contacts.length, parVille: parVille } };
      }
      return {
        code: 404,
        corps: { erreur: 'Route inconnue', methode: methode, chemin: url.pathname }
      };
    }

    // /api/contacts/:id
    if (segments.length === 3) {
      const id = parseInt(segments[2], 10);
      const contact = trouver(id);

      if (methode === 'GET') {
        if (!contact) return { code: 404, corps: { erreur: 'Contact introuvable', id: id } };
        return { code: 200, corps: contact };
      }
      if (methode === 'PUT') {
        if (!contact) return { code: 404, corps: { erreur: 'Contact introuvable', id: id } };
        const erreurs = valider(corps || {});
        if (erreurs.length) return { code: 400, corps: { erreur: 'Validation', details: erreurs } };
        Object.assign(contact, {
          nom: String(corps.nom).trim(),
          email: String(corps.email).trim(),
          ville: String(corps.ville || contact.ville).trim(),
          telephone: String(corps.telephone || contact.telephone).trim()
        });
        return { code: 200, corps: contact };
      }
      if (methode === 'DELETE') {
        const index = contacts.findIndex(function (c) { return c.id === id; });
        if (index === -1) return { code: 404, corps: { erreur: 'Contact introuvable', id: id } };
        contacts.splice(index, 1);
        return { code: 204, corps: null };
      }
      return { code: 404, corps: { erreur: 'Route inconnue', methode: methode, chemin: url.pathname } };
    }

    // /api/contacts
    if (segments.length === 2) {
      if (methode === 'GET') {
        const q = (url.searchParams.get('q') || '').toLowerCase();
        const ville = (url.searchParams.get('ville') || '').toLowerCase();
        const tri = ['nom', 'email', 'ville'].includes(url.searchParams.get('tri'))
          ? url.searchParams.get('tri') : 'nom';
        const ordre = url.searchParams.get('ordre') === 'desc' ? -1 : 1;
        const page = Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1);
        const parPage = Math.min(50, Math.max(1, parseInt(url.searchParams.get('parPage'), 10) || 10));

        let resultat = contacts.slice();
        if (q) {
          resultat = resultat.filter(function (c) {
            return c.nom.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
          });
        }
        if (ville) {
          resultat = resultat.filter(function (c) { return c.ville.toLowerCase() === ville; });
        }
        resultat.sort(function (a, b) {
          return a[tri] < b[tri] ? -ordre : a[tri] > b[tri] ? ordre : 0;
        });

        const total = resultat.length;
        const debut = (page - 1) * parPage;
        const pageItems = resultat.slice(debut, debut + parPage);
        return {
          code: 200,
          corps: {
            donnees: pageItems,
            meta: { total: total, page: page, parPage: parPage, pages: Math.ceil(total / parPage) }
          }
        };
      }

      if (methode === 'POST') {
        const erreurs = valider(corps || {});
        if (erreurs.length) return { code: 400, corps: { erreur: 'Validation', details: erreurs } };
        const nouveau = {
          id: prochainId++,
          nom: String(corps.nom).trim(),
          email: String(corps.email).trim(),
          ville: String(corps.ville || '').trim(),
          telephone: String(corps.telephone || '').trim()
        };
        contacts.push(nouveau);
        return { code: 201, corps: nouveau };
      }
    }

    return { code: 404, corps: { erreur: 'Route inconnue', methode: methode, chemin: url.pathname } };
  }

  /* ---------------------------------------------------------------- */
  /* Interface                                                        */
  /* ---------------------------------------------------------------- */

  const ROUTES = [
    { methode: 'GET', chemin: '/api/contacts', desc: 'Liste paginée, triable et filtrable' },
    { methode: 'GET', chemin: '/api/contacts?q=bennani', desc: 'Recherche sur le nom ou l’e-mail' },
    { methode: 'GET', chemin: '/api/contacts?ville=Marrakech', desc: 'Filtre par ville' },
    { methode: 'GET', chemin: '/api/contacts?tri=nom&ordre=desc', desc: 'Tri par nom, ordre décroissant' },
    { methode: 'GET', chemin: '/api/contacts/1', desc: 'Un contact, ou 404' },
    { methode: 'GET', chemin: '/api/stats', desc: 'Total et répartition par ville' },
    { methode: 'POST', chemin: '/api/contacts', desc: 'Création — 201, ou 400 si invalide' },
    { methode: 'PUT', chemin: '/api/contacts/1', desc: 'Mise à jour — 200, 400 ou 404' },
    { methode: 'DELETE', chemin: '/api/contacts/2', desc: 'Suppression — 204, ou 404' },
    { methode: 'GET', chemin: '/api/inexistant', desc: 'Route inconnue — 404' }
  ];

  function afficherRoutes() {
    $('#routes').innerHTML = ROUTES.map(function (route, i) {
      return '<li><button type="button" class="route" data-route="' + i + '">' +
        '<span class="route-methode route-methode--' + route.methode.toLowerCase() + '">' + route.methode + '</span>' +
        '<span class="route-chemin">' + route.chemin + '</span>' +
        '<span class="route-desc">' + route.desc + '</span>' +
        '</button></li>';
    }).join('');
  }

  function envoyer(methode, chemin, corps) {
    const debut = performance.now();
    let resultat;
    try {
      resultat = traiter(methode, chemin, corps);
    } catch (e) {
      resultat = { code: 500, corps: { erreur: 'Erreur interne', message: e.message } };
    }
    const duree = performance.now() - debut;

    const etiquette = $('#code-etat');
    etiquette.textContent = resultat.code;
    etiquette.className = 'code-etat code-etat--' + String(resultat.code).charAt(0) + 'xx';
    $('#duree').textContent = duree.toFixed(1) + ' ms';

    const zone = $('#code-json');
    if (resultat.code === 204) {
      zone.textContent = '// 204 No Content — corps vide';
    } else {
      zone.textContent = JSON.stringify(resultat.corps, null, 2);
    }
  }

  function corpsDeLaRequete() {
    const brut = $('#corps').value.trim();
    if (!brut) return null;
    try {
      return JSON.parse(brut);
    } catch (e) {
      return null;
    }
  }

  function brancherUI() {
    $('#form-console').addEventListener('submit', function (e) {
      e.preventDefault();
      const methode = $('#methode').value;
      envoyer(methode, $('#chemin').value.trim(), corpsDeLaRequete());
    });

    $('#methode').addEventListener('change', function () {
      const methode = this.value;
      $('#corps-requete').hidden = methode === 'GET' || methode === 'DELETE';
    });

    $('#routes').addEventListener('click', function (e) {
      const bouton = e.target.closest('[data-route]');
      if (!bouton) return;
      const route = ROUTES[Number(bouton.dataset.route)];
      $('#methode').value = route.methode;
      $('#methode').dispatchEvent(new Event('change'));
      $('#chemin').value = route.chemin;
      envoyer(route.methode, route.chemin, corpsDeLaRequete());
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
    afficherRoutes();
    brancherUI();
    initialiserTheme();
    envoyer('GET', '/api/contacts', null);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer);
  } else {
    demarrer();
  }
})(window);
