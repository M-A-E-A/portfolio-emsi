/* =====================================================================
   Application — dessin, outils, synchronisation, présence.
   ---------------------------------------------------------------------
   La synchronisation passe par un BroadcastChannel : chaque onglet diffuse
   ses opérations. Un pair qui arrive demande l'état complet et fusionne.
   En mode full-stack (serveur Node + SQLite), le tableau est persisté et
   les opérations sont relayées en plus par Server-Sent Events (/api/flux).

   Le rendu est volontairement simple : on redessine tout le tableau à
   chaque changement. À cette échelle (quelques centaines d'éléments),
   c'est largement suffisant et beaucoup plus simple qu'un rendu
   incrémental — donc beaucoup moins de bogues.
   ===================================================================== */
(function (global) {
  'use strict';

  const CRDT = global.CRDT;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const CLE_THEME = 'whiteboard-theme';
  const CLE_AUTEUR = 'whiteboard-auteur';

  const OUTILS = [
    { id: 'crayon', libelle: 'Crayon', icone: '✎' },
    { id: 'ligne', libelle: 'Ligne', icone: '╱' },
    { id: 'rectangle', libelle: 'Rectangle', icone: '▭' },
    { id: 'ellipse', libelle: 'Ellipse', icone: '◯' },
    { id: 'texte', libelle: 'Texte', icone: 'T' },
    { id: 'gomme', libelle: 'Gomme', icone: '⌫' },
  ];

  const NOMS = ['Camille', 'Yasmine', 'Adam', 'Salma', 'Mehdi', 'Nour', 'Rachid', 'Lina'];

  const etat = {
    auteur: '',
    tableau: null,
    canal: null,
    outil: 'crayon',
    couleur: '#1b4de4',
    epaisseur: 3,
    dessin: null,        // trait en cours
    texte: null,         // texte en cours de saisie
    operations: [],      // journal des opérations (pour le test de convergence)
    curseurs: new Map(), // id → {x, y, nom}
    presence: new Map(),
    moteurDistant: false // true si un serveur Node + SQLite répond à la sonde
  };

  /* ---------------------------------------------------------------- */
  /* Identité                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Identité de la session. Volontairement dans sessionStorage et non
   * localStorage : deux onglets du même navigateur sont deux pairs
   * distincts, et doivent donc avoir deux identités distincts — sinon
   * ils ignoreraient les messages l'un de l'autre.
   */
  function auteurAleatoire() {
    try {
      const memorise = sessionStorage.getItem(CLE_AUTEUR);
      if (memorise) return memorise;
    } catch (e) { /* file:// */ }
    const nom = NOMS[Math.floor(Math.random() * NOMS.length)];
    const id = nom + '-' + Math.random().toString(36).slice(2, 6);
    try { sessionStorage.setItem(CLE_AUTEUR, id); } catch (e) { /* file:// */ }
    return id;
  }

  /* ---------------------------------------------------------------- */
  /* Synchronisation                                                    */
  /* ---------------------------------------------------------------- */

  function diffuser(paquet) {
    if (etat.canal) etat.canal.postMessage(paquet);
  }

  function brancherSync() {
    if (typeof BroadcastChannel === 'undefined') {
      journaliser('BroadcastChannel indisponible : le mode local reste utilisable.', 'erreur');
      return;
    }
    etat.canal = new BroadcastChannel('whiteboard-lume');

    etat.canal.onmessage = (e) => {
      const paquet = e.data;
      if (!paquet || paquet.auteur === etat.auteur) return;

      if (paquet.type === 'operation') {
        etat.tableau.fusionner(paquet);
        // Les opérations reçues alimentent aussi le journal utilisé par
        // le test de convergence.
        etat.operations.push(paquet.element);
        redessiner();
        journaliser('Opération reçue de ' + nomLisible(paquet.auteur) + '.', 'info');
      } else if (paquet.type === 'etat') {
        for (const element of paquet.elements) etat.tableau.fusionner({ element });
        redessiner();
        journaliser('État complet reçu (' + paquet.elements.length + ' élément(s)).', 'info');
      } else if (paquet.type === 'presence') {
        const connu = etat.presence.has(paquet.auteur);
        etat.presence.set(paquet.auteur, { nom: paquet.nom, vu: Date.now() });
        majPresence();
        // Si c'est un pair qu'on ne connaissait pas, on se présente à
        // son tour : l'annonce n'a pu être entendue que par ceux qui
        // étaient déjà là.
        if (!connu) {
          diffuser({ type: 'presence', auteur: etat.auteur, nom: nomCourt() });
        }
      } else if (paquet.type === 'curseur') {
        etat.curseurs.set(paquet.auteur, { x: paquet.x, y: paquet.y, nom: paquet.nom });
      } else if (paquet.type === 'depart') {
        etat.presence.delete(paquet.auteur);
        etat.curseurs.delete(paquet.auteur);
        majPresence();
      }
    };

    window.addEventListener('beforeunload', () => {
      diffuser({ type: 'depart', auteur: etat.auteur });
    });
  }

  function nomLisible(auteur) {
    const info = etat.presence.get(auteur);
    return info ? info.nom : auteur;
  }

  /* ---------------------------------------------------------------- */
  /* Mode full-stack (serveur Node + SQLite + SSE)                      */
  /* ---------------------------------------------------------------- */

  /**
   * Quand un serveur Node répond à la sonde (en-tête X-Serveur), le
   * tableau est persisté dans une vraie base SQLite :
   *  • à l'arrivée, GET /api/etat hydrate le CRDT (fusion, jamais réécriture) ;
   *  • chaque opération publiée est aussi PUT côté serveur (upsert) ;
   *  • le flux SSE /api/flux retransmet chaque opération aux autres
   *    clients — qui l'appliquent par le chemin CRDT existant.
   * Le BroadcastChannel reste actif : les onglets d'un même navigateur
   * se synchronisent comme avant, en plus du serveur. Sans serveur
   * (file:// ou hébergement statique), rien ne change.
   */
  async function brancherServeur() {
    etat.moteurDistant = true;

    // Hydratation : on fusionne l'état complet au lieu de repartir de zéro.
    const etatInitial = await window.LumeAPI.appeler('GET', 'api/etat');
    if (etatInitial.statut === 200 && etatInitial.corps && Array.isArray(etatInitial.corps.donnees)) {
      for (const element of etatInitial.corps.donnees) {
        etat.tableau.fusionner({ element });
        etat.operations.push(element);
      }
      redessiner();
      journaliser('Tableau chargé depuis le serveur (' + etatInitial.corps.donnees.length + ' élément(s)).', 'succes');
    }

    // Flux temps réel.
    if (typeof EventSource !== 'function') return;
    const flux = new EventSource('api/flux');

    flux.addEventListener('operation', (e) => {
      let paquet = null;
      try { paquet = JSON.parse(e.data); } catch (err) { return; }
      if (!paquet || !paquet.element) return;
      if (paquet.auteur === etat.auteur) return; // nos opérations nous reviennent en écho : la fusion est déjà faite
      etat.tableau.fusionner(paquet);
      etat.operations.push(paquet.element);
      redessiner();
      journaliser('Opération reçue de ' + nomLisible(paquet.auteur) + ' (serveur).', 'info');
    });

    // « état » : rechargement complet (réinitialisation du tableau partagé).
    flux.addEventListener('etat', () => { rechargerEtat(); });
  }

  /** Recharge l'état complet depuis le serveur et le fusionne. */
  async function rechargerEtat() {
    try {
      const reponse = await window.LumeAPI.appeler('GET', 'api/etat');
      if (reponse.statut !== 200 || !reponse.corps || !Array.isArray(reponse.corps.donnees)) return;
      for (const element of reponse.corps.donnees) etat.tableau.fusionner({ element });
      redessiner();
      journaliser('État complet reçu du serveur (' + reponse.corps.donnees.length + ' élément(s)).', 'info');
    } catch (e) { /* ignoré */ }
  }

  /* ---------------------------------------------------------------- */
  /* Rendu                                                             */
  /* ---------------------------------------------------------------- */

  function redessiner() {
    const canvas = $('#plan');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const largeur = canvas.width;
    const hauteur = canvas.height;

    ctx.clearRect(0, 0, largeur, hauteur);
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--surface').trim() || '#fff';
    ctx.fillRect(0, 0, largeur, hauteur);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const element of etat.tableau.visibles()) {
      const p = element.props;
      ctx.strokeStyle = p.couleur;
      ctx.fillStyle = p.couleur;
      ctx.lineWidth = p.epaisseur;

      if (element.type === 'trait') {
        ctx.beginPath();
        ctx.moveTo(p.points[0], p.points[1]);
        for (let i = 2; i < p.points.length; i += 2) ctx.lineTo(p.points[i], p.points[i + 1]);
        ctx.stroke();
      } else if (element.type === 'ligne') {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x2, p.y2);
        ctx.stroke();
      } else if (element.type === 'rectangle') {
        ctx.strokeRect(p.x, p.y, p.x2 - p.x, p.y2 - p.y);
      } else if (element.type === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(
          (p.x + p.x2) / 2, (p.y + p.y2) / 2,
          Math.abs(p.x2 - p.x) / 2, Math.abs(p.y2 - p.y) / 2,
          0, 0, Math.PI * 2
        );
        ctx.stroke();
      } else if (element.type === 'texte') {
        ctx.font = (p.taille || 18) + 'px "Space Grotesk", system-ui, sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText(p.texte || '', p.x, p.y);
      }
    }

    // Trait en cours (pas encore envoyé)
    if (etat.dessin) {
      const p = etat.dessin.props;
      ctx.strokeStyle = p.couleur;
      ctx.lineWidth = p.epaisseur;
      ctx.globalAlpha = 0.7;
      if (etat.dessin.type === 'trait') {
        ctx.beginPath();
        ctx.moveTo(p.points[0], p.points[1]);
        for (let i = 2; i < p.points.length; i += 2) ctx.lineTo(p.points[i], p.points[i + 1]);
        ctx.stroke();
      } else if (etat.dessin.type === 'ligne') {
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x2, p.y2); ctx.stroke();
      } else if (etat.dessin.type === 'rectangle') {
        ctx.strokeRect(p.x, p.y, p.x2 - p.x, p.y2 - p.y);
      } else if (etat.dessin.type === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse((p.x + p.x2) / 2, (p.y + p.y2) / 2, Math.abs(p.x2 - p.x) / 2, Math.abs(p.y2 - p.y) / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Curseurs distants
    for (const curseur of etat.curseurs.values()) {
      ctx.fillStyle = '#d2453f';
      ctx.beginPath();
      ctx.arc(curseur.x, curseur.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '12px "Inter", system-ui, sans-serif';
      ctx.fillStyle = '#d2453f';
      ctx.fillText(curseur.nom, curseur.x + 10, curseur.y + 4);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Outils                                                            */
  /* ---------------------------------------------------------------- */

  function coordonnees(evenement) {
    const canvas = $('#plan');
    const rect = canvas.getBoundingClientRect();
    return {
      x: (evenement.clientX - rect.left) * (canvas.width / rect.width),
      y: (evenement.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function commencerDessin(evenement) {
    if (evenement.button !== 0) return;
    const point = coordonnees(evenement);
    const commun = { couleur: etat.couleur, epaisseur: etat.epaisseur };

    if (etat.outil === 'gomme') {
      gommer(point);
      return;
    }

    if (etat.outil === 'texte') {
      const texte = window.prompt('Texte à insérer :');
      if (!texte) return;
      const element = etat.tableau.creer('texte', Object.assign({ x: point.x, y: point.y, texte, taille: 18 }, commun));
      etat.tableau.pileAnnulation.push(element.id);
      publier(element);
      redessiner();
      return;
    }

    if (etat.outil === 'crayon') {
      etat.dessin = { type: 'trait', props: Object.assign({ points: [point.x, point.y] }, commun) };
    } else {
      etat.dessin = {
        type: etat.outil,
        props: Object.assign({ x: point.x, y: point.y, x2: point.x, y2: point.y }, commun)
      };
    }
    redessiner();
  }

  function continuerDessin(evenement) {
    const point = coordonnees(evenement);
    if (!etat.dessin) return;
    if (etat.dessin.type === 'trait') {
      const points = etat.dessin.props.points;
      const dernierX = points[points.length - 2];
      const dernierY = points[points.length - 1];
      // On ne garde qu'un point sur deux : le trait reste net sans
      // sature le tableau d'opérations.
      if (Math.hypot(point.x - dernierX, point.y - dernierY) > 2) {
        points.push(point.x, point.y);
      }
    } else {
      etat.dessin.props.x2 = point.x;
      etat.dessin.props.y2 = point.y;
    }
    redessiner();
  }

  function finirDessin() {
    if (!etat.dessin) return;
    const element = etat.tableau.creer(etat.dessin.type, etat.dessin.props);
    etat.tableau.pileAnnulation.push(element.id);
    etat.dessin = null;
    publier(element);
    redessiner();
  }

  /** La gomme supprime l'élément dont la forme est la plus proche. */
  function gommer(point) {
    let meilleur = null;
    let meilleureDistance = 24;
    for (const element of etat.tableau.visibles()) {
      const distance = distanceAuPoint(element, point);
      if (distance < meilleureDistance) {
        meilleureDistance = distance;
        meilleur = element;
      }
    }
    if (meilleur) {
      meilleur.annuler();
      publier(meilleur);
      redessiner();
      journaliser('Élément effacé.', 'info');
    }
  }

  function distanceAuPoint(element, point) {
    const p = element.props;
    if (element.type === 'trait') {
      let min = Infinity;
      for (let i = 0; i + 3 < p.points.length; i += 2) {
        min = Math.min(min, distanceSegment(point, p.points[i], p.points[i + 1], p.points[i + 2], p.points[i + 3]));
      }
      return min;
    }
    if (element.type === 'texte') {
      return Math.hypot(point.x - p.x, point.y - p.y);
    }
    const x = Math.min(p.x, p.x2);
    const y = Math.min(p.y, p.y2);
    const largeur = Math.abs(p.x2 - p.x);
    const hauteur = Math.abs(p.y2 - p.y);
    const dx = Math.max(x - point.x, 0, point.x - (x + largeur));
    const dy = Math.max(y - point.y, 0, point.y - (y + hauteur));
    return Math.hypot(dx, dy);
  }

  function distanceSegment(point, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const longueur2 = dx * dx + dy * dy;
    if (longueur2 === 0) return Math.hypot(point.x - x1, point.y - y1);
    let t = ((point.x - x1) * dx + (point.y - y1) * dy) / longueur2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(point.x - (x1 + t * dx), point.y - (y1 + t * dy));
  }

  /** Diffuse une opération vers les autres pairs. */
  function publier(element) {
    const serialise = element.serialiser();
    etat.operations.push(serialise);
    diffuser({ type: 'operation', auteur: etat.auteur, element: serialise });

    /* Mode full-stack : l'opération est aussi persistée côté serveur
       (upsert CRDT), qui la retransmet à tous les autres clients en SSE. */
    if (etat.moteurDistant) {
      window.LumeAPI.appeler('PUT', 'api/elements/' + encodeURIComponent(element.id), serialise)
        .catch(() => { /* la UI reste correcte même si le PUT échoue */ });
    }
  }

  /**
   * Test de convergence : on rejoue le journal d'opérations dans deux
   * ordres différents (chronologique puis inversé) sur deux tableaux
   * neuf. Si les deux résultats sont identiques, la propriété
   * commutative est vérifiée sur pièces.
   */
  function testerConvergence() {
    const operations = etat.operations.slice();
    if (operations.length < 2) {
      journaliser('Dessinez d’abord quelques éléments pour lancer le test.', 'info');
      return;
    }

    const appliquer = (ordre) => {
      const tableau = new CRDT.Tableau('test');
      for (const operation of ordre) tableau.fusionner({ element: operation });
      return tableau.visibles()
        .map((e) => e.id + '|' + e.type + '|' + JSON.stringify(e.props))
        .join('§');
    };

    const direct = appliquer(operations);
    const inverse = appliquer(operations.slice().reverse());
    const melange = appliquer(operations.slice().sort((a, b) => (a.id < b.id ? 1 : -1)));

    const convergent = direct === inverse && direct === melange;
    journaliser(
      'Convergence vérifiée sur ' + operations.length + ' opérations : '
      + (convergent ? 'identique dans les trois ordres ✓' : 'DIVERGENCE ✗'),
      convergent ? 'succes' : 'erreur'
    );
  }

  /* ---------------------------------------------------------------- */
  /* Annulation                                                         */
  /* ---------------------------------------------------------------- */

  function annuler() {
    const element = etat.tableau.annulerDernier();
    if (!element) {
      journaliser('Rien à annuler.', 'info');
      return;
    }
    publier(element);
    redessiner();
    journaliser('Annulation — l’élément est masqué par un jeton de suppression.', 'info');
  }

  function retablir() {
    const element = etat.tableau.retablirDernier();
    if (!element) {
      journaliser('Rien à rétablir.', 'info');
      return;
    }
    publier(element);
    redessiner();
    journaliser('Rétablissement.', 'info');
  }

  /* ---------------------------------------------------------------- */
  /* Présence                                                          */
  /* ---------------------------------------------------------------- */

  function majPresence() {
    // Un pair qui disparaît sans prévenir (onglet fermé brutalement) est
    // retiré après quelques secondes sans nouvelle annonce.
    const limite = Date.now() - 12000;
    for (const [id, info] of etat.presence) {
      if (info.vu < limite) {
        etat.presence.delete(id);
        etat.curseurs.delete(id);
      }
    }

    const zone = $('#presence');
    const liste = [...etat.presence.entries()];
    if (!liste.length) {
      zone.innerHTML = '<span class="presence-vide">Vous êtes seul pour l’instant. '
        + 'Ouvrez un second onglet pour voir la synchronisation.</span>';
      return;
    }
    zone.innerHTML = liste
      .map(([id, info]) => '<span class="presence-badge">' + info.nom + '</span>')
      .join('');
  }

  /* ---------------------------------------------------------------- */
  /* Journal                                                           */
  /* ---------------------------------------------------------------- */

  function journaliser(texte, type) {
    const zone = $('#journal');
    const ligne = document.createElement('p');
    ligne.className = 'journal-ligne' + (type ? ' ' + type : '');
    ligne.textContent = texte;
    zone.appendChild(ligne);
    zone.scrollTop = zone.scrollHeight;
  }

  /* ---------------------------------------------------------------- */
  /* Interface                                                         */
  /* ---------------------------------------------------------------- */

  function brancherUI() {
    // Outils
    const zoneOutils = $('#outils');
    zoneOutils.innerHTML = OUTILS.map((outil) =>
      '<button type="button" class="outil" data-outil="' + outil.id + '" aria-pressed="' + (outil.id === etat.outil) + '">'
      + '<span class="outil-icone" aria-hidden="true">' + outil.icone + '</span>'
      + '<span class="outil-libelle">' + outil.libelle + '</span></button>'
    ).join('');

    zoneOutils.addEventListener('click', (e) => {
      const bouton = e.target.closest('[data-outil]');
      if (!bouton) return;
      etat.outil = bouton.dataset.outil;
      $$('[data-outil]').forEach((b) => b.setAttribute('aria-pressed', String(b === bouton)));
    });

    // Couleur
    const zoneCouleur = $('#couleurs');
    const couleurs = ['#1b4de4', '#d2453f', '#0f766e', '#b45309', '#7c3aed', '#12161c', '#ffffff'];
    zoneCouleur.innerHTML = couleurs
      .map((c) => '<button type="button" class="pastille-couleur" data-couleur="' + c
        + '" style="background:' + c + '" aria-label="Couleur ' + c + '" aria-pressed="'
        + (c === etat.couleur) + '"></button>')
      .join('');
    zoneCouleur.addEventListener('click', (e) => {
      const bouton = e.target.closest('[data-couleur]');
      if (!bouton) return;
      etat.couleur = bouton.dataset.couleur;
      $$('[data-couleur]').forEach((b) => b.setAttribute('aria-pressed', String(b === bouton)));
    });

    // Épaisseur
    $('#reglage-epaisseur').addEventListener('input', (e) => {
      etat.epaisseur = parseInt(e.target.value, 10);
      $('#valeur-epaisseur').textContent = etat.epaisseur + ' px';
    });

    // Actions
    $('#bouton-annuler').addEventListener('click', annuler);
    $('#bouton-retablir').addEventListener('click', retablir);
    $('#bouton-convergence').addEventListener('click', testerConvergence);
    $('#bouton-effacer').addEventListener('click', () => {
      etat.tableau = new CRDT.Tableau(etat.auteur);
      redessiner();
      journaliser('Tableau effacé localement.', 'info');
    });

    // Canvas
    const canvas = $('#plan');
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      commencerDessin(e);
    });
    canvas.addEventListener('pointermove', (e) => {
      const point = coordonnees(e);
      diffuser({ type: 'curseur', auteur: etat.auteur, nom: nomCourt(), x: point.x, y: point.y });
      if (etat.dessin) continuerDessin(e);
    });
    canvas.addEventListener('pointerup', finirDessin);
    canvas.addEventListener('pointercancel', finirDessin);
    canvas.addEventListener('pointerleave', () => {
      diffuser({ type: 'curseur', auteur: etat.auteur, nom: nomCourt(), x: -100, y: -100 });
    });

    window.addEventListener('resize', redessiner);
  }

  function nomCourt() {
    return etat.auteur.split('-')[0];
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
      btn.addEventListener('click', () => {
        appliquerTheme(!document.body.classList.contains('sombre'));
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Démarrage                                                         */
  /* ---------------------------------------------------------------- */

  async function demarrer() {
    etat.auteur = auteurAleatoire();
    etat.tableau = new CRDT.Tableau(etat.auteur);
    global.WB = etat; // utile pour l'inspection depuis la console
    brancherUI();
    initialiserTheme();
    brancherSync();

    $('#moi').textContent = 'Vous êtes « ' + nomCourt() + ' »';
    majPresence();
    redessiner();

    // Détection du moteur : un serveur Node (node:http + node:sqlite)
    // répond-il ? Sinon, on reste en BroadcastChannel seul.
    try { await window.LumeAPI.detecter(); } catch (e) { /* mode local */ }
    if (window.LumeAPI.actif) {
      try { await brancherServeur(); }
      catch (e) { journaliser('Serveur injoignable : fonctionnement local.', 'erreur'); etat.moteurDistant = false; }
    }

    diffuser({ type: 'presence', auteur: etat.auteur, nom: nomCourt() });
    diffuser({ type: 'etat', auteur: etat.auteur, elements: etat.tableau.serialiser() });
    journaliser('Session ouverte en tant que ' + nomCourt() + '.', 'succes');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer);
  } else {
    demarrer();
  }
})(window);
