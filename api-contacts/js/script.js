/* =========================================================
   API Contacts — logique applicative
   1) persistance  2) serveur simulé  3) utilitaires DOM
   4) thème        5) console d'API   6) gestion des contacts
   7) journal des requêtes
   ========================================================= */
(function () {
  'use strict';

  /* ---------------------------------------------------------
     1. Persistance
     --------------------------------------------------------- */
  const stockage = {
    lire(cle, defaut) { try { const v = localStorage.getItem(cle); return v === null ? defaut : JSON.parse(v); } catch (e) { return defaut; } },
    ecrire(cle, valeur) { try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch (e) {} }
  };

  const CLE = 'api-contacts';
  const CLE_THEME = 'api-contacts-theme';
  const copie = function (o) { return Object.assign({}, o); };

  /* Jeu de démonstration servi au premier lancement.
     Huit contacts : de quoi rendre la pagination (limit 5) démonstrative. */
  const EXEMPLES = [
    { id: 1, nom: 'Yasmine El Amrani',    email: 'yasmine.elamrani@example.ma', ville: 'Marrakech', telephone: '+212 6 12 34 56 78' },
    { id: 2, nom: 'Omar Benjelloun',      email: 'omar.benjelloun@example.ma',   ville: 'Casablanca', telephone: '+212 6 61 22 33 44' },
    { id: 3, nom: 'Salma Bouzid',         email: 'salma.bouzid@example.ma',       ville: 'Rabat',      telephone: '+212 6 55 77 88 99' },
    { id: 4, nom: 'Mehdi Tazi',           email: 'mehdi.tazi@example.ma',         ville: 'Tanger',     telephone: '+212 6 70 11 22 33' },
    { id: 5, nom: 'Karim El Fassi',       email: 'karim.elfassi@example.ma',      ville: 'Fès',        telephone: '+212 6 33 44 55 66' },
    { id: 6, nom: 'Nadia Chraibi',        email: 'nadia.chraibi@example.ma',      ville: 'Agadir',     telephone: '+212 6 40 55 66 77' },
    { id: 7, nom: 'Youssef Alaoui',       email: 'youssef.alaoui@example.ma',     ville: 'Oujda',      telephone: '+212 6 22 11 00 99' },
    { id: 8, nom: 'Fatima Zahra Idrissi', email: 'fatima.idrissi@example.ma',     ville: 'Meknès',     telephone: '+212 6 88 99 00 11' }
  ];

  /* Miroir mémoire : garantit le fonctionnement même si localStorage est
     refusé par le navigateur (certains contextes « file:// »). */
  let cache = null;

  let charger = function () {
    if (cache) return cache;
    const donnees = stockage.lire(CLE, null);
    cache = Array.isArray(donnees) ? donnees : EXEMPLES.map(copie);
    stockage.ecrire(CLE, cache);
    return cache;
  };
  let sauvegarder = function (liste) {
    cache = liste;
    stockage.ecrire(CLE, liste);
  };
  /* Variable (et non fonction) : en mode full-stock, elle est remplacée
     par une requête POST /api/reinitialiser vers le serveur. */
  let reinitialiserDonnees = function () {
    sauvegarder(EXEMPLES.map(copie));
  };

  /* ---------------------------------------------------------
     2. Le « serveur » simulé
     --------------------------------------------------------- */
  const DELAI_MIN = 120;
  const DELAI_MAX = 350;
  const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* Paramètres acceptés par GET /contacts. */
  const TRI_AUTORISES = ['id', 'nom', 'ville'];
  const SENS_AUTORISES = ['asc', 'desc'];
  const CHAMPS_RECHERCHE = ['nom', 'email', 'ville', 'telephone'];
  const LIMITE_DEFAUT = 5;
  const LIMITE_MAX = 50;

  /* Champs modifiables d'un contact : base commune au corps de POST, PUT et PATCH. */
  const CHAMPS_MODIFIABLES = ['nom', 'email', 'ville', 'telephone'];

  function delai() { return DELAI_MIN + Math.random() * (DELAI_MAX - DELAI_MIN); }

  /* Réponse asynchrone : { statut, corps } après un délai réseau réaliste. */
  function repondre(statut, corps, attente) {
    return new Promise(function (resoudre) {
      setTimeout(function () { resoudre({ statut: statut, corps: corps }); }, attente);
    });
  }

  function texte(v) { return typeof v === 'string' ? v.trim() : ''; }

  /* Normalisation « insensible à la casse ET aux accents » : NFD puis
     suppression des diacritiques (é → e, ç → c, ainsi de suite). */
  function normaliser(valeur) {
    return String(valeur === undefined || valeur === null ? '' : valeur)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  /* Entier >= 1 attendu (page, limit). Une valeur absente ou vide retombe
     sur le défaut ; 0, négatif ou non numérique est refusé. */
  function entierPositif(valeur, defaut) {
    if (valeur === undefined || valeur === null || String(valeur).trim() === '') {
      return { ok: true, valeur: defaut };
    }
    const brut = String(valeur).trim();
    if (!/^[0-9]+$/.test(brut)) return { ok: false, valeur: defaut };
    const n = parseInt(brut, 10);
    if (!isFinite(n) || n < 1) return { ok: false, valeur: defaut };
    return { ok: true, valeur: n };
  }

  /* Comparateur de tri (id numérique, autres champs textuels normalisés). */
  function comparer(a, b, cle, sens) {
    let r;
    if (cle === 'id') r = (Number(a.id) || 0) - (Number(b.id) || 0);
    else r = normaliser(a[cle]).localeCompare(normaliser(b[cle]), 'fr');
    return sens === 'desc' ? -r : r;
  }

  /* Transforme une query string (« q=omar&page=2 ») en objet de paramètres.
     Une chaîne vide ou un « ? » initial sont tolérés. */
  function analyserParametres(chaine) {
    const params = {};
    let recherche;
    try { recherche = new URLSearchParams(String(chaine === undefined ? '' : chaine)); }
    catch (e) { return params; }
    ['q', 'tri', 'sens', 'page', 'limit'].forEach(function (cle) {
      if (recherche.has(cle)) params[cle] = recherche.get(cle);
    });
    return params;
  }

  /* Règles de validation partagées par POST, PUT et PATCH.
     En mode partiel (PATCH), seuls les champs réellement présents sont vérifiés. */
  function valider(donnees, partiel) {
    const d = donnees && typeof donnees === 'object' ? donnees : {};
    const erreurs = {};
    const present = function (champ) {
      return !partiel || Object.prototype.hasOwnProperty.call(d, champ);
    };
    if (present('nom') && !texte(d.nom)) erreurs.nom = 'Le nom est obligatoire.';
    if (present('email')) {
      if (!texte(d.email)) erreurs.email = "L'e-mail est obligatoire.";
      else if (!RE_EMAIL.test(texte(d.email))) erreurs.email = "Format d'e-mail invalide (ex. prenom.nom@example.ma).";
    }
    return erreurs;
  }

  function indiceDe(liste, id) {
    return liste.findIndex(function (c) { return String(c.id) === String(id); });
  }

  const api = {
    /* GET /contacts — recherche (q), tri (tri, sens) et pagination (page, limit).
       Accepte un objet de paramètres ou une query string brute. */
    lister: function (parametres) {
      const p = typeof parametres === 'string'
        ? analyserParametres(parametres)
        : (parametres && typeof parametres === 'object' ? parametres : {});

      const details = {};
      const page = entierPositif(p.page, 1);
      if (!page.ok) details.page = 'Le paramètre « page » doit être un entier supérieur ou égal à 1.';
      const limit = entierPositif(p.limit, LIMITE_DEFAUT);
      if (!limit.ok) details.limit = 'Le paramètre « limit » doit être un entier supérieur ou égal à 1.';
      if (Object.keys(details).length) {
        return repondre(400, {
          erreur: 'Paramètres de requête invalides',
          message: 'Les paramètres « page » et « limit » doivent être des entiers supérieurs ou égaux à 1.',
          details: details
        }, delai());
      }

      const q = texte(p.q);
      const tri = TRI_AUTORISES.indexOf(p.tri) !== -1 ? p.tri : 'id';
      const sens = SENS_AUTORISES.indexOf(p.sens) !== -1 ? p.sens : 'asc';
      const limite = Math.min(limit.valeur, LIMITE_MAX);

      let liste = charger().slice();
      if (q) {
        const cible = normaliser(q);
        liste = liste.filter(function (c) {
          return CHAMPS_RECHERCHE.some(function (champ) {
            return normaliser(c[champ]).indexOf(cible) !== -1;
          });
        });
      }
      liste.sort(function (a, b) { return comparer(a, b, tri, sens); });

      const total = liste.length;
      const pages = Math.max(1, Math.ceil(total / limite));
      const debut = (page.valeur - 1) * limite;
      const donnees = liste.slice(debut, debut + limite).map(copie);

      return repondre(200, {
        donnees: donnees,
        meta: { page: page.valeur, limit: limite, total: total, pages: pages, q: q, tri: tri, sens: sens }
      }, delai());
    },
    /* GET /contacts/:id */
    lire: function (id) {
      const liste = charger();
      const i = indiceDe(liste, id);
      if (i === -1) return repondre(404, { erreur: 'Contact introuvable', id: id }, delai());
      return repondre(200, copie(liste[i]), delai());
    },
    /* POST /contacts */
    creer: function (donnees) {
      const d = donnees && typeof donnees === 'object' ? donnees : {};
      const erreurs = valider(d);
      if (Object.keys(erreurs).length) {
        return repondre(400, { erreur: 'Données invalides', details: erreurs }, delai());
      }
      const liste = charger();
      const id = liste.reduce(function (max, c) { return Math.max(max, Number(c.id) || 0); }, 0) + 1;
      const contact = { id: id, nom: texte(d.nom), email: texte(d.email), ville: texte(d.ville), telephone: texte(d.telephone) };
      sauvegarder(liste.concat([contact]));
      return repondre(201, copie(contact), delai());
    },
    /* PUT /contacts/:id */
    modifier: function (id, donnees) {
      const liste = charger();
      const i = indiceDe(liste, id);
      if (i === -1) return repondre(404, { erreur: 'Contact introuvable', id: id }, delai());
      const d = donnees && typeof donnees === 'object' ? donnees : {};
      const erreurs = valider(d);
      if (Object.keys(erreurs).length) {
        return repondre(400, { erreur: 'Données invalides', details: erreurs }, delai());
      }
      const contact = { id: liste[i].id, nom: texte(d.nom), email: texte(d.email), ville: texte(d.ville), telephone: texte(d.telephone) };
      const suivante = liste.slice();
      suivante[i] = contact;
      sauvegarder(suivante);
      return repondre(200, copie(contact), delai());
    },
    /* PATCH /contacts/:id — mise à jour partielle : seuls les champs fournis
       changent, les autres conservent leur valeur courante. */
    patcher: function (id, donnees) {
      const liste = charger();
      const i = indiceDe(liste, id);
      if (i === -1) return repondre(404, { erreur: 'Contact introuvable', id: id }, delai());
      const d = donnees && typeof donnees === 'object' ? donnees : {};
      const champs = CHAMPS_MODIFIABLES.filter(function (champ) {
        return Object.prototype.hasOwnProperty.call(d, champ);
      });
      if (!champs.length) {
        return repondre(400, {
          erreur: 'Aucun champ à mettre à jour',
          message: 'Fournissez au moins un champ modifiable.',
          champs: CHAMPS_MODIFIABLES
        }, delai());
      }
      const erreurs = valider(d, true);
      if (Object.keys(erreurs).length) {
        return repondre(400, { erreur: 'Données invalides', details: erreurs }, delai());
      }
      const contact = copie(liste[i]);
      champs.forEach(function (champ) { contact[champ] = texte(d[champ]); });
      const suivante = liste.slice();
      suivante[i] = contact;
      sauvegarder(suivante);
      return repondre(200, copie(contact), delai());
    },
    /* DELETE /contacts/:id */
    supprimer: function (id) {
      const liste = charger();
      const i = indiceDe(liste, id);
      if (i === -1) return repondre(404, { erreur: 'Contact introuvable', id: id }, delai());
      const suivante = liste.slice();
      suivante.splice(i, 1);
      sauvegarder(suivante);
      return repondre(204, null, delai());
    }
  };

  /* ---------------------------------------------------------
     2bis. Moteur distant (mode full-stack)
     Quand un serveur Node (node:http + node:sqlite) répond à la
     sonde /api/sante, les six points d'API ci-dessus sont remplacés
     par de véritables requêtes HTTP. La forme des réponses
     ({ statut, corps }) est identique : le reste de l'application —
     console, annuaire, journal — fonctionne sans modification.
     Sans serveur (file:// ou hébergement statique), tout reste en
     localStorage : le mode local n'est jamais dégradé.
     --------------------------------------------------------- */
  let moteurDistant = false;

  function brancherMoteurDistant() {
    moteurDistant = true;
    const base = 'api/contacts';

    /* Construction de la query string à partir des paramètres acceptés. */
    function construireQuery(p) {
      const qs = new URLSearchParams();
      ['q', 'tri', 'sens', 'page', 'limit'].forEach(function (cle) {
        if (p[cle] !== undefined && p[cle] !== null && String(p[cle]) !== '') qs.set(cle, p[cle]);
      });
      const chaine = qs.toString();
      return chaine ? '?' + chaine : '';
    }

    api.lister = function (parametres) {
      const p = typeof parametres === 'string'
        ? analyserParametres(parametres)
        : (parametres && typeof parametres === 'object' ? parametres : {});
      return window.LumeAPI.appeler('GET', base + construireQuery(p));
    };
    api.lire = function (id) {
      return window.LumeAPI.appeler('GET', base + '/' + encodeURIComponent(id));
    };
    api.creer = function (donnees) {
      return window.LumeAPI.appeler('POST', base, donnees);
    };
    api.modifier = function (id, donnees) {
      return window.LumeAPI.appeler('PUT', base + '/' + encodeURIComponent(id), donnees);
    };
    api.patcher = function (id, donnees) {
      return window.LumeAPI.appeler('PATCH', base + '/' + encodeURIComponent(id), donnees);
    };
    api.supprimer = function (id) {
      return window.LumeAPI.appeler('DELETE', base + '/' + encodeURIComponent(id));
    };

    /* La réinitialisation vide la vraie base puis réinsère les exemples. */
    reinitialiserDonnees = function () {
      return window.LumeAPI.appeler('POST', 'api/reinitialiser');
    };
  }

  /* Met à jour l'indicateur de moteur affiché en intro. */
  function afficherMoteur() {
    const chipStockage = document.getElementById('chip-stockage');
    const chipMoteur = document.getElementById('chip-moteur');
    if (moteurDistant) {
      if (chipStockage) chipStockage.innerHTML = 'base <b>SQLite</b>';
      if (chipMoteur) chipMoteur.innerHTML = 'moteur <b>Node.js · node:sqlite</b>';
    } else {
      if (chipMoteur) chipMoteur.innerHTML = 'moteur <b>local (localStorage)</b>';
    }
  }

  /* Point de passage unique vers le serveur simulé : la console, l'annuaire
     et le rejeu après une mutation passent tous par ici. On y mesure la durée
     et l'on trace la requête au journal, si bien que les deux vues ne peuvent
     pas diverger. Signature et statuts restent ceux de la couche `api`. */
  const POINTS_API = {
    lister:    { methode: 'GET',    motif: '/contacts' },
    lire:      { methode: 'GET',    motif: '/contacts/:id' },
    creer:     { methode: 'POST',   motif: '/contacts' },
    modifier:  { methode: 'PUT',    motif: '/contacts/:id' },
    patcher:   { methode: 'PATCH',  motif: '/contacts/:id' },
    supprimer: { methode: 'DELETE', motif: '/contacts/:id' }
  };

  /* Reconstitue le chemin réellement appelé (« /contacts/3 »). */
  function cheminAppele(motif, args) {
    return motif.indexOf(':id') === -1 ? motif : motif.replace(':id', String(args[0]));
  }

  /* Enveloppe les 6 points d'API avec la journalisation des requêtes.
     Appelée UNE FOIS dans init(), après la détection du moteur, si
     bien qu'elle enveloppe soit le simulateur local, soit les
     requêtes HTTP réelles — le journal reste alimenté dans les deux
     cas. Double enrobage évité : on ne l'appelle qu'une seule fois. */
  function envelopperJournal() {
    Object.keys(POINTS_API).forEach(function (cle) {
      const point = POINTS_API[cle];
      const brut = api[cle];
      api[cle] = function () {
        const args = Array.prototype.slice.call(arguments);
        const debut = performance.now();
        return Promise.resolve(brut.apply(api, args)).then(function (reponse) {
          consignerRequete(point.methode, cheminAppele(point.motif, args), reponse.statut,
            Math.round(performance.now() - debut));
          return reponse;
        });
      };
    });
  }

  /* ---------------------------------------------------------
     3. Utilitaires DOM (construction sûre : jamais d'innerHTML)
     --------------------------------------------------------- */
  function $(selecteur) { return document.querySelector(selecteur); }

  function creer(balise, classe, contenu) {
    const el = document.createElement(balise);
    if (classe) el.className = classe;
    if (contenu !== undefined && contenu !== null) el.textContent = String(contenu);
    return el;
  }

  /* Notifications éphémères. */
  function notifier(message, type) {
    const zone = document.getElementById('notifs');
    const el = creer('div', 'notif' + (type ? ' notif--' + type : ''), message);
    zone.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('visible'); });
    setTimeout(function () {
      el.classList.remove('visible');
      setTimeout(function () { el.remove(); }, 250);
    }, 3200);
  }

  /* ---------------------------------------------------------
     4. Thème clair / sombre
     --------------------------------------------------------- */
  function themeInitial() {
    const enregistre = stockage.lire(CLE_THEME, null);
    if (enregistre === 'sombre' || enregistre === 'clair') return enregistre;
    const prefereSombre = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefereSombre ? 'sombre' : 'clair';
  }

  function appliquerTheme(theme) {
    const sombre = theme === 'sombre';
    document.body.classList.toggle('sombre', sombre);
    const btn = document.getElementById('theme');
    btn.setAttribute('aria-label', sombre ? 'Activer le thème clair' : 'Activer le thème sombre');
    btn.setAttribute('aria-pressed', String(sombre));
  }

  function brancherTheme() {
    appliquerTheme(themeInitial());
    document.getElementById('theme').addEventListener('click', function () {
      const suivant = document.body.classList.contains('sombre') ? 'clair' : 'sombre';
      appliquerTheme(suivant);
      stockage.ecrire(CLE_THEME, suivant);
    });
  }

  /* ---------------------------------------------------------
     5. Console d'API
     --------------------------------------------------------- */
  const ROUTES = [
    { id: 'lister', methode: 'GET', motif: '/contacts', avecId: false, avecCorps: false, avecParams: true,
      aide: 'Renvoie la collection filtrée, triée et paginée (q, tri, sens, page, limit).' },
    { id: 'lire', methode: 'GET', motif: '/contacts/:id', avecId: true, avecCorps: false, avecParams: false,
      aide: "Renvoie un contact précis, ou 404 s'il n'existe pas." },
    { id: 'creer', methode: 'POST', motif: '/contacts', avecId: false, avecCorps: true, avecParams: false,
      exemple: { nom: 'Nadia Chraibi', email: 'nadia.chraibi@example.ma', ville: 'Fès', telephone: '+212 6 40 55 66 77' },
      aide: 'Crée un contact : « nom » et « email » obligatoires.' },
    { id: 'modifier', methode: 'PUT', motif: '/contacts/:id', avecId: true, avecCorps: true, avecParams: false,
      exemple: { nom: 'Omar Benjelloun', email: 'omar.benjelloun@example.ma', ville: 'Agadir', telephone: '+212 6 61 22 33 44' },
      aide: 'Remplace intégralement un contact existant.' },
    { id: 'patcher', methode: 'PATCH', motif: '/contacts/:id', avecId: true, avecCorps: true, avecParams: false,
      exemple: { ville: 'Rabat' },
      aide: 'Met à jour partiellement : seuls les champs du corps changent.' },
    { id: 'supprimer', methode: 'DELETE', motif: '/contacts/:id', avecId: true, avecCorps: false, avecParams: false,
      aide: 'Supprime un contact. Réponse 204 sans corps.' }
  ];

  const LIBELLES = {
    200: 'OK', 201: 'Created', 204: 'No Content',
    400: 'Bad Request', 404: 'Not Found', 500: 'Internal Server Error'
  };

  let routeActiveId = 'lister';
  let requeteEnCours = false;

  function routeActive() {
    return ROUTES.filter(function (r) { return r.id === routeActiveId; })[0];
  }

  function construireRoutes() {
    const zone = document.getElementById('routes');
    zone.textContent = '';
    ROUTES.forEach(function (r) {
      const bouton = creer('button', 'route');
      bouton.type = 'button';
      bouton.dataset.route = r.id;
      bouton.setAttribute('aria-pressed', String(r.id === routeActiveId));

      const badge = creer('span', 'methode' + (r.methode === 'DELETE' ? ' methode--delete' : ''), r.methode);
      const chemin = creer('span', 'route__chemin', r.motif);
      bouton.appendChild(badge);
      bouton.appendChild(chemin);
      bouton.addEventListener('click', function () { selectionnerRoute(r.id); });
      zone.appendChild(bouton);
    });
  }

  function selectionnerRoute(id) {
    routeActiveId = id;
    document.querySelectorAll('.route').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.route === id));
    });
    majChampsRoute();
  }

  /* Adapte URL, champ identifiant, corps JSON et libellés à la route choisie. */
  function majChampsRoute() {
    const r = routeActive();
    const champId = document.getElementById('champ-id');
    const inputId = document.getElementById('req-id');
    const champParams = document.getElementById('champ-params');
    const inputParams = document.getElementById('req-params');
    const url = document.getElementById('req-url');
    const corps = document.getElementById('req-corps');
    const badge = document.getElementById('btn-methode');

    champId.hidden = !r.avecId;
    inputId.disabled = !r.avecId;
    champParams.hidden = !r.avecParams;
    inputParams.disabled = !r.avecParams;
    corps.disabled = !r.avecCorps;
    corps.value = r.avecCorps ? JSON.stringify(r.exemple, null, 2) : '';

    url.value = r.avecId ? r.motif.replace(':id', inputId.value.trim() || '1') : r.motif;

    document.getElementById('req-aide').textContent = r.aide;
    badge.textContent = r.methode;
    badge.classList.toggle('methode--delete', r.methode === 'DELETE');
  }

  function majURLDepuisId() {
    const r = routeActive();
    if (!r.avecId) return;
    const valeur = document.getElementById('req-id').value.trim() || '1';
    document.getElementById('req-url').value = r.motif.replace(':id', valeur);
  }

  /* --- Rendu JSON : nœuds construits un par un, jamais d'innerHTML --- */
  function noeudValeur(valeur, niveau) {
    const frag = document.createDocumentFragment();

    if (Array.isArray(valeur)) {
      if (valeur.length === 0) { frag.appendChild(creer('span', 'json-p', '[]')); return frag; }
      frag.appendChild(creer('span', 'json-p', '['));
      valeur.forEach(function (v, i) {
        frag.appendChild(document.createTextNode('\n' + '  '.repeat(niveau + 1)));
        frag.appendChild(noeudValeur(v, niveau + 1));
        if (i < valeur.length - 1) frag.appendChild(creer('span', 'json-p', ','));
      });
      frag.appendChild(document.createTextNode('\n' + '  '.repeat(niveau)));
      frag.appendChild(creer('span', 'json-p', ']'));
      return frag;
    }

    if (valeur !== null && typeof valeur === 'object') {
      const cles = Object.keys(valeur);
      if (cles.length === 0) { frag.appendChild(creer('span', 'json-p', '{}')); return frag; }
      frag.appendChild(creer('span', 'json-p', '{'));
      cles.forEach(function (k, i) {
        frag.appendChild(document.createTextNode('\n' + '  '.repeat(niveau + 1)));
        frag.appendChild(creer('span', 'json-cle', JSON.stringify(k)));
        frag.appendChild(creer('span', 'json-p', ': '));
        frag.appendChild(noeudValeur(valeur[k], niveau + 1));
        if (i < cles.length - 1) frag.appendChild(creer('span', 'json-p', ','));
      });
      frag.appendChild(document.createTextNode('\n' + '  '.repeat(niveau)));
      frag.appendChild(creer('span', 'json-p', '}'));
      return frag;
    }

    if (typeof valeur === 'string') frag.appendChild(creer('span', 'json-chaine', JSON.stringify(valeur)));
    else if (typeof valeur === 'number') frag.appendChild(creer('span', 'json-nombre', String(valeur)));
    else if (typeof valeur === 'boolean') frag.appendChild(creer('span', 'json-mot', String(valeur)));
    else frag.appendChild(creer('span', 'json-null', 'null'));
    return frag;
  }

  function afficherJSON(valeur, statut) {
    const zone = document.getElementById('rep-json');
    zone.textContent = '';
    if (statut === 204 || valeur === null || valeur === undefined) {
      zone.appendChild(creer('p', 'vide', statut === 204 ? 'Aucun corps — 204 No Content.' : 'Aucun corps.'));
      return;
    }
    const pre = creer('pre', 'json__pre');
    pre.appendChild(noeudValeur(valeur, 0));
    zone.appendChild(pre);
  }

  function afficherReponse(statut, corps, duree) {
    const elStatut = document.getElementById('rep-statut');
    elStatut.textContent = statut + ' ' + (LIBELLES[statut] || '');
    elStatut.classList.remove('statut--vide');
    elStatut.classList.toggle('statut--erreur', statut >= 400);
    document.getElementById('rep-duree').textContent = (typeof duree === 'number') ? duree + ' ms' : '—';
    afficherJSON(corps, statut);
  }

  function etatEnvoi(actif) {
    const bouton = document.getElementById('btn-envoyer');
    bouton.disabled = actif;
    if (actif) bouton.setAttribute('aria-busy', 'true');
    else bouton.removeAttribute('aria-busy');
    bouton.querySelector('.btn__txt').textContent = actif ? 'Envoi…' : 'Envoyer';
  }

  /* Exécute la route sélectionnée et affiche la réponse. */
  async function envoyerRequete() {
    if (requeteEnCours) return;
    const route = routeActive();

    /* Corps JSON — validation côté client avant tout appel.
       Ces refus affichent un 400 : on les consigne aussi au journal, sinon la
       console montrerait un code que le journal n'aurait jamais vu. */
    function refuserCorps(erreur) {
      afficherReponse(400, erreur, null);
      consignerRequete(route.methode, document.getElementById('req-url').value.trim() || route.motif, 400, 0);
    }

    let corps;
    if (route.avecCorps) {
      const brut = document.getElementById('req-corps').value.trim();
      if (!brut) {
        refuserCorps({ erreur: 'Corps de requête vide', attendu: 'Objet JSON avec au minimum « nom » et « email ».' });
        return;
      }
      try {
        corps = JSON.parse(brut);
      } catch (err) {
        refuserCorps({ erreur: 'JSON invalide', message: 'Le corps de la requête n’a pas pu être analysé.', detail: String(err && err.message ? err.message : err) });
        return;
      }
    }

    /* Identifiant : champ dédié, avec repli sur l'URL. */
    let id = document.getElementById('req-id').value.trim();
    if (route.avecId && !id) {
      const trouve = document.getElementById('req-url').value.match(/(\d+)\s*$/);
      if (trouve) id = trouve[1];
    }

    requeteEnCours = true;
    etatEnvoi(true);
    const debut = performance.now();
    let reponse;
    try {
      if (route.id === 'lister') reponse = await api.lister(document.getElementById('req-params').value);
      else if (route.id === 'lire') reponse = await api.lire(id);
      else if (route.id === 'creer') reponse = await api.creer(corps);
      else if (route.id === 'modifier') reponse = await api.modifier(id, corps);
      else if (route.id === 'patcher') reponse = await api.patcher(id, corps);
      else reponse = await api.supprimer(id);
    } catch (err) {
      reponse = { statut: 500, corps: { erreur: 'Erreur interne du simulateur', message: String(err && err.message ? err.message : err) } };
    }
    requeteEnCours = false;
    etatEnvoi(false);
    afficherReponse(reponse.statut, reponse.corps, Math.round(performance.now() - debut));

    /* Une mutation passée par la console met aussi l'annuaire à jour. */
    if (route.id === 'creer' || route.id === 'modifier' || route.id === 'patcher' || route.id === 'supprimer') {
      await rafraichirTableau();
    }
  }

  /* Après une action du formulaire : le tableau et la console restent cohérents. */
  async function apresMutation(reponse) {
    if (routeActive().methode === 'GET') {
      // La console affichait une lecture : on la rejoue pour montrer l'état frais.
      await envoyerRequete();
    } else {
      // Sinon on y reflète simplement la dernière opération.
      afficherReponse(reponse.statut, reponse.corps, null);
    }
  }

  function brancherConsole() {
    document.getElementById('form-requete').addEventListener('submit', function (e) {
      e.preventDefault();
      envoyerRequete();
    });
    document.getElementById('req-id').addEventListener('input', majURLDepuisId);
  }

  /* ---------------------------------------------------------
     6. Gestion des contacts
     --------------------------------------------------------- */
  let idEnEdition = null;
  let suppressionEnAttente = null;
  const CHAMPS = ['nom', 'email', 'ville', 'telephone'];

  /* État de consultation de l'annuaire : recherche, tri et pagination.
     Il est conservé à travers les créations / modifications / suppressions. */
  const ETAT_DEFAUT = { q: '', tri: 'id', sens: 'asc', page: 1, limit: 5 };
  let etat = Object.assign({}, ETAT_DEFAUT);

  function parametresTableau() {
    return { q: etat.q, tri: etat.tri, sens: etat.sens, page: etat.page, limit: etat.limit };
  }

  function ligneContact(contact) {
    const tr = document.createElement('tr');

    const tdNom = creer('td', 'cell--nom');
    tdNom.appendChild(creer('span', 'id-tag', '#' + contact.id));
    tdNom.appendChild(document.createTextNode(contact.nom));
    tr.appendChild(tdNom);

    tr.appendChild(creer('td', 'cell--mono', contact.email || '—'));
    tr.appendChild(creer('td', '', contact.ville || '—'));
    tr.appendChild(creer('td', 'cell--mono', contact.telephone || '—'));

    const tdActions = creer('td', 'cell--actions');
    if (suppressionEnAttente === contact.id) {
      const confirmer = creer('button', 'btn btn--danger btn--petit', 'Confirmer');
      confirmer.type = 'button';
      confirmer.dataset.action = 'confirmer';
      confirmer.dataset.id = contact.id;

      const annuler = creer('button', 'btn btn--secondaire btn--petit', 'Annuler');
      annuler.type = 'button';
      annuler.dataset.action = 'annuler-suppression';

      tdActions.appendChild(confirmer);
      tdActions.appendChild(annuler);
    } else {
      const modifier = creer('button', 'btn btn--secondaire btn--petit', 'Modifier');
      modifier.type = 'button';
      modifier.dataset.action = 'modifier';
      modifier.dataset.id = contact.id;

      const supprimer = creer('button', 'btn btn--danger-texte btn--petit', 'Supprimer');
      supprimer.type = 'button';
      supprimer.dataset.action = 'supprimer';
      supprimer.dataset.id = contact.id;

      tdActions.appendChild(modifier);
      tdActions.appendChild(supprimer);
    }
    tr.appendChild(tdActions);
    return tr;
  }

  async function rafraichirTableau() {
    let reponse = await api.lister(parametresTableau());
    if (!reponse || reponse.statut !== 200) return;

    /* Si la page courante est devenue vide (suppression par exemple), on
       se recale sur la dernière page valide. */
    if (etat.page > reponse.corps.meta.pages) {
      etat.page = reponse.corps.meta.pages;
      reponse = await api.lister(parametresTableau());
      if (reponse.statut !== 200) return;
    }

    const donnees = Array.isArray(reponse.corps.donnees) ? reponse.corps.donnees : [];
    const meta = reponse.corps.meta;
    etat.page = meta.page;

    const corps = document.getElementById('corps-tableau');
    corps.textContent = '';
    donnees.forEach(function (c) { corps.appendChild(ligneContact(c)); });

    const vide = document.getElementById('tableau-vide');
    vide.hidden = meta.total !== 0;
    vide.textContent = etat.q
      ? 'Aucun contact ne correspond à « ' + etat.q + ' ».'
      : "Aucun contact pour l'instant. Ajoutez-en un.";

    document.getElementById('compteur').textContent =
      meta.total + (meta.total > 1 ? ' contacts' : ' contact');

    majPagination(meta);
  }

  /* Précédent / Suivant + indicateur « Page X sur Y — N contacts ». */
  function majPagination(meta) {
    document.getElementById('btn-prec').disabled = meta.page <= 1;
    document.getElementById('btn-suiv').disabled = meta.page >= meta.pages;
    document.getElementById('pagination-etat').textContent =
      'Page ' + meta.page + ' sur ' + meta.pages + ' — ' +
      meta.total + (meta.total > 1 ? ' contacts' : ' contact');
  }

  /* Reflète l'état de tri dans le sélecteur et le bouton de sens. */
  function majSens() {
    const croissant = etat.sens === 'asc';
    document.getElementById('sens-texte').textContent =
      (croissant ? '↑ ' : '↓ ') + (croissant ? 'Croissant' : 'Décroissant');
    document.getElementById('btn-sens').setAttribute(
      'aria-label', 'Sens du tri : ' + (croissant ? 'croissant' : 'décroissant'));
  }

  /* Réaligne tous les contrôles de l'annuaire sur l'état courant. */
  function synchroniserControles() {
    document.getElementById('f-q').value = etat.q;
    document.getElementById('f-tri').value = etat.tri;
    document.getElementById('f-limit').value = String(etat.limit);
    majSens();
  }

  /* Réinitialise recherche, tri, sens et taille de page, puis revient page 1. */
  async function reinitialiserFiltres() {
    etat = Object.assign({}, ETAT_DEFAUT);
    synchroniserControles();
    await rafraichirTableau();
  }

  function lireFormulaire() {
    const donnees = {};
    CHAMPS.forEach(function (champ) {
      donnees[champ] = document.getElementById('c-' + champ).value.trim();
    });
    return donnees;
  }

  function afficherErreurs(erreurs) {
    CHAMPS.forEach(function (champ) {
      const input = document.getElementById('c-' + champ);
      const message = document.getElementById('err-' + champ);
      const texteErreur = erreurs && erreurs[champ];
      if (texteErreur) {
        input.setAttribute('aria-invalid', 'true');
        message.textContent = texteErreur;
        message.hidden = false;
      } else {
        input.removeAttribute('aria-invalid');
        message.textContent = '';
        message.hidden = true;
      }
    });
  }

  function demarrerEdition(contact) {
    idEnEdition = contact.id;
    CHAMPS.forEach(function (champ) {
      document.getElementById('c-' + champ).value = contact[champ] || '';
    });
    afficherErreurs(null);
    document.getElementById('t-form').textContent = 'Modifier le contact #' + contact.id;
    document.getElementById('btn-enregistrer').textContent = 'Enregistrer';
    document.getElementById('btn-annuler').hidden = false;
    document.getElementById('form-contact').scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('c-nom').focus();
  }

  function arreterEdition() {
    idEnEdition = null;
    document.getElementById('form-contact').reset();
    afficherErreurs(null);
    document.getElementById('t-form').textContent = 'Nouveau contact';
    document.getElementById('btn-enregistrer').textContent = 'Créer le contact';
    document.getElementById('btn-annuler').hidden = true;
  }

  async function surSoumissionFormulaire(e) {
    e.preventDefault();
    const donnees = lireFormulaire();

    /* Validation côté client (le « serveur » revalide de son côté). */
    const erreurs = valider(donnees);
    afficherErreurs(erreurs);
    if (Object.keys(erreurs).length) return;

    const bouton = document.getElementById('btn-enregistrer');
    const edition = idEnEdition !== null;
    bouton.disabled = true;
    let reponse;
    try {
      reponse = edition ? await api.modifier(idEnEdition, donnees) : await api.creer(donnees);
    } finally {
      bouton.disabled = false;
    }

    if (reponse.statut === 200 || reponse.statut === 201) {
      notifier(edition ? 'Contact #' + reponse.corps.id + ' modifié (200).' : 'Contact #' + reponse.corps.id + ' créé (201).', 'succes');
      arreterEdition();
      await rafraichirTableau();
      await apresMutation(reponse);
    } else {
      if (reponse.corps && reponse.corps.details) afficherErreurs(reponse.corps.details);
      notifier('Requête refusée (' + reponse.statut + ').', 'erreur');
      afficherReponse(reponse.statut, reponse.corps, null);
    }
  }

  async function surClicTableau(e) {
    const bouton = e.target.closest('button[data-action]');
    if (!bouton) return;
    const action = bouton.dataset.action;
    const id = bouton.dataset.id;

    if (action === 'supprimer') {
      suppressionEnAttente = Number(id);
      await rafraichirTableau();
      return;
    }
    if (action === 'annuler-suppression') {
      suppressionEnAttente = null;
      await rafraichirTableau();
      return;
    }
    if (action === 'confirmer') {
      suppressionEnAttente = null;
      const reponse = await api.supprimer(id);
      if (reponse.statut === 204) notifier('Contact #' + id + ' supprimé (204).', 'succes');
      else notifier('Suppression impossible (' + reponse.statut + ').', 'erreur');
      await rafraichirTableau();
      await apresMutation(reponse);
      return;
    }
    if (action === 'modifier') {
      const reponse = await api.lire(id);
      if (reponse.statut === 200) demarrerEdition(reponse.corps);
      else notifier('Contact introuvable (404).', 'erreur');
    }
  }

  async function surReinitialisation() {
    await reinitialiserDonnees();
    suppressionEnAttente = null;
    if (idEnEdition !== null) arreterEdition();
    etat = Object.assign({}, ETAT_DEFAUT);
    synchroniserControles();
    await rafraichirTableau();
    notifier('Données réinitialisées (8 contacts d’exemple).', 'succes');
    if (routeActive().methode === 'GET') await envoyerRequete();
  }

  /* Recherche, tri et pagination côté annuaire. */
  function surRecherche(e) {
    e.preventDefault();
    etat.q = document.getElementById('f-q').value.trim();
    etat.page = 1;
    rafraichirTableau();
  }

  function surTri() {
    etat.tri = document.getElementById('f-tri').value;
    etat.page = 1;
    rafraichirTableau();
  }

  function surSens() {
    etat.sens = etat.sens === 'asc' ? 'desc' : 'asc';
    majSens();
    etat.page = 1;
    rafraichirTableau();
  }

  function surTaillePage() {
    etat.limit = Number(document.getElementById('f-limit').value) || LIMITE_DEFAUT;
    etat.page = 1;
    rafraichirTableau();
  }

  function pagePrecedente() {
    if (etat.page <= 1) return;
    etat.page -= 1;
    rafraichirTableau();
  }

  function pageSuivante() {
    etat.page += 1;
    rafraichirTableau();
  }

  function brancherGestion() {
    document.getElementById('form-contact').addEventListener('submit', surSoumissionFormulaire);
    document.getElementById('btn-annuler').addEventListener('click', arreterEdition);
    document.getElementById('btn-reset').addEventListener('click', surReinitialisation);
    document.getElementById('corps-tableau').addEventListener('click', surClicTableau);

    document.getElementById('form-recherche').addEventListener('submit', surRecherche);
    document.getElementById('f-tri').addEventListener('change', surTri);
    document.getElementById('btn-sens').addEventListener('click', surSens);
    document.getElementById('f-limit').addEventListener('change', surTaillePage);
    document.getElementById('btn-reset-filtres').addEventListener('click', reinitialiserFiltres);
    document.getElementById('btn-prec').addEventListener('click', pagePrecedente);
    document.getElementById('btn-suiv').addEventListener('click', pageSuivante);

    /* Efface l'erreur d'un champ dès que l'utilisateur le corrige. */
    CHAMPS.forEach(function (champ) {
      const input = document.getElementById('c-' + champ);
      input.addEventListener('input', function () {
        if (input.getAttribute('aria-invalid') === 'true') {
          input.removeAttribute('aria-invalid');
          const message = document.getElementById('err-' + champ);
          message.textContent = '';
          message.hidden = true;
        }
      });
    });
  }

  /* ---------------------------------------------------------
     7. Journal des requêtes
     Consigne en mémoire ce que le serveur simulé a réellement
     traité. Alimenté par l'enveloppe de la section 2, il reste
     donc d'accord avec la réponse affichée par la console.
     --------------------------------------------------------- */
  const JOURNAL_MAX = 50;
  let journal = [];

  /* HH:MM:SS, à la seconde. */
  function horodatage() {
    const d = new Date();
    return [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (n) {
      return String(n).padStart(2, '0');
    }).join(':');
  }

  /* 2xx : accent courant, 4xx : alerte douce, 5xx : alerte pleine. */
  function classeStatut(statut) {
    if (statut >= 500) return 'statut statut--critique';
    if (statut >= 400) return 'statut statut--erreur';
    return 'statut';
  }

  function ligneJournal(entree) {
    const li = creer('li', 'journal__ligne');
    li.appendChild(creer('span', 'journal__heure', entree.heure));
    li.appendChild(creer('span', 'methode' + (entree.methode === 'DELETE' ? ' methode--delete' : ''), entree.methode));
    li.appendChild(creer('span', 'journal__chemin', entree.chemin));
    li.appendChild(creer('span', classeStatut(entree.statut), entree.statut + ' ' + (LIBELLES[entree.statut] || '')));
    li.appendChild(creer('span', 'duree', entree.duree + ' ms'));
    return li;
  }

  function afficherJournal() {
    const zone = document.getElementById('journal-liste');
    zone.textContent = '';
    if (!journal.length) {
      zone.appendChild(creer('li', 'vide', 'Aucune requête pour le moment.'));
    } else {
      journal.forEach(function (entree) { zone.appendChild(ligneJournal(entree)); });
    }
    document.getElementById('journal-compteur').textContent =
      journal.length + (journal.length > 1 ? ' requêtes' : ' requête');
  }

  /* Appelé par l'enveloppe de service à chaque requête traitée. */
  function consignerRequete(methode, chemin, statut, duree) {
    journal.unshift({ methode: methode, chemin: chemin, statut: statut, duree: duree, heure: horodatage() });
    if (journal.length > JOURNAL_MAX) journal.length = JOURNAL_MAX;
    afficherJournal();
  }

  function viderJournal() {
    if (!journal.length) return;
    journal = [];
    afficherJournal();
    notifier('Journal vidé.', 'succes');
  }

  function brancherJournal() {
    document.getElementById('btn-vider-journal').addEventListener('click', viderJournal);
  }

  /* ---------------------------------------------------------
     Démarrage
     --------------------------------------------------------- */
  async function init() {
    /* Détection du moteur : si un serveur Node répond, on bascule en
       mode full-stock (SQLite) ; sinon on reste en localStorage. */
    try { await window.LumeAPI.detecter(); } catch (e) { /* mode local */ }
    if (window.LumeAPI.actif) brancherMoteurDistant();
    envelopperJournal();  // journalise le moteur effectivement retenu
    afficherMoteur();

    brancherTheme();
    document.getElementById('annee').textContent = new Date().getFullYear();

    construireRoutes();
    selectionnerRoute('lister');
    brancherConsole();
    brancherGestion();
    brancherJournal();
    synchroniserControles();  // aligne tri, sens et taille de page sur l'état initial
    afficherJournal();        // journal vide au premier rendu

    if (!moteurDistant) charger();   // en mode local, garantit la présence des exemples
    await rafraichirTableau();
    await envoyerRequete();  // la console affiche d'emblée GET /contacts
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
