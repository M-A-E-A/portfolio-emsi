/* =====================================================================
   Application — entraînement, courbe de perte, prédictions, poids.
   ===================================================================== */
(function (global) {
  'use strict';

  const NN = global.NN;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const CLE_THEME = 'nn-theme';

  const etat = {
    reseau: null,
    entrainement: null,
    test: null,
    historique: [],
    enCours: false,
    courbe: [],
    pas: 0,
    taux: 0.02,
    tailleLot: 16,
  };

  /* ---------------------------------------------------------------- */
  /* Courbe de perte                                                    */
  /* ---------------------------------------------------------------- */

  function dessinerCourbe() {
    const canvas = $('#courbe');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const largeur = canvas.width;
    const hauteur = canvas.height;
    const style = getComputedStyle(document.body);

    ctx.clearRect(0, 0, largeur, hauteur);
    ctx.fillStyle = style.getPropertyValue('--surface').trim() || '#fff';
    ctx.fillRect(0, 0, largeur, hauteur);

    const points = etat.courbe;
    if (points.length < 2) {
      ctx.fillStyle = style.getPropertyValue('--sourdine').trim() || '#888';
      ctx.font = '13px "Inter", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Lancez l’entraînement pour voir la courbe', largeur / 2, hauteur / 2);
      return;
    }

    // Graduations
    ctx.strokeStyle = style.getPropertyValue('--trait').trim() || '#ddd';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = 20 + (i / 4) * (hauteur - 44);
      ctx.beginPath();
      ctx.moveTo(44, y);
      ctx.lineTo(largeur - 14, y);
      ctx.stroke();
    }

    const max = Math.max(...points.map((p) => p.entropie), 0.5);
    const min = 0;
    const x = (i) => 44 + (i / (points.length - 1)) * (largeur - 60);
    const y = (v) => 20 + (1 - (v - min) / (max - min)) * (hauteur - 44);

    // Courbe d'entropie
    ctx.strokeStyle = style.getPropertyValue('--accent').trim() || '#1b4de4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      const px = x(i);
      const py = y(p.entropie);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Exactitude : échelle propre (0 % en bas, 100 % en haut)
    ctx.strokeStyle = '#2fa36b';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    points.forEach((p, i) => {
      const px = x(i);
      const py = 20 + (1 - p.exactitude) * (hauteur - 44);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Légende
    ctx.fillStyle = style.getPropertyValue('--sourdine').trim() || '#888';
    ctx.font = '11px "Inter", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('entropie', 8, 14);
    ctx.fillStyle = '#2fa36b';
    ctx.fillText('exactitude', 78, 14);
  }

  /* ---------------------------------------------------------------- */
  /* Grille de prédictions                                             */
  /* ---------------------------------------------------------------- */

  function dessinerPredictions() {
    const hote = $('#predictions');
    if (!etat.test) {
      hote.innerHTML = '<p class="vide">Lancez l’entraînement pour voir les prédictions.</p>';
      return;
    }

    const cases = [];
    const taille = 10;
    for (let i = 0; i < taille; i++) {
      const echantillon = etat.test[i];
      if (!echantillon) break;
      const sortie = etat.reseau.forward(echantillon.x);
      const pretit = NN.argmax(sortie);
      const confiance = sortie[pretit];
      const juste = pretit === echantillon.y;
      // Image du chiffre en petits pixels
      const pixels = [];
      for (let p = 0; p < echantillon.x.length; p++) {
        pixels.push('<i style="opacity:' + echantillon.x[p].toFixed(2) + '"></i>');
      }

      cases.push(
        '<figure class="cas' + (juste ? ' cas--juste' : ' cas--faux') + '">' +
        '<div class="cas-image">' + pixels.join('') + '</div>' +
        '<figcaption>' +
        '<span class="cas-attendu">' + echantillon.y + '</span>' +
        '<span class="cas-predit">' + pretit + '</span>' +
        '<span class="cas-confiance">' + Math.round(confiance * 100) + ' %</span>' +
        '</figcaption></figure>'
      );
    }
    hote.innerHTML = cases.join('');
  }

  /* ---------------------------------------------------------------- */
  /* Carte de chaleur des poids                                         */
  /* ---------------------------------------------------------------- */

  function dessinerPoids() {
    const canvas = $('#poids');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const style = getComputedStyle(document.body);
    const cote = NN.TAILLE;
    const taille = canvas.width;

    ctx.clearRect(0, 0, taille, taille);
    ctx.fillStyle = style.getPropertyValue('--surface').trim() || '#fff';
    ctx.fillRect(0, 0, taille, taille);

    if (!etat.reseau) return;
    const couche = etat.reseau.couches[0];
    // On affiche les poids du premier neurone caché, projetés sur l'image.
    const neurone = 0;
    const pas = taille / cote;

    for (let l = 0; l < couche.entrees; l++) {
      const poids = couche.W[l * couche.neurones + neurone];
      // Normalisation : le maximum absolu donne l'échelle
      const intensite = Math.max(-1, Math.min(1, poids / 0.35));
      const x = (l % cote) * pas;
      const y = Math.floor(l / cote) * pas;
      if (intensite >= 0) {
        ctx.fillStyle = 'rgba(27, 77, 228, ' + (intensite * 0.85).toFixed(3) + ')';
      } else {
        ctx.fillStyle = 'rgba(210, 69, 63, ' + (-intensite * 0.85).toFixed(3) + ')';
      }
      ctx.fillRect(x, y, pas + 0.5, pas + 0.5);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Entraînement                                                       */
  /* ---------------------------------------------------------------- */

  function evaluer(reseau, echantillons) {
    let perte = 0;
    let corrects = 0;
    for (const echantillon of echantillons) {
      const sortie = reseau.forward(echantillon.x);
      perte += -Math.log(Math.max(sortie[echantillon.y], 1e-9));
      if (NN.argmax(sortie) === echantillon.y) corrects++;
    }
    return { perte: perte / echantillons.length, exactitude: corrects / echantillons.length };
  }

  function lancer() {
    if (etat.enCours) return;
    etat.enCours = true;
    $('#bouton-lancer').disabled = true;
    $('#statut').textContent = 'Préparation du jeu de données…';

    // L'entraînement est découpé en tranches pour ne pas figer l'interface.
    setTimeout(() => {
      const parChiffre = 60;
      const tout = NN.construire(parChiffre, 2024);
      const coupure = Math.floor(tout.length * 0.75);
      etat.entrainement = tout.slice(0, coupure);
      etat.test = tout.slice(coupure);

      etat.reseau = new NN.Reseau([NN.TAILLE * NN.TAILLE, 32, 32, 10], 1337);
      etat.historique = [];
      etat.courbe = [];
      etat.pas = 0;
      etat.compteur = { n: 0, perte: 0, corrects: 0 };
      etat.epochsFait = 0;
      etat.dansLot = 0;
      etat.tailleLot = 16;
      $('#statut').textContent = 'Entraînement en cours…';
      $('#nb-parametres').textContent = etat.reseau.nbParametres.toLocaleString('fr-FR');
      dessinerCourbe();
      dessinerPredictions();
      dessinerPoids();
      tranche();
    }, 30);
  }

  /** Exécute une portion d'entraînement puis rend la main. */
  function tranche() {
    const debut = performance.now();
    const budget = 24; // ms par tranche

    while (performance.now() - debut < budget) {
      if (etat.pas >= etat.entrainement.length) {
        // Un epoch complet : on évalue et on continue au suivant.
        const mesure = evaluer(etat.reseau, etat.entrainement);
        etat.historique.push(mesure);
        etat.pas = 0;
        etat.epochsFait = (etat.epochsFait || 0) + 1;
        if (etat.epochsFait >= 6) {
          terminer();
          return;
        }
        etat.compteur = { n: 0, perte: 0, corrects: 0 };
      }

      const echantillon = etat.entrainement[etat.pas];
      const sortie = etat.reseau.forward(echantillon.x);
      const grad = new Float32Array(sortie.length);
      for (let k = 0; k < sortie.length; k++) {
        grad[k] = sortie[k] - (k === echantillon.y ? 1 : 0);
      }
      etat.reseau.backward(grad);
      etat.pas++;

      // Le gradient s'accumule sur un lot : la mise à jour des poids n'a
      // lieu qu'une fois tous les 16 exemples. Sans cela, chaque exemple
      // provoque un pas bruité et le réseau oscille.
      etat.dansLot = (etat.dansLot || 0) + 1;
      if (etat.dansLot >= etat.tailleLot) {
        etat.reseau.actualiser(etat.taux, 0.9, 0.999, 1e-8);
        etat.dansLot = 0;
      }

      // Compteurs de la fenêtre courante
      const c = etat.compteur;
      c.n++;
      c.perte += -Math.log(Math.max(sortie[echantillon.y], 1e-9));
      if (NN.argmax(sortie) === echantillon.y) c.corrects++;

      // Un point de courbe tous les 40 exemples
      if (c.n >= 40) {
        etat.courbe.push({
          entropie: c.perte / c.n,
          exactitude: c.corrects / c.n
        });
        etat.compteur = { n: 0, perte: 0, corrects: 0 };
        dessinerCourbe();
      }
    }

    // On rend la main et on reprendra au prochain cadre.
    planifier();
  }

  /**
   * Planifie la suite de l'entraînement. requestAnimationFrame ne sert
   * rien quand l'onglet est masqué : le minuteur prend le relais.
   */
  function planifier() {
    if (document.hidden) {
      setTimeout(tranche, 16);
    } else {
      requestAnimationFrame(tranche);
    }
  }

  function terminer() {
    etat.enCours = false;
    $('#bouton-lancer').disabled = false;
    const test = evaluer(etat.reseau, etat.test);
    const apprentissage = evaluer(etat.reseau, etat.entrainement);
    $('#statut').textContent = 'Entraînement terminé.';
    $('#metrique-perte').textContent = test.perte.toFixed(4);
    $('#metrique-exactitude').textContent = Math.round(test.exactitude * 100) + ' %';
    $('#metrique-apprentissage').textContent = Math.round(apprentissage.exactitude * 100) + ' %';
    etat.courbe = etat.courbe.map((p) => ({ entropie: p.entropie, exactitude: p.exactitude }));
    dessinerCourbe();
    dessinerPredictions();
    dessinerPoids();
  }

  /* ---------------------------------------------------------------- */
  /* Interface                                                         */
  /* ---------------------------------------------------------------- */

  function brancherUI() {
    $('#bouton-lancer').addEventListener('click', lancer);
    $('#bouton-reinitialiser').addEventListener('click', () => {
      etat.enCours = false;
      etat.reseau = null;
      etat.courbe = [];
      etat.historique = [];
      $('#bouton-lancer').disabled = false;
      $('#statut').textContent = 'Prêt — les poids ont été réinitialisés.';
      $('#metrique-perte').textContent = '—';
      $('#metrique-exactitude').textContent = '—';
      $('#metrique-apprentissage').textContent = '—';
      $('#nb-parametres').textContent = '—';
      dessinerCourbe();
      dessinerPredictions();
      dessinerPoids();
    });

    $('#reglage-taux').addEventListener('input', (e) => {
      etat.taux = parseInt(e.target.value, 10) / 1000;
      $('#valeur-taux').textContent = etat.taux.toFixed(3);
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
      btn.addEventListener('click', () => {
        appliquerTheme(!document.body.classList.contains('sombre'));
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Démarrage                                                         */
  /* ---------------------------------------------------------------- */

  function demarrer() {
    brancherUI();
    initialiserTheme();
    dessinerCourbe();
    dessinerPredictions();
    dessinerPoids();
    $('#statut').textContent = 'Prêt.';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer);
  } else {
    demarrer();
  }
})(window);
