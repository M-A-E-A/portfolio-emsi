/* ======================================================================
   Duel de tris
   ----------------------------------------------------------------------
   Deux algorithmes s’affrontent sur deux copies d’un même tableau.

   Chaque algorithme est écrit comme un générateur : tant qu’on ne l’interroge
   pas, il ne fait rien, et chaque appel de next() rend exactement une
   opération — une comparaison (k: 'cmp') ou une écriture (k: 'ecr'). Le duel
   consiste donc simplement à appeler next() sur A puis sur B, une fois par
   image. Rien à deviner côté rendu : il n’affiche que ce que l’algorithme
   lui donne, et les compteurs se déduisent du type d’opération reçue.

   Deux objets distincts coexistent :
     - un « candidat », qui porte l’état de la simulation (tableau, générateur,
       compteurs) ;
     - des « références », qui portent les nœuds du DOM.
   Ils ne partagent jamais le même nom de propriété, sinon un compteur
   chiffré finirait par remplacer un élément.
   ====================================================================== */
(function () {
  'use strict';

  /* ----------------------------- Stockage ----------------------------- */
  const stockage = {
    lire(cle, defaut) {
      try { const v = localStorage.getItem(cle); return v === null ? defaut : JSON.parse(v); }
      catch (e) { return defaut; }
    },
    ecrire(cle, valeur) {
      try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch (e) { /* indisponible */ }
    }
  };
  const CLE_THEME = 'duel-theme';
  const CLE_REGLAGES = 'duel-reglages';

  const $ = function (sel) { return document.querySelector(sel); };
  const range = function (d, f) { const r = []; for (let i = d; i < f; i++) r.push(i); return r; };
  const echanger = function (t, i, j) { const x = t[i]; t[i] = t[j]; t[j] = x; };

  /* ======================================================================
     1. Les algorithmes
     Chaque étape rend :
       t : le tableau à cet instant   c : indices comparés
       e : indices écrits ou permutés p : positions définitivement en place
       m : phrase lisible             k : 'cmp' | 'ecr' | 'info'
     ====================================================================== */

  function* triBulles(t) {
    const n = t.length;
    for (let i = 0; i < n - 1; i++) {
      let permut = false;
      for (let j = 0; j < n - 1 - i; j++) {
        yield { t: t.slice(), c: [j, j + 1], e: [], p: range(n - i, n),
                m: t[j] + ' et ' + t[j + 1] + (t[j] > t[j + 1] ? ' : désordre' : ' : déjà en ordre'), k: 'cmp' };
        if (t[j] > t[j + 1]) {
          echanger(t, j, j + 1);
          permut = true;
          yield { t: t.slice(), c: [], e: [j, j + 1], p: range(n - i, n), m: 'Permutation', k: 'ecr' };
        }
      }
      yield { t: t.slice(), c: [], e: [], p: range(n - 1 - i, n),
              m: 'Le plus grand glisse à droite', k: 'info' };
      if (!permut) {
        yield { t: t.slice(), c: [], e: [], p: range(0, n),
                m: 'Aucune permutation : le tableau est trié', k: 'info' };
        return;
      }
    }
    yield { t: t.slice(), c: [], e: [], p: range(0, n), m: 'Trié', k: 'info' };
  }

  function* triInsertion(t) {
    const n = t.length;
    yield { t: t.slice(), c: [0], e: [], p: [0], m: 'Le premier sert de base', k: 'info' };
    for (let i = 1; i < n; i++) {
      const cle = t[i];
      let j = i - 1;
      /* Chaque tour du while évalue une condition : c'est une comparaison.
         On la rend avant de tester, sinon le tri par insertion ne compterait
         qu'une seule comparaison par élément (n-1 au total), soit le minimum
         théorique — un résultat qui « prouve » exactement l'inverse de ce qui
         se passe. */
      while (j >= 0) {
        yield { t: t.slice(), c: [j, j + 1], e: [], p: range(0, i),
                m: t[j] + (t[j] > cle ? ' est trop grand : il descend' : ' laisse passer ' + cle),
                k: 'cmp' };
        if (t[j] <= cle) break;
        t[j + 1] = t[j];
        yield { t: t.slice(), c: [], e: [j, j + 1], p: [],
                m: t[j] + ' se décale d’une place', k: 'ecr' };
        j--;
      }
      t[j + 1] = cle;
      yield { t: t.slice(), c: [], e: [j + 1], p: range(0, i + 1),
              m: cle + ' s’insère en position ' + (j + 2), k: 'ecr' };
    }
    yield { t: t.slice(), c: [], e: [], p: range(0, n), m: 'Trié', k: 'info' };
  }

  function* triSelection(t) {
    const n = t.length;
    for (let i = 0; i < n - 1; i++) {
      let min = i;
      for (let j = i + 1; j < n; j++) {
        yield { t: t.slice(), c: [min, j], e: [], p: range(0, i),
                m: t[j] + (t[j] < t[min] ? ' devient le plus petit' : ' n’est pas plus petit'), k: 'cmp' };
        if (t[j] < t[min]) min = j;
      }
      if (min !== i) {
        echanger(t, i, min);
        yield { t: t.slice(), c: [], e: [i, min], p: range(0, i),
                m: 'Le minimum rejoint sa position', k: 'ecr' };
      }
      yield { t: t.slice(), c: [], e: [], p: range(0, i + 1),
              m: 'Position ' + (i + 1) + ' fixée', k: 'info' };
    }
    yield { t: t.slice(), c: [], e: [], p: range(0, n), m: 'Trié', k: 'info' };
  }

  function* triFusion(t) {
    if (t.length > 1) yield* fusionRec(t, 0, t.length - 1);
    yield { t: t.slice(), c: [], e: [], p: range(0, t.length), m: 'Trié', k: 'info' };
  }

  function* fusionRec(t, d, f) {
    if (d >= f) return;
    const m = Math.floor((d + f) / 2);
    yield* fusionRec(t, d, m);
    yield* fusionRec(t, m + 1, f);
    yield* fusionner(t, d, m, f);
  }

  function* fusionner(t, d, m, f) {
    const g = t.slice(d, m + 1);
    const dr = t.slice(m + 1, f + 1);
    let i = 0, j = 0, k = d;
    while (i < g.length && j < dr.length) {
      yield { t: t.slice(), c: [d + i, m + 1 + j], e: [], p: [],
              m: g[i] + ' et ' + dr[j] + ' : ' + (g[i] <= dr[j] ? g[i] + ' passe avant' : dr[j] + ' passe avant'), k: 'cmp' };
      if (g[i] <= dr[j]) { t[k] = g[i]; i++; }
      else { t[k] = dr[j]; j++; }
      yield { t: t.slice(), c: [], e: [k], p: [], m: 'Recopie en position ' + (k + 1), k: 'ecr' };
      k++;
    }
    while (i < g.length) {
      t[k] = g[i];
      yield { t: t.slice(), c: [], e: [k], p: [], m: 'Recopie du reste gauche', k: 'ecr' };
      i++; k++;
    }
    while (j < dr.length) {
      t[k] = dr[j];
      yield { t: t.slice(), c: [], e: [k], p: [], m: 'Recopie du reste droit', k: 'ecr' };
      j++; k++;
    }
  }

  function* triRapide(t) {
    yield* rapideRec(t, 0, t.length - 1);
    yield { t: t.slice(), c: [], e: [], p: range(0, t.length), m: 'Trié', k: 'info' };
  }

  function* rapideRec(t, d, f) {
    if (d > f) return;
    if (d === f) {
      yield { t: t.slice(), c: [], e: [], p: [d], m: 'Position ' + (d + 1) + ' fixée', k: 'info' };
      return;
    }
    const pivot = t[f];
    yield { t: t.slice(), c: [f], e: [], p: [], m: 'Pivot retenu : ' + pivot, k: 'cmp' };
    let i = d;
    for (let j = d; j < f; j++) {
      yield { t: t.slice(), c: [j, f], e: [], p: [],
              m: t[j] + (t[j] <= pivot ? ' reste à gauche' : ' passe à droite'), k: 'cmp' };
      if (t[j] <= pivot) {
        if (i !== j) {
          echanger(t, i, j);
          yield { t: t.slice(), c: [], e: [i, j], p: [], m: 'Rapprochement du pivot', k: 'ecr' };
        }
        i++;
      }
    }
    echanger(t, i, f);
    yield { t: t.slice(), c: [], e: [i, f], p: [i], m: 'Le pivot est en place', k: 'ecr' };
    yield* rapideRec(t, d, i - 1);
    yield* rapideRec(t, i + 1, f);
  }

  function* triTas(t) {
    const n = t.length;
    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) yield* entasser(t, n, i);
    yield { t: t.slice(), c: [], e: [], p: [], m: 'Tas constitué', k: 'info' };
    for (let fin = n - 1; fin > 0; fin--) {
      echanger(t, 0, fin);
      yield { t: t.slice(), c: [], e: [0, fin], p: [fin], m: 'La racine rejoint la fin', k: 'ecr' };
      yield* entasser(t, fin, 0);
    }
    yield { t: t.slice(), c: [], e: [], p: range(0, n), m: 'Trié', k: 'info' };
  }

  function* entasser(t, n, racine) {
    let max = racine;
    const g = 2 * racine + 1, d = 2 * racine + 2;
    if (g < n) {
      yield { t: t.slice(), c: [max, g], e: [], p: [],
              m: t[max] + ' et ' + t[g] + ' : quel est le plus grand ?', k: 'cmp' };
      if (t[g] > t[max]) max = g;
    }
    if (d < n) {
      yield { t: t.slice(), c: [max, d], e: [], p: [],
              m: t[max] + ' et ' + t[d] + ' : quel est le plus grand ?', k: 'cmp' };
      if (t[d] > t[max]) max = d;
    }
    if (max !== racine) {
      echanger(t, racine, max);
      yield { t: t.slice(), c: [], e: [racine, max], p: [], m: 'Le plus gros remonte', k: 'ecr' };
      yield* entasser(t, n, max);
    }
  }

  const ALGOS = {
    bulles:    { nom: 'Tri à bulles',      fabrique: triBulles },
    selection: { nom: 'Tri par sélection', fabrique: triSelection },
    insertion: { nom: 'Tri par insertion', fabrique: triInsertion },
    fusion:    { nom: 'Tri fusion',        fabrique: triFusion },
    rapide:    { nom: 'Tri rapide',        fabrique: triRapide },
    tas:       { nom: 'Tri par tas',       fabrique: triTas }
  };

  const FORMES = {
    aleatoire: 'Aléatoire',
    presque:   'Presque trié',
    inverse:   'Inverse',
    doublons:  'Beaucoup de doublons'
  };

  /* ======================================================================
     2. Thème
     ====================================================================== */
  function appliquerTheme(sombre) {
    document.body.classList.toggle('sombre', sombre);
    if (ui.theme) {
      ui.theme.setAttribute('aria-pressed', String(sombre));
      ui.theme.setAttribute('aria-label', sombre ? 'Passer au thème clair' : 'Passer au thème sombre');
    }
    stockage.ecrire(CLE_THEME, sombre ? 'sombre' : 'clair');
  }

  function themeInitial() {
    const mémorise = stockage.lire(CLE_THEME, null);
    if (mémorise !== null) return mémorise === 'sombre';
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  /* ======================================================================
     3. Données de départ
     Une seule table générée, puis dupliquée : les deux candidats partent
     d’une copie strictement identique.
     ====================================================================== */
  function genererValeurs(n, forme) {
    const v = [];
    if (forme === 'inverse') {
      for (let i = 0; i < n; i++) v.push(Math.round(5 + (n - i) * (95 / n)));
    } else if (forme === 'presque') {
      for (let i = 0; i < n; i++) v.push(Math.round(5 + i * (95 / Math.max(1, n - 1))));
      const brouilles = Math.max(1, Math.round(n / 12));
      for (let k = 0; k < brouilles; k++) {
        const i = Math.floor(Math.random() * (n - 1));
        echanger(v, i, i + 1);
      }
    } else if (forme === 'doublons') {
      const palette = [18, 36, 54, 72, 90];
      for (let i = 0; i < n; i++) v.push(palette[Math.floor(Math.random() * palette.length)]);
    } else {
      for (let i = 0; i < n; i++) v.push(Math.round(5 + Math.random() * 95));
    }
    return v;
  }

  /* ======================================================================
     4. Réglages
     ====================================================================== */
  const REGLAGES_DEFAUT = { algoA: 'fusion', algoB: 'rapide', forme: 'aleatoire', taille: 32, vitesse: 6 };

  function chargerReglages() {
    const brut = stockage.lire(CLE_REGLAGES, null);
    const r = Object.assign({}, REGLAGES_DEFAUT, (brut && typeof brut === 'object') ? brut : {});
    if (!ALGOS[r.algoA]) r.algoA = REGLAGES_DEFAUT.algoA;
    if (!ALGOS[r.algoB]) r.algoB = REGLAGES_DEFAUT.algoB;
    if (!FORMES[r.forme]) r.forme = REGLAGES_DEFAUT.forme;
    r.taille = Math.min(60, Math.max(8, Number(r.taille) || REGLAGES_DEFAUT.taille));
    r.vitesse = Math.min(10, Math.max(1, Number(r.vitesse) || REGLAGES_DEFAUT.vitesse));
    return r;
  }

  function memoriserReglages() {
    stockage.ecrire(CLE_REGLAGES, {
      algoA: ui.algoA.value, algoB: ui.algoB.value, forme: ui.forme.value,
      taille: Number(ui.taille.value), vitesse: Number(ui.vitesse.value)
    });
  }

  /* ======================================================================
     5. Éléments de la page
     ====================================================================== */
  const ui = {
    theme: $('#theme'),
    statut: $('#statut'),
    algoA: $('#algo-a'), algoB: $('#algo-b'), forme: $('#forme'),
    taille: $('#taille'), tailleValeur: $('#taille-valeur'),
    vitesse: $('#vitesse'), vitesseValeur: $('#vitesse-valeur'),
    reglagesNote: $('#reglages-note'), duelNote: $('#duel-note'),
    lancer: $('#btn-lancer'), libelleLancer: $('#libelle-lancer'), icoLancer: $('#ico-lancer'),
    pas: $('#btn-pas'), nouveau: $('#btn-nouveau'), reset: $('#btn-reset'),
    bilan: $('#bilan-corps'), verdictNote: $('#verdict-note'),
    colA: $('#col-a'), colB: $('#col-b'),
    annee: $('#annee')
  };

  /* Les nœuds du DOM, séparés de l’état de simulation. */
  const refs = {
    a: {
      nom: $('#nom-a'), badge: $('#badge-a'), boite: $('#barres-a'), etage: $('#etage-a'),
      elCmp: $('#cmp-a'), elEcr: $('#ecr-a'), elOps: $('#etape-a')
    },
    b: {
      nom: $('#nom-b'), badge: $('#badge-b'), boite: $('#barres-b'), etage: $('#etage-b'),
      elCmp: $('#cmp-b'), elEcr: $('#ecr-b'), elOps: $('#etape-b')
    }
  };

  /* ======================================================================
     6. État du duel
     ====================================================================== */
  let valeurs = [];   // table de référence
  let maxValeur = 100;
  let duel = null;    // { a, b, lance }
  let minuteur = null;

  function nouveauCandidat(cle, code) {
    const t = valeurs.slice();
    return {
      cle: cle,
      code: code,
      nom: ALGOS[code].nom,
      r: refs[cle],
      t: t,
      gen: ALGOS[code].fabrique(t),
      cmp: 0, ecr: 0, ops: 0,
      fini: false,
      dernier: null,
      barres: []
    };
  }

  function construireBarres(cand) {
    const box = cand.r.boite;
    cand.barres.length = 0;
    box.textContent = '';
    const frag = document.createDocumentFragment();
    for (let i = 0; i < valeurs.length; i++) {
      const b = document.createElement('span');
      b.className = 'barre';
      b.style.height = ((valeurs[i] / maxValeur) * 100) + '%';
      frag.appendChild(b);
      cand.barres.push(b);
    }
    box.appendChild(frag);

    cand.r.etage.textContent = 'Prêt à partir.';
    cand.r.elCmp.textContent = '0';
    cand.r.elEcr.textContent = '0';
    cand.r.elOps.textContent = '0';
    cand.r.badge.textContent = 'En attente';
    cand.r.badge.setAttribute('data-etat', 'attente');
  }

  function rendre(cand) {
    const e = cand.dernier;
    if (!e) return;
    const t = cand.t, n = t.length;
    for (let i = 0; i < n; i++) {
      const b = cand.barres[i];
      if (!b) continue;
      b.style.height = ((t[i] / maxValeur) * 100) + '%';
      let classe = 'barre';
      if (e.e.indexOf(i) !== -1) classe = 'barre barre--ecrit';
      else if (e.c.indexOf(i) !== -1) classe = 'barre barre--compare';
      else if (e.p.indexOf(i) !== -1) classe = 'barre barre--place';
      b.className = classe;
    }
    cand.r.etage.textContent = e.m;
  }

  function majCompteurs(cand) {
    cand.r.elCmp.textContent = String(cand.cmp);
    cand.r.elEcr.textContent = String(cand.ecr);
    cand.r.elOps.textContent = String(cand.ops);
  }

  function marquerTermine(cand) {
    cand.fini = true;
    cand.r.badge.textContent = 'Terminé';
    cand.r.badge.setAttribute('data-etat', 'termine');
  }

  /* Avance un candidat d’une seule opération.
     Renvoie false s’il ne pouvait pas avancer (déjà terminé). */
  function avancer(cand) {
    if (cand.fini) return false;
    const r = cand.gen.next();
    if (r.done) { marquerTermine(cand); return false; }

    const e = r.value;
    cand.dernier = e;
    if (e.k === 'cmp') cand.cmp++;
    else if (e.k === 'ecr') cand.ecr++;
    cand.ops++;

    rendre(cand);
    majCompteurs(cand);
    return true;
  }

  /* ======================================================================
     7. Bilan
     ====================================================================== */
  function lettre(cand) { return cand.cle === 'a' ? 'A' : 'B'; }

  function remplirLigne(index, ga, gb) {
    const ligne = ui.bilan.rows[index];
    if (!ligne) return;
    ligne.cells[1].textContent = String(ga);
    ligne.cells[2].textContent = String(gb);
    const av = ligne.cells[3];
    if (ga === gb) { av.textContent = 'Égalité'; av.className = 'n'; return; }
    /* Colonnes déjà intitulées « A · … » et « B · … » : la lettre suffit,
       et ça tient sur un petit écran. */
    av.textContent = lettre(ga < gb ? duel.a : duel.b);
    av.className = 'n avantage';
  }

  function majBilan() {
    if (!duel) return;
    const A = duel.a, B = duel.b;
    ui.colA.textContent = 'A · ' + A.nom;
    ui.colB.textContent = 'B · ' + B.nom;

    remplirLigne(0, A.cmp, B.cmp);
    remplirLigne(1, A.ecr, B.ecr);
    remplirLigne(2, A.ops, B.ops);

    // Qui est arrivé, et après combien d’opérations.
    const ligne = ui.bilan.rows[3];
    if (ligne) {
      ligne.cells[1].textContent = A.fini ? 'Oui' : 'Non';
      ligne.cells[2].textContent = B.fini ? 'Oui' : 'Non';
      const av = ligne.cells[3];
      if (A.fini && B.fini) {
        if (A.ops === B.ops) { av.textContent = 'Égalité'; av.className = 'n'; }
        else { av.textContent = lettre(A.ops < B.ops ? A : B); av.className = 'n avantage'; }
      } else if (A.fini) { av.textContent = 'A'; av.className = 'n avantage'; }
      else if (B.fini) { av.textContent = 'B'; av.className = 'n avantage'; }
      else { av.textContent = '–'; av.className = 'n'; }
    }

    if (A.fini && B.fini) {
      ui.verdictNote.textContent = 'Les deux ont terminé : ' + A.nom + ' en ' + A.ops +
        ' opérations, ' + B.nom + ' en ' + B.ops + '.';
    } else if (A.fini) {
      ui.verdictNote.textContent = A.nom + ' a terminé ; ' + B.nom + ' continue.';
    } else if (B.fini) {
      ui.verdictNote.textContent = B.nom + ' a terminé ; ' + A.nom + ' continue.';
    } else if (duel.lance) {
      ui.verdictNote.textContent = 'Duel en cours…';
    } else {
      ui.verdictNote.textContent = 'Le duel n’a pas encore commencé.';
    }
  }

  function annoncer(texte) {
    if (ui.statut) ui.statut.textContent = texte;
  }

  /* ======================================================================
     8. Déroulé
     ====================================================================== */
  function delaiCourant() {
    const v = Number(ui.vitesse.value) || 6;
    return Math.max(16, Math.round(600 * Math.pow(0.72, v - 1)));
  }

  function majBoutons() {
    const enCours = !!(duel && duel.lance);
    // Une fois les deux arrivés, plus rien n’est à exécuter : on désactive
    // plutôt que de laisser un bouton qui ne ferait rien.
    const termine = !!(duel && duel.a.fini && duel.b.fini);
    ui.libelleLancer.textContent = enCours ? 'Mettre en pause' : 'Lancer le duel';
    ui.icoLancer.setAttribute('href', enCours ? '#i-pause' : '#i-play');
    ui.pas.disabled = enCours || termine;
    ui.lancer.disabled = termine;
  }

  function tourSuivant() {
    if (!duel) return;
    avancer(duel.a);
    avancer(duel.b);
    majBilan();

    if (duel.a.fini && duel.b.fini) {
      stopper();
      majBoutons();
      annoncer('Duel terminé. ' + duel.a.nom + ' : ' + duel.a.cmp + ' comparaisons et ' +
                duel.a.ecr + ' écritures. ' + duel.b.nom + ' : ' + duel.b.cmp +
                ' comparaisons et ' + duel.b.ecr + ' écritures.');
      return;
    }
    minuteur = window.setTimeout(tourSuivant, delaiCourant());
  }

  function lancer() {
    if (!duel) return;
    if (duel.lance) { stopper(); majBoutons(); annoncer('Duel en pause.'); return; }
    if (duel.a.fini && duel.b.fini) { annoncer('Le duel est déjà terminé.'); return; }

    duel.lance = true;
    [[duel.a, 'En course'], [duel.b, 'En course']].forEach(function (p) {
      if (p[0].r.badge.getAttribute('data-etat') === 'attente') {
        p[0].r.badge.textContent = p[1];
        p[0].r.badge.setAttribute('data-etat', 'course');
      }
    });

    annoncer('Duel lancé : ' + duel.a.nom + ' contre ' + duel.b.nom + '.');
    majBoutons();
    minuteur = window.setTimeout(tourSuivant, delaiCourant());
  }

  function stopper() {
    if (minuteur !== null) { window.clearTimeout(minuteur); minuteur = null; }
    if (duel) duel.lance = false;
  }

  function pasASpas() {
    if (!duel) return;
    stopper();
    tourSuivant();
    stopper();
    majBoutons();
  }

  /* recharger = vrai : nouvelle table. faux : on garde la table courante,
     ce qui permet d’opposer deux algorithmes aux données exactement identiques. */
  function reinitialiser(recharger) {
    stopper();
    const n = Number(ui.taille.value) || 32;
    const forme = ui.forme.value;

    if (recharger || valeurs.length !== n) valeurs = genererValeurs(n, forme);
    maxValeur = valeurs.reduce(function (m, v) { return v > m ? v : m; }, 1);

    duel = {
      a: nouveauCandidat('a', ui.algoA.value),
      b: nouveauCandidat('b', ui.algoB.value),
      lance: false
    };

    construireBarres(duel.a);
    construireBarres(duel.b);

    // Les titres des deux panneaux doivent suivre le candidat choisi,
    // au même titre que le bilan et la note de duel.
    duel.a.r.nom.textContent = duel.a.nom;
    duel.b.r.nom.textContent = duel.b.nom;

    ui.reglagesNote.textContent = n + ' valeurs · ' + (FORMES[forme] || forme).toLowerCase();
    ui.duelNote.textContent = duel.a.nom + ' contre ' + duel.b.nom;

    majBilan();
    majBoutons();
  }

  /* ======================================================================
     9. Commandes
     ====================================================================== */
  function initialiser() {
    if (ui.annee) ui.annee.textContent = String(new Date().getFullYear());

    const r = chargerReglages();
    ui.algoA.value = r.algoA;
    ui.algoB.value = r.algoB;
    ui.forme.value = r.forme;
    ui.taille.value = String(r.taille);
    ui.vitesse.value = String(r.vitesse);
    ui.tailleValeur.textContent = ui.taille.value;
    ui.vitesseValeur.textContent = ui.vitesse.value;

    appliquerTheme(themeInitial());

    if (ui.theme) {
      ui.theme.addEventListener('click', function () {
        appliquerTheme(!document.body.classList.contains('sombre'));
      });
    }

    // Changer un candidat conserve la table : même données, nouveau match.
    [ui.algoA, ui.algoB].forEach(function (el) {
      el.addEventListener('change', function () {
        memoriserReglages();
        reinitialiser(false);
        annoncer('Nouveau match : ' + duel.a.nom + ' contre ' + duel.b.nom + '.');
      });
    });

    // Changer la forme ou la taille impose de régénérer les données.
    ui.forme.addEventListener('change', function () {
      memoriserReglages();
      reinitialiser(true);
      annoncer('Nouvelles données : ' + (FORMES[ui.forme.value] || '').toLowerCase() + '.');
    });

    ui.taille.addEventListener('input', function () {
      ui.tailleValeur.textContent = ui.taille.value;
    });
    ui.taille.addEventListener('change', function () {
      memoriserReglages();
      reinitialiser(true);
    });

    ui.vitesse.addEventListener('input', function () {
      ui.vitesseValeur.textContent = ui.vitesse.value;
      memoriserReglages();
    });

    ui.lancer.addEventListener('click', lancer);
    ui.pas.addEventListener('click', pasASpas);
    ui.nouveau.addEventListener('click', function () {
      reinitialiser(true);
      annoncer('Nouveau tableau : ' + duel.a.nom + ' contre ' + duel.b.nom + '.');
    });
    ui.reset.addEventListener('click', function () {
      reinitialiser(false);
      annoncer('Duel réinitialisé sur le même tableau.');
    });

    reinitialiser(true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialiser);
  } else {
    initialiser();
  }
})();
