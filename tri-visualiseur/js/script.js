/* ======================================================================
   Tri-visualiseur
   ----------------------------------------------------------------------
   Cinq algorithmes de tri écrits comme des générateurs : chaque appel de
   next() rend une étape, que le rendu met simplement en scène. L'algorithme
   et le graphique sont donc découplés — le même générateur alimente le mode
   pas à pas, l'exécution automatique et les statistiques.
   ====================================================================== */
(function () {
  'use strict';

  /* ----------------------------- Stockage ----------------------------- */
  const stockage = {
    lire(cle, defaut) { try { const v = localStorage.getItem(cle); return v === null ? defaut : JSON.parse(v); } catch (e) { return defaut; } },
    ecrire(cle, valeur) { try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch (e) {} }
  };
  const CLE_THEME = 'tri-theme';
  const CLE_REGLAGES = 'tri-reglages';

  const $ = function (sel) { return document.querySelector(sel); };

  const formaterNombre = function (n) { return Number(n).toLocaleString('fr-FR'); };
  const formaterDuree = function (ms) {
    if (ms < 1000) { return Math.round(ms) + ' ms'; }
    return (ms / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' s';
  };
  const range = function (a, b) { const r = []; for (let i = a; i < b; i++) { r.push(i); } return r; };
  const echanger = function (t, i, j) { const x = t[i]; t[i] = t[j]; t[j] = x; };

  /* ======================================================================
     1. Les algorithmes
     Chaque générateur rend des étapes de la forme :
       t    : le tableau à cet instant (copie)
       c    : indices en cours de comparaison
       e    : indices déplacés ou permutés
       p    : indices définitivement en place
       zone : [début, fin] région travaillée (fusion, rapide)
       m    : phrase lisible décrivant l'étape
     ====================================================================== */

  function* triBulles(t) {
    const n = t.length;
    let permut;
    for (let i = 0; i < n - 1; i++) {
      permut = false;
      for (let j = 0; j < n - 1 - i; j++) {
        yield { t: t.slice(), c: [j, j + 1], e: [], p: range(n - i, n), zone: null,
                m: t[j] + ' et ' + t[j + 1] + (t[j] > t[j + 1] ? ' : désordre' : ' : déjà en ordre') };
        if (t[j] > t[j + 1]) {
          echanger(t, j, j + 1);
          permut = true;
          yield { t: t.slice(), c: [], e: [j, j + 1], p: range(n - i, n), zone: null, m: 'Permutation' };
        }
      }
      yield { t: t.slice(), c: [], e: [], p: range(n - 1 - i, n), zone: null,
              m: 'Le plus grand « remonte » à droite' };
      if (!permut) {
        yield { t: t.slice(), c: [], e: [], p: range(0, n), zone: null, m: 'Aucune permutation : le tableau est trié' };
        return;
      }
    }
    yield { t: t.slice(), c: [], e: [], p: range(0, n), zone: null, m: 'Trié' };
  }

  function* triInsertion(t) {
    const n = t.length;
    yield { t: t.slice(), c: [0], e: [], p: [0], zone: null, m: 'Le premier élément sert de base' };
    for (let i = 1; i < n; i++) {
      const cle = t[i];
      let j = i - 1;
      yield { t: t.slice(), c: [j, i], e: [], p: range(0, i), zone: null,
              m: cle + ' doit rejoindre la partie triée' };
      while (j >= 0 && t[j] > cle) {
        t[j + 1] = t[j];
        yield { t: t.slice(), c: [], e: [j, j + 1], p: range(0, i), zone: null,
                m: t[j] + ' se décale d\'une place' };
        j--;
      }
      t[j + 1] = cle;
      yield { t: t.slice(), c: [], e: [j + 1], p: range(0, i + 1), zone: null,
              m: cle + ' s\'insère en position ' + (j + 2) };
    }
    yield { t: t.slice(), c: [], e: [], p: range(0, n), zone: null, m: 'Trié' };
  }

  function* triSelection(t) {
    const n = t.length;
    for (let i = 0; i < n - 1; i++) {
      let min = i;
      for (let j = i + 1; j < n; j++) {
        yield { t: t.slice(), c: [min, j], e: [], p: range(0, i), zone: null,
                m: t[j] + (t[j] < t[min] ? ' devient le plus petit' : ' n\'est pas plus petit') };
        if (t[j] < t[min]) { min = j; }
      }
      if (min !== i) {
        echanger(t, i, min);
        yield { t: t.slice(), c: [], e: [i, min], p: range(0, i), zone: null, m: 'Le minimum rejoint sa position' };
      }
      yield { t: t.slice(), c: [], e: [], p: range(0, i + 1), zone: null, m: 'Position ' + (i + 1) + ' fixée' };
    }
    yield { t: t.slice(), c: [], e: [], p: range(0, n), zone: null, m: 'Trié' };
  }

  function* triFusion(t) {
    if (t.length > 1) { yield* fusionRec(t, 0, t.length - 1); }
    yield { t: t.slice(), c: [], e: [], p: range(0, t.length), zone: null, m: 'Trié' };
  }

  function* fusionRec(t, d, f) {
    if (d >= f) { return; }
    const m = Math.floor((d + f) / 2);
    yield* fusionRec(t, d, m);
    yield* fusionRec(t, m + 1, f);
    yield* fusionner(t, d, m, f);
  }

  function* fusionner(t, d, m, f) {
    const gauche = t.slice(d, m + 1);
    const droite = t.slice(m + 1, f + 1);
    let i = 0, j = 0, k = d;
    while (i < gauche.length && j < droite.length) {
      yield { t: t.slice(), c: [d + i, m + 1 + j], e: [], p: [], zone: [d, f],
              m: (gauche[i] <= droite[j]) ? gauche[i] + ' passe avant' : droite[j] + ' passe avant' };
      if (gauche[i] <= droite[j]) { t[k] = gauche[i]; i++; }
      else { t[k] = droite[j]; j++; }
      yield { t: t.slice(), c: [], e: [k], p: [], zone: [d, f], m: 'Recopie en position ' + (k + 1) };
      k++;
    }
    while (i < gauche.length) { t[k] = gauche[i]; yield { t: t.slice(), c: [], e: [k], p: [], zone: [d, f], m: 'Recopie du reste gauche' }; i++; k++; }
    while (j < droite.length) { t[k] = droite[j]; yield { t: t.slice(), c: [], e: [k], p: [], zone: [d, f], m: 'Recopie du reste droit' }; j++; k++; }
  }

  function* triRapide(t) {
    if (t.length > 1) { yield* rapideRec(t, 0, t.length - 1); }
    yield { t: t.slice(), c: [], e: [], p: range(0, t.length), zone: null, m: 'Trié' };
  }

  function* rapideRec(t, d, f) {
    if (d > f) { return; }
    if (d === f) {
      yield { t: t.slice(), c: [], e: [], p: [d], zone: null, m: 'Un seul élément : déjà en place' };
      return;
    }
    const g = yield* partager(t, d, f);
    yield* rapideRec(t, d, g - 1);
    yield* rapideRec(t, g + 1, f);
  }

  function* partager(t, d, f) {
    const pivot = t[f];
    yield { t: t.slice(), c: [f], e: [], p: [], zone: [d, f], m: 'Pivot retenu : ' + pivot };
    let i = d;
    for (let j = d; j < f; j++) {
      yield { t: t.slice(), c: [j, f], e: [], p: [], zone: [d, f],
              m: t[j] + (t[j] < pivot ? ' est plus petit : on l\'échange' : ' est plus grand : on le laisse') };
      if (t[j] < pivot) {
        if (i !== j) { echanger(t, i, j); yield { t: t.slice(), c: [], e: [i, j], p: [], zone: [d, f], m: 'Rapprochement à gauche' }; }
        i++;
      }
    }
    echanger(t, i, f);
    yield { t: t.slice(), c: [], e: [i, f], p: [i], zone: [d, f], m: 'Le pivot prend sa place définitive' };
    return i;
  }

  /* ------------------------- Catalogue des algos ------------------------- */
  const ALGOS = {
    bulles:    { nom: 'Tri à bulles',     pire: 'O(n²)', moyen: 'O(n²)', meilleur: 'O(n)',   memoire: 'O(1)', stable: 'Oui',    cle: 'bulles',    generateur: triBulles,
                 note: 'S\'arrête dès qu\'un passage n\'a rien permuté, d\'où le O(n) du meilleur cas.' },
    insertion: { nom: 'Tri par insertion', pire: 'O(n²)', moyen: 'O(n²)', meilleur: 'O(n)',   memoire: 'O(1)', stable: 'Oui',    cle: 'insertion', generateur: triInsertion,
                 note: 'Excellent sur des données presque triées, médiocre sur de l\'aléatoire.' },
    selection: { nom: 'Tri par sélection', pire: 'O(n²)', moyen: 'O(n²)', meilleur: 'O(n²)',  memoire: 'O(1)', stable: 'Non',    cle: 'selection', generateur: triSelection,
                 note: 'Toujours O(n²) comparaisons, mais au plus n-1 permutations.' },
    fusion:    { nom: 'Tri fusion',        pire: 'O(n log n)', moyen: 'O(n log n)', meilleur: 'O(n log n)', memoire: 'O(n)', stable: 'Oui', cle: 'fusion', generateur: triFusion,
                 note: 'Stable et prévisible, au prix d\'un tableau auxiliaire.' },
    rapide:    { nom: 'Tri rapide',        pire: 'O(n²)', moyen: 'O(n log n)', meilleur: 'O(n log n)', memoire: 'O(1)', stable: 'Non', cle: 'rapide', generateur: triRapide,
                 note: 'Le pivot compte : un pivot défavorable dégénère en O(n²).' }
  };
  const ORDRE_ALGOS = ['bulles', 'insertion', 'selection', 'fusion', 'rapide'];

  /* ======================================================================
     2. État de l'application
     ====================================================================== */
  let valeurs = [];        // valeurs de référence (non triées)
  let etat = [];           // tableau affiché
  let generateur = null;
  let derniereEtape = null;
  let enMarche = false;
  let minuteur = null;
  let debutChrono = 0;
  let tempsEcoule = 0;
  let compteurs = { comparaisons: 0, ecritures: 0 };
  let termine = false;
  let barres = [];

  const el = {
    algorithme: $('#algorithme'),
    forme: $('#forme'),
    taille: $('#taille'),
    tailleValeur: $('#taille-valeur'),
    vitesse: $('#vitesse'),
    vitesseValeur: $('#vitesse-valeur'),
    reglagesNote: $('#reglages-note'),
    vueNote: $('#vue-note'),
    zoneBarres: $('#barres'),
    lecture: $('#lecture'),
    statut: $('#statut'),
    mComp: $('#m-comparaisons'),
    mEcrit: $('#m-ecritures'),
    mTemps: $('#m-temps'),
    mEtat: $('#m-etat'),
    mEtatNote: $('#m-etat-note'),
    btnLancer: $('#btn-lancer'),
    libelleLancer: $('#libelle-lancer'),
    icoLancer: $('#ico-lancer'),
    btnPas: $('#btn-pas'),
    btnNouveau: $('#btn-nouveau'),
    btnReset: $('#btn-reset'),
    corpsComplexite: $('#corps-complexite'),
    theme: $('#theme')
  };

  /* ----------------------------- Thème ----------------------------- */
  function appliquerTheme(sombre) {
    document.body.classList.toggle('sombre', sombre);
    el.theme.setAttribute('aria-pressed', String(sombre));
    el.theme.setAttribute('aria-label', sombre ? 'Activer le thème clair' : 'Activer le thème sombre');
  }
  el.theme.addEventListener('click', function () {
    const sombre = !document.body.classList.contains('sombre');
    appliquerTheme(sombre);
    stockage.ecrire(CLE_THEME, sombre ? 'sombre' : 'clair');
  });

  /* -------------------------- Réglages mémorisés -------------------------- */
  const REGLAGES_DEFAUT = { algorithme: 'rapide', forme: 'aleatoire', taille: 30, vitesse: 5 };
  function chargerReglages() {
    const brut = stockage.lire(CLE_REGLAGES, null);
    if (!brut || typeof brut !== 'object') { return Object.assign({}, REGLAGES_DEFAUT); }
    return {
      algorithme: ALGOS[brut.algorithme] ? brut.algorithme : REGLAGES_DEFAUT.algorithme,
      forme: ['aleatoire', 'presque', 'inverse'].indexOf(brut.forme) >= 0 ? brut.forme : REGLAGES_DEFAUT.forme,
      taille: Math.min(60, Math.max(8, parseInt(brut.taille, 10) || REGLAGES_DEFAUT.taille)),
      vitesse: Math.min(10, Math.max(1, parseInt(brut.vitesse, 10) || REGLAGES_DEFAUT.vitesse))
    };
  }
  function memoriserReglages() {
    stockage.ecrire(CLE_REGLAGES, {
      algorithme: el.algorithme.value, forme: el.forme.value,
      taille: parseInt(el.taille.value, 10), vitesse: parseInt(el.vitesse.value, 10)
    });
  }

  /* --------------------------- Génération des données --------------------------- */
  function genererValeurs(n, forme) {
    const v = [];
    for (let i = 0; i < n; i++) { v.push(5 + Math.round(i * (95 / Math.max(1, n - 1)))); }
    // mélange de Fisher-Yates
    for (let i = v.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      echanger(v, i, j);
    }
    if (forme === 'inverse') { v.sort(function (a, b) { return b - a; }); }
    else if (forme === 'presque') {
      v.sort(function (a, b) { return a - b; });
      const perturbations = Math.max(1, Math.round(n * 0.08));
      for (let k = 0; k < perturbations; k++) {
        const i = Math.floor(Math.random() * (n - 1));
        echanger(v, i, i + 1);
      }
    }
    return v;
  }

  /* ------------------------------ Rendu ------------------------------ */
  function construireBarres() {
    el.zoneBarres.textContent = '';
    barres = etat.map(function (valeur, i) {
      const b = document.createElement('span');
      b.className = 'barre';
      b.style.height = valeur + '%';
      b.title = 'Position ' + (i + 1) + ' : ' + valeur;
      el.zoneBarres.appendChild(b);
      return b;
    });
    majLegendeAccessible();
  }

  function classePour(etape, i) {
    if (etape.c.indexOf(i) >= 0) { return ' barre--compare'; }
    if (etape.e.indexOf(i) >= 0) { return ' barre--ecrit'; }
    if (etape.p.indexOf(i) >= 0) { return ' barre--place'; }
    if (etape.zone && i >= etape.zone[0] && i <= etape.zone[1]) { return ' barre--zone'; }
    return '';
  }

  function rendreEtape(etape) {
    const t = etape.t;
    for (let i = 0; i < barres.length; i++) {
      barres[i].style.height = t[i] + '%';
      barres[i].className = 'barre' + classePour(etape, i);
      barres[i].title = 'Position ' + (i + 1) + ' : ' + t[i];
    }
    el.lecture.textContent = etape.m;
    majLegendeAccessible(etape);
  }

  function majLegendeAccessible(etape) {
    const nom = ALGOS[el.algorithme.value].nom;
    const base = nom + ', ' + etat.length + ' valeurs.';
    el.zoneBarres.setAttribute('aria-label', etape
      ? base + ' Étape en cours : ' + etape.m + '.'
      : base + ' Tableau non trié.');
  }

  /* ------------------------------ Mesures ------------------------------ */
  function majMesures(etape) {
    el.mComp.textContent = formaterNombre(compteurs.comparaisons);
    el.mEcrit.textContent = formaterNombre(compteurs.ecritures);
    const total = tempsEcoule + (enMarche ? Date.now() - debutChrono : 0);
    el.mTemps.textContent = formaterDuree(total);
  }

  function majEtat() {
    if (termine) {
      el.mEtat.textContent = 'Trié';
      el.mEtatNote.textContent = 'Tableau ordonné';
    } else if (enMarche) {
      el.mEtat.textContent = 'En cours';
      el.mEtatNote.textContent = ALGOS[el.algorithme.value].nom;
    } else if (compteurs.comparaisons > 0) {
      el.mEtat.textContent = 'En pause';
      el.mEtatNote.textContent = 'Reprise possible';
    } else {
      el.mEtat.textContent = '—';
      el.mEtatNote.textContent = 'Aucune exécution';
    }
  }

  function annoncer(texte) { el.statut.textContent = texte; }

  /* ------------------------- Cycle de vie de l'exécution ------------------------- */
  function delaiCourant() {
    const v = parseInt(el.vitesse.value, 10);
    return Math.round(500 * Math.pow(0.01, (v - 1) / 9));
  }

  function reinitialiser(silencieux) {
    stopper();
    etat = valeurs.slice();
    generateur = null;
    derniereEtape = null;
    compteurs = { comparaisons: 0, ecritures: 0 };
    tempsEcoule = 0;
    termine = false;
    construireBarres();
    el.lecture.textContent = 'Prêt. Choisissez un algorithme et lancez.';
    el.vueNote.textContent = ALGOS[el.algorithme.value].nom + ' · ' + etat.length + ' valeurs · ' + libelleForme();
    majMesures();
    majEtat();
    majBoutons();
    if (!silencieux) { annoncer('Tableau réinitialisé.'); }
  }

  function nouveauTableau() {
    valeurs = genererValeurs(parseInt(el.taille.value, 10), el.forme.value);
    reinitialiser(true);
    annoncer('Nouveau tableau : ' + valeurs.length + ' valeurs, forme ' + libelleForme() + '.');
  }

  function libelleForme() {
    return { aleatoire: 'aléatoire', presque: 'presque trié', inverse: 'inverse' }[el.forme.value] || '';
  }

  function avancer() {
    if (!generateur) {
      generateur = ALGOS[el.algorithme.value].generateur(etat.slice());
    }
    const r = generateur.next();
    if (r.done) { terminer(); return false; }
    const e = r.value;
    if (e.c.length) { compteurs.comparaisons += e.c.length; }
    if (e.e.length) { compteurs.ecritures += e.e.length; }
    derniereEtape = e;
    rendreEtape(e);
    majMesures(e);
    return true;
  }

  function terminer() {
    stopper();
    termine = true;
    const dernier = derniereEtape;
    if (dernier) {
      const t = dernier.t;
      rendreEtape({ t: t, c: [], e: [], p: range(0, t.length), zone: null, m: 'Trié' });
    }
    majEtat();
    majBoutons();
    const total = tempsEcoule;
    el.lecture.textContent = ALGOS[el.algorithme.value].nom + ' terminé : ' +
      formaterNombre(compteurs.comparaisons) + ' comparaisons, ' +
      formaterNombre(compteurs.ecritures) + ' écritures, ' + formaterDuree(total) + '.';
    annoncer('Tri terminé en ' + formaterDuree(total) + ', avec ' +
      formaterNombre(compteurs.comparaisons) + ' comparaisons.');
  }

  function stopper() {
    if (minuteur) { clearTimeout(minuteur); minuteur = null; }
    if (enMarche) { tempsEcoule += Date.now() - debutChrono; }
    enMarche = false;
    majBoutons();
  }

  function boucle() {
    if (!enMarche) { return; }
    const ok = avancer();
    majMesures();
    if (!ok) { return; }
    minuteur = setTimeout(boucle, delaiCourant());
  }

  function lancer() {
    if (enMarche) {
      stopper();
      majEtat();
      annoncer('Exécution en pause.');
      return;
    }
    if (termine) { reinitialiser(true); }
    enMarche = true;
    debutChrono = Date.now();
    majEtat();
    majBoutons();
    annoncer('Exécution lancée : ' + ALGOS[el.algorithme.value].nom + '.');
    boucle();
  }

  function pasASpas() {
    if (enMarche) { stopper(); }
    if (termine) { return; }
    if (avancer()) { majEtat(); }
  }

  function majBoutons() {
    el.libelleLancer.textContent = enMarche ? 'Pause' : (termine ? 'Rejouer' : 'Lancer');
    el.icoLancer.setAttribute('href', enMarche ? '#i-pause' : '#i-play');
    el.btnPas.disabled = enMarche || termine;
    el.btnReset.disabled = compteurs.comparaisons === 0 && !termine;
  }

  /* --------------------------- Tableau des complexités --------------------------- */
  function rendreComplexite() {
    const actif = el.algorithme.value;
    el.corpsComplexite.textContent = '';
    ORDRE_ALGOS.forEach(function (cle) {
      const a = ALGOS[cle];
      const tr = document.createElement('tr');
      if (cle === actif) { tr.className = 'actif'; }

      const th = document.createElement('th');
      th.setAttribute('scope', 'row');
      th.textContent = a.nom;
      tr.appendChild(th);

      [a.pire, a.moyen, a.meilleur].forEach(function (v) {
        const td = document.createElement('td');
        td.className = 'n';
        td.textContent = v;
        tr.appendChild(td);
      });

      const memoire = document.createElement('td');
      memoire.className = 'n';
      memoire.textContent = a.memoire;
      tr.appendChild(memoire);

      const stable = document.createElement('td');
      stable.textContent = a.stable;
      tr.appendChild(stable);

      el.corpsComplexite.appendChild(tr);
    });
    el.reglagesNote.textContent = ALGOS[actif].note;
  }

  /* ------------------------------ Écouteurs ------------------------------ */
  el.algorithme.addEventListener('change', function () {
    memoriserReglages();
    reinitialiser(true);
    rendreComplexite();
    annoncer('Algorithme sélectionné : ' + ALGOS[el.algorithme.value].nom + '.');
  });

  el.forme.addEventListener('change', function () {
    memoriserReglages();
    nouveauTableau();
  });

  el.taille.addEventListener('input', function () {
    el.tailleValeur.textContent = el.taille.value;
    memoriserReglages();
  });
  el.taille.addEventListener('change', nouveauTableau);

  el.vitesse.addEventListener('input', function () {
    el.vitesseValeur.textContent = el.vitesse.value;
    memoriserReglages();
  });

  el.btnLancer.addEventListener('click', lancer);
  el.btnPas.addEventListener('click', pasASpas);
  el.btnNouveau.addEventListener('click', nouveauTableau);
  el.btnReset.addEventListener('click', function () { reinitialiser(); });

  // Barre d'espace sur les boutons de commande : on évite le double déclenchement.
  document.addEventListener('keydown', function (e) {
    if (e.key === ' ' && e.target && e.target.tagName === 'BUTTON') { e.stopPropagation(); }
  });

  /* ------------------------------ Démarrage ------------------------------ */
  function initialiser() {
    const memorise = stockage.lire(CLE_THEME, null);
    const sombre = memorise === null
      ? !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
      : memorise === 'sombre';
    appliquerTheme(sombre);

    const r = chargerReglages();
    el.algorithme.value = r.algorithme;
    el.forme.value = r.forme;
    el.taille.value = String(r.taille);
    el.tailleValeur.textContent = String(r.taille);
    el.vitesse.value = String(r.vitesse);
    el.vitesseValeur.textContent = String(r.vitesse);

    $('#annee').textContent = new Date().getFullYear();

    rendreComplexite();
    nouveauTableau();
  }

  initialiser();
})();
