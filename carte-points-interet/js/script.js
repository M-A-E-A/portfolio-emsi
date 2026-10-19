/* =============================================================
   Carte des points d'intérêt — script unique (aucun module ES,
   aucune requête réseau : fonctionne en file://).
   ============================================================= */
(function () {
  'use strict';

  /* ---------- Stockage sûr : localStorage peut être bloqué ---------- */
  const stockage = {
    lire(cle, defaut) { try { const v = localStorage.getItem(cle); return v === null ? defaut : JSON.parse(v); } catch (e) { return defaut; } },
    ecrire(cle, valeur) { try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch (e) {} }
  };

  /* ---------------------------- Modèle ---------------------------- */
  const CATEGORIES = ['Monuments', 'Jardins', 'Restaurants', 'Shopping'];
  const ICONE_CAT = {
    Monuments: 'ico-monuments',
    Jardins: 'ico-jardins',
    Restaurants: 'ico-restaurants',
    Shopping: 'ico-shopping'
  };

  const LIEUX_DEFAUT = [
    { id: 'koutoubia', nom: 'Koutoubia', categorie: 'Monuments', x: 41, y: 38,
      description: "Le minaret almohade de 77 m qui sert de repère à toute la médina." },
    { id: 'jemaa-el-fna', nom: 'Jemaa el-Fna', categorie: 'Monuments', x: 52, y: 30,
      description: "La grande place, ses conteurs, ses musiciens et ses étals le soir venu." },
    { id: 'palais-bahia', nom: 'Palais Bahia', categorie: 'Monuments', x: 30, y: 62,
      description: "Un palais du XIXe siècle, ses patios à zelliges et ses plafonds de cèdre." },
    { id: 'jardin-majorelle', nom: 'Jardin Majorelle', categorie: 'Jardins', x: 78, y: 22,
      description: "Neuf hectares de bambous, de cactus et le bleu intense de l'atelier." },
    { id: 'cafe-clock', nom: 'Café Clock', categorie: 'Restaurants', x: 63, y: 55,
      description: "Une maison restaurée : cuisine marocaine, concerts et cours de derbouka." },
    { id: 'souk-semmarine', nom: 'Souk Semmarine', categorie: 'Shopping', x: 46, y: 70,
      description: "L'allée couverte des artisans : cuir, lanternes, tapis et épices." }
  ];

  /* --------------------------- Utilitaires --------------------------- */
  const $ = function (sel) { return document.querySelector(sel); };

  // Neutralise les caractères sensibles avant injection dans le HTML.
  const ECHAPPEMENTS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function echapper(valeur) {
    return String(valeur === undefined || valeur === null ? '' : valeur)
      .replace(/[&<>"']/g, function (c) { return ECHAPPEMENTS[c]; });
  }

  // Comparaison insensible aux accents et à la casse.
  function normaliser(texte) {
    const t = String(texte || '');
    const n = t.normalize ? t.normalize('NFD') : t;
    return n.replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  // Borne une valeur (0 à 100 par défaut) ; les bornes servent aussi de marge au plan.
  function borner(valeur, min, max) {
    const bas = typeof min === 'number' ? min : 0;
    const haut = typeof max === 'number' ? max : 100;
    return Math.min(haut, Math.max(bas, valeur));
  }

  function nombre(valeur, defaut) {
    const n = Number(valeur);
    return isFinite(n) ? borner(n) : defaut;
  }

  // Les données relues du stockage sont filtrées avant usage.
  function validerLieux(brut) {
    if (!Array.isArray(brut)) { return null; }
    const propre = [];
    brut.forEach(function (item, i) {
      if (!item || typeof item !== 'object' || !item.nom) { return; }
      const categorie = CATEGORIES.indexOf(item.categorie) >= 0 ? item.categorie : 'Monuments';
      propre.push({
        id: typeof item.id === 'string' && item.id ? item.id : 'lieu-' + i + '-' + Date.now().toString(36),
        nom: String(item.nom).slice(0, 60),
        categorie: categorie,
        x: nombre(item.x, 50),
        y: nombre(item.y, 50),
        description: String(item.description || '').slice(0, 180)
      });
    });
    return propre;
  }

  function creerId() {
    return 'lieu-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  /* ---------------------------- État ---------------------------- */
  let lieux = validerLieux(stockage.lire('lieux', null)) || LIEUX_DEFAUT.slice();
  let recherche = '';
  let categorieActive = 'Toutes';
  let selectionId = null;
  let modePlacement = false;
  let modeMesure = false;
  let mesure = null;        // { a, b } : deux ancres de la règle ; ancre = { id, x, y }
  let pointEnCours = null;
  let suppressionId = null;
  let minuteurSuppression = null;

  // Glisser-déposer des marqueurs (souris, doigt, stylet).
  const SEUIL_GLISSER = 4; // px : en deçà, un relâchement reste un simple clic
  let glissement = null;    // { id, pointerId, marqueur, departX, departY, x0, y0, bouge }
  let finGlissement = 0;    // horodatage : neutralise le clic qui suit un vrai glissement

  /* -------------------------- Références DOM -------------------------- */
  const conteneur = $('#conteneur-plan');
  const calque = $('#marqueurs');
  const listeEl = $('#liste');
  const ficheEl = $('#fiche');
  const compteurEl = $('#compteur');
  const champRecherche = $('#recherche');
  const pucesEl = $('#puces');
  const bandeau = $('#bandeau-placement');
  const boutonAjouter = $('#bouton-ajouter');
  const boutonQuitter = $('#bouton-quitter-mode');
  const formAjout = $('#form-ajout');
  const formNom = $('#ajout-nom');
  const formCategorie = $('#ajout-categorie');
  const formDescription = $('#ajout-description');
  const formCoords = $('#ajout-coords');
  const formErreur = $('#ajout-erreur');
  const boutonAnnulerAjout = $('#bouton-annuler-ajout');
  const boutonExport = $('#bouton-export');
  const boutonImport = $('#bouton-import');
  const fichierImport = $('#fichier-import');
  const messageEl = $('#message-donnees');
  const annonceEl = $('#annonce');
  const boutonMesure = $('#bouton-mesure');
  const boutonEffacerMesure = $('#bouton-effacer-mesure');
  const sortieMesure = $('#mesure-sortie');
  const regleEl = $('#regle');
  const etiquetteDistance = $('#etiquette-distance');
  const notePlan = $('#note-plan');

  // Textes de la note du plan, échangés selon le mode en cours.
  const NOTE_PLAN_DEFAUT = 'Cliquez un marqueur pour ouvrir sa fiche ; glissez-le pour le déplacer.';
  const NOTE_PLAN_MESURE = 'Mesure : cliquez deux points du plan ou deux lieux. Glissez une punaise : la mesure suit le point.';

  /* --------------------------- Sélection --------------------------- */
  function lieuParId(id) {
    for (let i = 0; i < lieux.length; i++) {
      if (lieux[i].id === id) { return lieux[i]; }
    }
    return null;
  }

  function lieuCourant() {
    return lieuParId(selectionId);
  }

  // Un lieu passe-t-il les filtres en cours ?
  function correspond(lieu) {
    if (categorieActive !== 'Toutes' && lieu.categorie !== categorieActive) { return false; }
    if (!recherche) { return true; }
    const cible = normaliser(lieu.nom) + ' ' + normaliser(lieu.description);
    return cible.indexOf(recherche) >= 0;
  }

  function lieuxFiltres() {
    return lieux.filter(correspond);
  }

  // La liste affichée est triée par nom (ordre alphabétique français).
  function lieuxTries() {
    return lieuxFiltres().slice().sort(function (a, b) {
      return a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' });
    });
  }

  function sauvegarder() {
    stockage.ecrire('lieux', lieux);
  }

  /* -------------------------- Rendu : plan -------------------------- */
  function classesInfobulle(lieu) {
    let classes = '';
    if (lieu.x < 34) { classes += ' cote-gauche'; }
    else if (lieu.x > 66) { classes += ' cote-droite'; }
    if (lieu.y < 22) { classes += ' cote-bas'; }
    return classes;
  }

  function gabaritMarqueur(lieu, actif, filtre) {
    const icone = ICONE_CAT[lieu.categorie] || ICONE_CAT.Monuments;
    return '' +
      '<button type="button" class="marqueur' + (actif ? ' est-actif' : '') + (filtre ? ' est-filtre' : '') + '"' +
      ' data-id="' + echapper(lieu.id) + '"' +
      ' style="left:' + lieu.x + '%;top:' + lieu.y + '%"' +
      ' aria-label="' + echapper(lieu.nom) + '"' +
      ' aria-describedby="aide-deplacement"' +
      (actif ? ' aria-current="true"' : '') + '>' +
        '<span class="punaise" aria-hidden="true">' +
          '<svg class="ico punaise-ico" viewBox="0 0 24 24" focusable="false"><use href="#' + icone + '"></use></svg>' +
        '</span>' +
        '<span class="infobulle' + classesInfobulle(lieu) + '" role="tooltip">' +
          '<span class="infobulle-nom">' + echapper(lieu.nom) + '</span>' +
          '<span class="infobulle-cat">' + echapper(lieu.categorie) + '</span>' +
        '</span>' +
      '</button>';
  }

  function rendreMarqueurs() {
    let html = '';
    for (let i = 0; i < lieux.length; i++) {
      const lieu = lieux[i];
      html += gabaritMarqueur(lieu, lieu.id === selectionId, !correspond(lieu));
    }
    calque.innerHTML = html;
  }

  /* -------------------------- Rendu : liste -------------------------- */
  function gabaritLieu(lieu, actif) {
    const icone = ICONE_CAT[lieu.categorie] || ICONE_CAT.Monuments;
    return '' +
      '<li>' +
        '<button type="button" class="lieu' + (actif ? ' est-actif' : '') + '"' +
        ' data-id="' + echapper(lieu.id) + '"' +
        (actif ? ' aria-current="true"' : '') + '>' +
          '<span class="lieu-ico" aria-hidden="true">' +
            '<svg class="ico" viewBox="0 0 24 24" focusable="false"><use href="#' + icone + '"></use></svg>' +
          '</span>' +
          '<span class="lieu-corps">' +
            '<span class="lieu-ligne">' +
              '<span class="lieu-nom">' + echapper(lieu.nom) + '</span>' +
              '<span class="lieu-cat">' + echapper(lieu.categorie) + '</span>' +
            '</span>' +
            '<span class="lieu-desc">' + echapper(lieu.description) + '</span>' +
          '</span>' +
        '</button>' +
      '</li>';
  }

  function rendreListe() {
    if (lieux.length === 0) {
      listeEl.innerHTML = '<li class="liste-vide">Aucun lieu. Ajoutez votre premier point.</li>';
      return;
    }
    if (lieuxFiltres().length === 0) {
      listeEl.innerHTML = '<li class="liste-vide">Aucun lieu ne correspond à votre recherche.</li>';
      return;
    }
    let html = '';
    const visibles = lieuxTries();
    for (let i = 0; i < visibles.length; i++) {
      html += gabaritLieu(visibles[i], visibles[i].id === selectionId);
    }
    listeEl.innerHTML = html;
  }

  function rendreCompteur() {
    const nb = lieuxFiltres().length;
    compteurEl.textContent = nb + ' / ' + lieux.length;
  }

  /* -------------------------- Rendu : fiche -------------------------- */
  function rendreFiche() {
    const lieu = lieuCourant();
    if (!lieu) {
      ficheEl.innerHTML = '<p class="fiche-vide">Sélectionnez un point sur le plan ou dans la liste pour afficher sa fiche.</p>';
      return;
    }
    const icone = ICONE_CAT[lieu.categorie] || ICONE_CAT.Monuments;
    const enAttente = suppressionId === lieu.id;
    ficheEl.innerHTML = '' +
      '<div class="fiche-tete">' +
        '<span class="fiche-ico" aria-hidden="true">' +
          '<svg class="ico" viewBox="0 0 24 24" focusable="false"><use href="#' + icone + '"></use></svg>' +
        '</span>' +
        '<span>' +
          '<span class="fiche-nom" role="heading" aria-level="2">' + echapper(lieu.nom) + '</span><br>' +
          '<span class="fiche-cat mono">' + echapper(lieu.categorie) + '</span>' +
        '</span>' +
      '</div>' +
      '<p class="fiche-desc">' + echapper(lieu.description || 'Aucune description.') + '</p>' +
      '<p class="fiche-coords mono">x ' + lieu.x.toFixed(1) + ' % · y ' + lieu.y.toFixed(1) + ' %</p>' +
      '<div class="fiche-actions">' +
        '<button type="button" class="btn btn-alerte' + (enAttente ? ' est-confirmation' : '') + '"' +
        ' data-action="supprimer" data-id="' + echapper(lieu.id) + '">' +
          '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#ico-poubelle"></use></svg>' +
          (enAttente ? 'Confirmer' : 'Supprimer') +
        '</button>' +
        (enAttente ? '<p class="fiche-alerte" role="alert">Cliquez à nouveau pour supprimer définitivement.</p>' : '') +
      '</div>';
    if (enAttente) {
      const bouton = ficheEl.querySelector('[data-action="supprimer"]');
      if (bouton) { bouton.focus(); }
    }
  }

  /* --------------------------- Rendu global --------------------------- */
  function rendreTout() {
    rendreMarqueurs();
    rendreListe();
    rendreCompteur();
    rendreFiche();
    majBoutonExport();
    rendreMesure();
  }

  // Mise à jour légère : la sélection change sans reconstruire le DOM,
  // ce qui préserve le focus clavier.
  function majSelection() {
    majClasse(calque, 'est-actif');
    majClasse(listeEl, 'est-actif');
    rendreFiche();
  }

  function majClasse(racine, classe) {
    const elements = racine.querySelectorAll('[data-id]');
    for (let i = 0; i < elements.length; i++) {
      const actif = elements[i].dataset.id === selectionId;
      elements[i].classList.toggle(classe, actif);
      if (actif) { elements[i].setAttribute('aria-current', 'true'); }
      else { elements[i].removeAttribute('aria-current'); }
    }
  }

  function selectionner(id) {
    if (selectionId !== id) { annulerSuppression(); }
    selectionId = id;
    majSelection();
  }

  /* ------------------------- Annonces (a11y) ------------------------- */
  function annoncer(texte) {
    if (annonceEl) { annonceEl.textContent = texte; }
  }

  function formaterCoord(valeur) {
    return valeur.toFixed(1);
  }

  // Met à jour la ligne de coordonnées de la fiche sans la reconstruire
  // (reconstruire volerait le focus pendant un déplacement au clavier).
  function majCoordsFiche(lieu) {
    if (selectionId !== lieu.id) { return; }
    const ligne = ficheEl.querySelector('.fiche-coords');
    if (ligne) {
      ligne.textContent = 'x ' + formaterCoord(lieu.x) + ' % · y ' + formaterCoord(lieu.y) + ' %';
    }
  }

  // Recalcule le côté de l'infobulle après un déplacement (elle ne doit pas sortir du plan).
  function majInfobulle(marqueur, lieu) {
    const bulle = marqueur.querySelector('.infobulle');
    if (bulle) { bulle.className = 'infobulle' + classesInfobulle(lieu); }
  }

  // Applique une nouvelle position à un marqueur (DOM + état + fiche + annonce).
  function placerMarqueur(marqueur, lieu, annonce) {
    marqueur.style.left = lieu.x + '%';
    marqueur.style.top = lieu.y + '%';
    majInfobulle(marqueur, lieu);
    majCoordsFiche(lieu);
    sauvegarder();
    rendreMesure(); // la règle suit le lieu s'il est l'un de ses deux points
    if (annonce !== false) {
      annoncer(lieu.nom + ' déplacé en x ' + formaterCoord(lieu.x) + ' %, y ' + formaterCoord(lieu.y) + ' %.');
    }
  }

  /* -------------------------- Puces filtres -------------------------- */
  function rendrePuces() {
    let html = '' +
      '<button type="button" class="puce" data-cat="Toutes" aria-pressed="' + (categorieActive === 'Toutes') + '">' +
        '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#ico-toutes"></use></svg>' +
        '<span>Toutes</span>' +
      '</button>';
    for (let i = 0; i < CATEGORIES.length; i++) {
      const cat = CATEGORIES[i];
      html += '<button type="button" class="puce" data-cat="' + echapper(cat) + '" aria-pressed="' + (categorieActive === cat) + '">' +
        '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#' + ICONE_CAT[cat] + '"></use></svg>' +
        '<span>' + echapper(cat) + '</span>' +
      '</button>';
    }
    pucesEl.innerHTML = html;
  }

  /* ------------------------- Ajout d'un lieu ------------------------- */
  function positionRelative(evenement) {
    const cadre = conteneur.getBoundingClientRect();
    if (!cadre.width || !cadre.height) { return { x: 50, y: 50 }; }
    return {
      x: borner(((evenement.clientX - cadre.left) / cadre.width) * 100),
      y: borner(((evenement.clientY - cadre.top) / cadre.height) * 100)
    };
  }

  function ouvrirFormAjout(point, donnerFocus) {
    pointEnCours = point;
    formErreur.hidden = true;
    formCoords.textContent = 'x ' + point.x.toFixed(1) + ' % · y ' + point.y.toFixed(1) + ' %';
    formAjout.hidden = false;

    // Ancrage près du point cliqué, puis recalage pour rester dans le cadre.
    const cadre = conteneur.getBoundingClientRect();
    const largeur = formAjout.offsetWidth;
    const hauteur = formAjout.offsetHeight;
    const cx = (point.x / 100) * cadre.width;
    const cy = (point.y / 100) * cadre.height;
    let gauche = cx - largeur / 2;
    let haut = cy + 16;
    if (haut + hauteur > cadre.height - 8) { haut = cy - hauteur - 16; }
    gauche = Math.min(Math.max(8, gauche), Math.max(8, cadre.width - largeur - 8));
    haut = Math.min(Math.max(8, haut), Math.max(8, cadre.height - hauteur - 8));
    formAjout.style.left = gauche + 'px';
    formAjout.style.top = haut + 'px';
    if (donnerFocus !== false) { formNom.focus(); }
  }

  function fermerFormAjout() {
    formAjout.hidden = true;
    pointEnCours = null;
    formNom.value = '';
    formDescription.value = '';
    formCategorie.value = CATEGORIES[0];
    formErreur.hidden = true;
  }

  function activerPlacement() {
    if (modeMesure) { quitterMesure(); } // les deux modes ne se superposent pas
    modePlacement = true;
    conteneur.classList.add('mode-placement');
    bandeau.hidden = false;
    boutonAjouter.setAttribute('aria-pressed', 'true');
    boutonAjouter.classList.remove('btn-primaire');
    boutonAjouter.classList.add('btn-secondaire');
  }

  function quitterPlacement() {
    modePlacement = false;
    conteneur.classList.remove('mode-placement');
    bandeau.hidden = true;
    boutonAjouter.setAttribute('aria-pressed', 'false');
    boutonAjouter.classList.add('btn-primaire');
    boutonAjouter.classList.remove('btn-secondaire');
    fermerFormAjout();
  }

  function soumettreAjout(evenement) {
    evenement.preventDefault();
    const nom = formNom.value.trim();
    if (!nom) {
      formErreur.hidden = false;
      formNom.focus();
      return;
    }
    if (!pointEnCours) { return; }
    const nouveau = {
      id: creerId(),
      nom: nom.slice(0, 60),
      categorie: CATEGORIES.indexOf(formCategorie.value) >= 0 ? formCategorie.value : CATEGORIES[0],
      x: borner(pointEnCours.x),
      y: borner(pointEnCours.y),
      description: formDescription.value.trim().slice(0, 180) || 'Aucune description.'
    };
    lieux.push(nouveau);
    sauvegarder();

    // On remet les filtres à zéro pour que le nouveau point soit visible.
    recherche = '';
    champRecherche.value = '';
    categorieActive = 'Toutes';
    rendrePuces();

    quitterPlacement();
    selectionId = nouveau.id;
    rendreTout();

    const marqueur = calque.querySelector('.marqueur[data-id="' + nouveau.id + '"]');
    if (marqueur) { marqueur.focus(); }
  }

  /* ------------------------ Mesure de distance ------------------------ */
  // Le plan est schématique : l'échelle ci-dessous est une déclaration
  // indicative (voir la note « Échelle indicative »), la distance affichée
  // reste une approximation — jamais un relevé réel.
  const LARGEUR_PLAN_KM = 8;   // le plan représente ≈ 8 km sur 100 % en x
  const HAUTEUR_PLAN_KM = 6;   // et ≈ 6 km sur 100 % en y

  function distanceEntre(a, b) {
    const dx = (a.x - b.x) * LARGEUR_PLAN_KM / 100;
    const dy = (a.y - b.y) * HAUTEUR_PLAN_KM / 100;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function formaterDistance(km) {
    if (km < 1) { return Math.round(km * 1000) + ' m'; }
    return km.toFixed(1).replace('.', ',') + ' km';
  }

  function svgEl(nom, attributs) {
    const noeud = document.createElementNS('http://www.w3.org/2000/svg', nom);
    Object.keys(attributs).forEach(function (cle) { noeud.setAttribute(cle, attributs[cle]); });
    return noeud;
  }

  // Une ancre porte l'id d'une punaise (elle suit alors le lieu) ou seulement
  // des coordonnées (point cliqué librement sur le plan).
  function resoudreAncre(ancre) {
    if (!ancre) { return null; }
    if (ancre.id) {
      const lieu = lieuParId(ancre.id);
      if (!lieu) { return null; }
      return { id: lieu.id, x: lieu.x, y: lieu.y };
    }
    return { id: null, x: borner(ancre.x), y: borner(ancre.y) };
  }

  function demarrerMesure() {
    if (modePlacement) { quitterPlacement(); } // les deux modes ne se superposent pas
    modeMesure = true;
    mesure = null;
    conteneur.classList.add('mode-mesure');
    boutonMesure.setAttribute('aria-pressed', 'true');
    notePlan.textContent = NOTE_PLAN_MESURE;
    rendreMesure();
    annoncer('Mode mesure activé. Cliquez deux points du plan ou deux lieux.');
  }

  function quitterMesure() {
    modeMesure = false;
    mesure = null;
    conteneur.classList.remove('mode-mesure');
    boutonMesure.setAttribute('aria-pressed', 'false');
    notePlan.textContent = NOTE_PLAN_DEFAUT;
    rendreMesure();
  }

  function effacerMesure() {
    mesure = null;
    rendreMesure();
    annoncer('Mesure effacée.');
  }

  // point = { id, x, y } : id pour une punaise, absent pour un point du plan.
  function ajouterPointMesure(point) {
    if (!mesure || mesure.b) { mesure = { a: point, b: null }; }
    else { mesure.b = point; }
    rendreMesure();
  }

  function rendreMesure() {
    if (!regleEl) { return; }

    // Un lieu mesuré a disparu : la mesure perd son point d'appui.
    if (mesure) {
      if (!resoudreAncre(mesure.a)) { mesure = null; }
      else if (mesure.b && !resoudreAncre(mesure.b)) { mesure.b = null; }
    }

    const a = resoudreAncre(mesure && mesure.a);
    const b = resoudreAncre(mesure && mesure.b);
    const complet = !!(a && b);

    regleEl.textContent = '';
    if (boutonEffacerMesure) { boutonEffacerMesure.hidden = !a; }

    if (sortieMesure) {
      sortieMesure.hidden = !a;
      sortieMesure.classList.toggle('est-active', complet);
      if (!a) { sortieMesure.textContent = ''; }
      else if (complet) {
        sortieMesure.textContent = 'Distance approximative : ' + formaterDistance(distanceEntre(a, b)) + '.';
      } else {
        sortieMesure.textContent = 'Premier point posé — cliquez un deuxième point.';
      }
    }

    if (etiquetteDistance) {
      if (!complet) { etiquetteDistance.hidden = true; }
      else {
        etiquetteDistance.hidden = false;
        etiquetteDistance.textContent = '≈ ' + formaterDistance(distanceEntre(a, b));
        etiquetteDistance.style.left = ((a.x + b.x) / 2) + '%';
        etiquetteDistance.style.top = ((a.y + b.y) / 2) + '%';
      }
    }

    if (!a) { return; }

    // Le tracé vit dans le repère du SVG (viewBox 800 × 600).
    if (complet) {
      regleEl.appendChild(svgEl('line', {
        'class': 'regle-trait', x1: a.x * 8, y1: a.y * 6, x2: b.x * 8, y2: b.y * 6
      }));
    }
    regleEl.appendChild(svgEl('circle', { 'class': 'regle-point', cx: a.x * 8, cy: a.y * 6, r: 7 }));
    if (b) { regleEl.appendChild(svgEl('circle', { 'class': 'regle-point', cx: b.x * 8, cy: b.y * 6, r: 7 })); }
  }

  /* ------------------------ Déplacement d'un lieu ------------------------ */
  // Pas des flèches au clavier, en points de pourcentage.
  const FLECHES = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

  // Un vrai glissement laisse une empreinte temporelle : le clic qui suit
  // (sur la punaise ou sur le plan) est neutralisé, il ne sélectionne ni ne crée rien.
  function glisserVientDeFinir() { return Date.now() - finGlissement < 350; }

  function debutGlissement(evenement) {
    if (evenement.isPrimary === false) { return; }
    if (typeof evenement.button === 'number' && evenement.button !== 0) { return; }
    // En mode placement, on ne déplace pas : le clic sert à créer un lieu.
    if (modePlacement) { return; }
    const marqueur = evenement.target.closest('.marqueur');
    if (!marqueur) { return; }
    const lieu = lieuParId(marqueur.dataset.id);
    if (!lieu) { return; }
    glissement = {
      id: lieu.id,
      pointerId: evenement.pointerId,
      marqueur: marqueur,
      departX: evenement.clientX,
      departY: evenement.clientY,
      x0: lieu.x,
      y0: lieu.y,
      bouge: false
    };
    // La capture garde les événements sur la punaise, même hors du plan.
    try { marqueur.setPointerCapture(evenement.pointerId); } catch (e) {}
  }

  function coursGlissement(evenement) {
    if (!glissement || evenement.pointerId !== glissement.pointerId) { return; }
    const dx = evenement.clientX - glissement.departX;
    const dy = evenement.clientY - glissement.departY;
    if (!glissement.bouge && (dx * dx + dy * dy) < SEUIL_GLISSER * SEUIL_GLISSER) { return; }
    glissement.bouge = true;
    if (evenement.cancelable) { evenement.preventDefault(); }
    const point = positionRelative(evenement);
    const lieu = lieuParId(glissement.id);
    if (!lieu) { return; }
    lieu.x = point.x;
    lieu.y = point.y;
    glissement.marqueur.style.left = point.x + '%';
    glissement.marqueur.style.top = point.y + '%';
    glissement.marqueur.classList.add('est-deplace');
    rendreMesure(); // mise à jour en direct pendant le glissement
  }

  function finGlissementHandler(evenement, annuler) {
    if (!glissement || evenement.pointerId !== glissement.pointerId) { return; }
    const etat = glissement;
    glissement = null;
    try { etat.marqueur.releasePointerCapture(etat.pointerId); } catch (e) {}
    etat.marqueur.classList.remove('est-deplace');
    // Mouvement trop faible : c'était un clic, la sélection suit son cours normal.
    if (!etat.bouge) { return; }
    finGlissement = Date.now();
    const lieu = lieuParId(etat.id);
    if (!lieu) { return; }
    if (annuler) {
      lieu.x = etat.x0;
      lieu.y = etat.y0;
      placerMarqueur(etat.marqueur, lieu, false);
      annoncer('Déplacement annulé.');
      return;
    }
    placerMarqueur(etat.marqueur, lieu);
  }

  // Échap pendant un glissement : on annule et on remet le marqueur à sa place.
  function annulerGlissement() {
    if (!glissement) { return; }
    finGlissementHandler({ pointerId: glissement.pointerId }, true);
  }

  // Déplacement au clavier : 1 % par flèche, 5 % avec Maj.
  function clavierMarqueur(evenement) {
    const pas = FLECHES[evenement.key];
    if (!pas) { return; }
    const marqueur = evenement.target.closest('.marqueur');
    if (!marqueur) { return; }
    const lieu = lieuParId(marqueur.dataset.id);
    if (!lieu) { return; }
    evenement.preventDefault();
    const unite = evenement.shiftKey ? 5 : 1;
    lieu.x = borner(Math.round((lieu.x + pas[0] * unite) * 10) / 10);
    lieu.y = borner(Math.round((lieu.y + pas[1] * unite) * 10) / 10);
    placerMarqueur(marqueur, lieu);
  }

  /* ---------------------- Import / export JSON ---------------------- */
  // Aucune requête réseau : tout passe par Blob, FileReader et des liens locaux.

  function afficherMessage(texte, type) {
    if (!messageEl) { return; }
    messageEl.className = 'message-donnees' + (type ? ' est-' + type : '');
    messageEl.textContent = texte;
    messageEl.hidden = false;
  }

  function masquerMessage() {
    if (!messageEl) { return; }
    messageEl.hidden = true;
    messageEl.textContent = '';
  }

  // L'export reste indisponible tant qu'il n'y a rien à exporter.
  function majBoutonExport() {
    if (!boutonExport) { return; }
    boutonExport.disabled = lieux.length === 0;
  }

  function exporterLieux() {
    if (lieux.length === 0) {
      afficherMessage('Aucun lieu à exporter.', 'info');
      return;
    }
    // Même forme que la valeur rangée sous la clé « lieux » : un tableau nu.
    const json = JSON.stringify(lieux, null, 2);
    const fichier = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(fichier);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = 'points-interet.json';
    lien.rel = 'noopener';
    document.body.appendChild(lien);
    lien.click();
    document.body.removeChild(lien);
    // Libération différée : certains navigateurs annulent le téléchargement
    // lorsque l'URL est révoquée dans la foulée du clic.
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    const n = lieux.length;
    const texte = n + ' lieu' + (n > 1 ? 'x' : '') + ' exporté' + (n > 1 ? 's' : '') + ' dans points-interet.json.';
    afficherMessage(texte, 'succes');
    annoncer(texte);
  }

  function ouvrirSelecteurImport() {
    if (!fichierImport) { return; }
    masquerMessage();
    fichierImport.value = '';
    fichierImport.click();
  }

  // Tolérant : accepte un tableau nu ou une enveloppe { "lieux": [...] }.
  function extraireLieux(brut) {
    if (Array.isArray(brut)) { return brut; }
    if (brut && typeof brut === 'object' && Array.isArray(brut.lieux)) { return brut.lieux; }
    return null;
  }

  function compterLieux(n) {
    return n + ' lieu' + (n > 1 ? 'x' : '');
  }

  function importerLieux(evenement) {
    const fichier = evenement.target.files && evenement.target.files[0];
    if (!fichier) { return; }
    const lecteur = new FileReader();
    lecteur.onerror = function () {
      afficherMessage("Lecture du fichier impossible. Vérifiez qu'il s'agit bien d'un fichier JSON.", 'erreur');
    };
    lecteur.onload = function () {
      let brut;
      try {
        brut = JSON.parse(String(lecteur.result));
      } catch (e) {
        afficherMessage("Le fichier n'est pas un JSON valide. Les lieux actuels sont conservés.", 'erreur');
        return;
      }
      const liste = extraireLieux(brut);
      if (!liste) {
        afficherMessage('Format inattendu : un tableau de lieux ou un objet { "lieux": [ ... ] } est attendu.', 'erreur');
        return;
      }
      // validerLieux filtre, génère les identifiants manquants et borne x / y.
      const propres = validerLieux(liste);
      if (!propres || propres.length === 0) {
        afficherMessage('Aucun lieu valide : chaque lieu doit au moins avoir un nom.', 'erreur');
        return;
      }

      // Remplacement complet — les données actuelles ne sont touchées qu'ici.
      annulerSuppression();
      lieux = propres;
      sauvegarder();
      if (!lieuParId(selectionId)) { selectionId = null; }

      // Filtres remis à zéro pour que les lieux importés soient visibles.
      recherche = '';
      champRecherche.value = '';
      categorieActive = 'Toutes';
      rendrePuces();
      rendreTout();

      const resume = compterLieux(propres.length) + (propres.length > 1 ? ' importés.' : ' importé.');
      afficherMessage(resume, 'succes');
      annoncer(resume);
    };
    // Le champ est réinitialisé dans tous les cas : même fichier réimportable.
    lecteur.onloadend = function () { fichierImport.value = ''; };
    lecteur.readAsText(fichier);
  }

  /* --------------------------- Suppression --------------------------- */
  function annulerSuppression() {
    if (minuteurSuppression) { clearTimeout(minuteurSuppression); minuteurSuppression = null; }
    suppressionId = null;
  }

  function supprimerLieu(id) {
    annulerSuppression();
    lieux = lieux.filter(function (lieu) { return lieu.id !== id; });
    if (selectionId === id) { selectionId = null; }
    sauvegarder();
    rendreTout();
  }

  function clicFiche(evenement) {
    const bouton = evenement.target.closest('[data-action="supprimer"]');
    if (!bouton) { return; }
    const id = bouton.dataset.id;
    if (suppressionId !== id) {
      // Premier clic : on demande confirmation, avec annulation automatique.
      suppressionId = id;
      if (minuteurSuppression) { clearTimeout(minuteurSuppression); }
      minuteurSuppression = setTimeout(function () {
        suppressionId = null;
        minuteurSuppression = null;
        rendreFiche();
      }, 4000);
      rendreFiche();
      return;
    }
    supprimerLieu(id);
  }

  /* ------------------------ Thème clair / sombre ------------------------ */
  const boutonTheme = $('#theme');
  const mediaSombre = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function appliquerTheme(sombre) {
    document.body.classList.toggle('sombre', sombre);
    boutonTheme.setAttribute('aria-pressed', String(sombre));
    boutonTheme.setAttribute('aria-label', sombre ? 'Activer le thème clair' : 'Activer le thème sombre');
  }

  boutonTheme.addEventListener('click', function () {
    const sombre = !document.body.classList.contains('sombre');
    appliquerTheme(sombre);
    stockage.ecrire('carte-theme', sombre ? 'sombre' : 'clair');
  });

  /* ---------------------------- Écouteurs ---------------------------- */
  // Sélection par la liste
  listeEl.addEventListener('click', function (evenement) {
    const item = evenement.target.closest('.lieu');
    if (item) { selectionner(item.dataset.id); }
  });

  // Sélection par le marqueur — jamais de création en mode placement
  calque.addEventListener('click', function (evenement) {
    const marqueur = evenement.target.closest('.marqueur');
    if (!marqueur) { return; }
    evenement.stopPropagation();
    if (glisserVientDeFinir()) { return; }
    if (modePlacement) { return; }
    // En mode mesure, cliquer une punaise la prend comme point d'appui.
    if (modeMesure) {
      const lieu = lieuParId(marqueur.dataset.id);
      if (lieu) {
        ajouterPointMesure({ id: lieu.id, x: lieu.x, y: lieu.y });
        annoncer(mesure && mesure.b ? 'Deuxième point posé sur ' + lieu.nom + '.' : 'Premier point posé sur ' + lieu.nom + '.');
      }
      return;
    }
    selectionner(marqueur.dataset.id);
  });

  // Clic sur le plan : ouvre le formulaire en mode placement
  conteneur.addEventListener('click', function (evenement) {
    if (glisserVientDeFinir()) { return; }
    if (modeMesure) {
      if (evenement.target.closest('.form-ajout')) { return; }
      const point = positionRelative(evenement);
      ajouterPointMesure({ id: null, x: point.x, y: point.y });
      annoncer(mesure && mesure.b ? 'Deuxième point posé sur le plan.' : 'Premier point posé sur le plan.');
      return;
    }
    if (!modePlacement) { return; }
    if (evenement.target.closest('.marqueur')) { return; }
    if (evenement.target.closest('.form-ajout')) { return; }
    ouvrirFormAjout(positionRelative(evenement));
  });

  // Déplacement d'un marqueur : glisser-déposer (souris, doigt, stylet).
  calque.addEventListener('pointerdown', debutGlissement);
  window.addEventListener('pointermove', coursGlissement, { passive: false });
  window.addEventListener('pointerup', function (evenement) {
    finGlissementHandler(evenement, false);
  });
  window.addEventListener('pointercancel', function (evenement) {
    finGlissementHandler(evenement, true);
  });

  // Déplacement d'un marqueur au clavier (flèches, Maj pour un pas de 5 %).
  calque.addEventListener('keydown', clavierMarqueur);

  // Recherche
  champRecherche.addEventListener('input', function () {
    recherche = normaliser(champRecherche.value);
    rendreTout();
  });

  // Filtres de catégorie (délégation)
  pucesEl.addEventListener('click', function (evenement) {
    const puce = evenement.target.closest('.puce');
    if (!puce) { return; }
    categorieActive = puce.dataset.cat;
    rendrePuces();
    rendreTout();
    const active = pucesEl.querySelector('[aria-pressed="true"]');
    if (active) { active.focus(); }
  });

  // Ajout
  boutonAjouter.addEventListener('click', function () {
    if (modePlacement) { quitterPlacement(); } else { activerPlacement(); }
  });
  boutonQuitter.addEventListener('click', quitterPlacement);
  formAjout.addEventListener('submit', soumettreAjout);
  boutonAnnulerAjout.addEventListener('click', function () {
    fermerFormAjout();
    if (modePlacement) { quitterPlacement(); }
  });

  // Suppression (deux temps) dans la fiche
  ficheEl.addEventListener('click', clicFiche);

  // Mesure de distance : bascule du mode + effacement de la règle
  boutonMesure.addEventListener('click', function () {
    if (modeMesure) { quitterMesure(); } else { demarrerMesure(); }
  });
  boutonEffacerMesure.addEventListener('click', effacerMesure);

  // Import / export des lieux (fichier JSON local, aucune requête réseau)
  boutonExport.addEventListener('click', exporterLieux);
  boutonImport.addEventListener('click', ouvrirSelecteurImport);
  fichierImport.addEventListener('change', importerLieux);

  // Échap : annule un glissement, ferme le formulaire, efface la mesure
  // (puis quitte le mode), et quitte le mode placement.
  document.addEventListener('keydown', function (evenement) {
    if (evenement.key !== 'Escape') { return; }
    if (glissement) { annulerGlissement(); }
    if (!formAjout.hidden) { fermerFormAjout(); }
    if (modeMesure) {
      if (mesure) { effacerMesure(); }
      else { quitterMesure(); boutonMesure.focus(); }
    }
    if (modePlacement) { quitterPlacement(); boutonAjouter.focus(); }
    if (suppressionId) { annulerSuppression(); rendreFiche(); }
  });

  // Le formulaire suit un éventuel redimensionnement
  window.addEventListener('resize', function () {
    if (!formAjout.hidden && pointEnCours) { ouvrirFormAjout(pointEnCours, false); }
  });

  /* ------------------------------ Init ------------------------------ */
  function initialiser() {
    // Thème : choix mémorisé, sinon préférence système
    const memorise = stockage.lire('carte-theme', null);
    const sombre = memorise === null ? !!(mediaSombre && mediaSombre.matches) : memorise === 'sombre';
    appliquerTheme(sombre);

    // Sélecteur de catégorie du formulaire
    let options = '';
    for (let i = 0; i < CATEGORIES.length; i++) {
      options += '<option value="' + echapper(CATEGORIES[i]) + '">' + echapper(CATEGORIES[i]) + '</option>';
    }
    formCategorie.innerHTML = options;

    $('#annee').textContent = new Date().getFullYear();

    rendrePuces();
    rendreTout();
  }

  initialiser();
})();


