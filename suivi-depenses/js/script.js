/* ======================================================================
   Suivi de dépenses — logique de l'application (JavaScript classique)
   Aucun module, aucune dépendance : fonctionne en file://
   ====================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------
     1. Stockage sûr (localStorage peut être bloqué en file://)
     ------------------------------------------------------------------ */
  const stockage = {
    lire(cle, defaut) { try { const v = localStorage.getItem(cle); return v === null ? defaut : JSON.parse(v); } catch (e) { return defaut; } },
    ecrire(cle, valeur) { try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch (e) {} },
    supprimer(cle) { try { localStorage.removeItem(cle); } catch (e) {} }
  };

  /* ------------------------------------------------------------------
     2. Constantes
     ------------------------------------------------------------------ */
  const CLE_DEPENSES = 'depenses';
  const CLE_THEME = 'depenses-theme';
  const CLE_BUDGETS = 'depenses-budgets';
  const CATEGORIES = ['Alimentation', 'Transport', 'Logement', 'Loisirs', 'Santé', 'Autre'];
  const NB_MOIS = 6;                       // graphique : 6 derniers mois
  const DELAI_CONFIRMATION = 4000;         // ms avant annulation de la suppression
  const SEUIL_ATTENTION = 80;              // % du budget : « attention »
  const SEUIL_DEPASSE = 100;               // % du budget : « dépassé »

  const $ = (id) => document.getElementById(id);

  /* ------------------------------------------------------------------
     3. Formatage français
     ------------------------------------------------------------------ */
  const fmtMAD = new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'MAD',
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  const fmtNombre2 = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  const fmtEntier = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const fmtDecimal1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const fmtMoisLong = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
  const fmtMoisCourt = new Intl.DateTimeFormat('fr-FR', { month: 'short' });

  /* ------------------------------------------------------------------
     4. Utilitaires de date (toujours en heure locale, jamais en UTC)
     ------------------------------------------------------------------ */
  function enISO(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function aujourdHuiISO() {
    const d = new Date();
    d.setHours(12, 0, 0, 0); // midi : évite les surprises de changement d'heure
    return enISO(d);
  }

  /** Date ISO située il y a « jours » jours. */
  function ilYA(jours) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - jours);
    return enISO(d);
  }

  /** "AAAA-MM-JJ" -> Date locale (ou null si invalide). */
  function dateDepuisISO(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const [a, m, j] = iso.split('-').map(Number);
    const d = new Date(a, m - 1, j);
    return (d.getFullYear() === a && d.getMonth() === m - 1 && d.getDate() === j) ? d : null;
  }

  /** Clé de mois "AAAA-MM". */
  function cleMois(iso) { return typeof iso === 'string' ? iso.slice(0, 7) : ''; }

  function majuscule(txt) { return txt.charAt(0).toUpperCase() + txt.slice(1); }

  /** Étiquette courte d'un mois : "Août", "Sept."… */
  function moisCourt(cle) {
    const d = dateDepuisISO(cle + '-01');
    return d ? majuscule(fmtMoisCourt.format(d)) : cle;
  }

  /** Étiquette longue d'un mois : "Août 2026". */
  function moisLong(cle) {
    const d = dateDepuisISO(cle + '-01');
    return d ? majuscule(fmtMoisLong.format(d)) : cle;
  }

  /** Montant compact pour l'étiquette au-dessus d'une barre. */
  function montantBarre(n) {
    if (n >= 10000) return fmtDecimal1.format(n / 1000) + ' k';
    return fmtEntier.format(n);
  }

  /* ------------------------------------------------------------------
     5. Données
     ------------------------------------------------------------------ */
  function nouvelId() {
    return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /** Jeu d'exemple du premier lancement : dates calculées par rapport à aujourd'hui. */
  function depensesExemple() {
    const modeles = [
      { jours: 2,  libelle: 'Courses du marché',    montant: 186.50, categorie: 'Alimentation' },
      { jours: 3,  libelle: 'Abonnement transport', montant: 250.00, categorie: 'Transport' },
      { jours: 6,  libelle: 'Pharmacie',            montant: 74.20,  categorie: 'Santé' },
      { jours: 9,  libelle: 'Loyer',                montant: 3200.00, categorie: 'Logement' },
      { jours: 12, libelle: 'Séance de cinéma',     montant: 90.00,  categorie: 'Loisirs' },
      { jours: 16, libelle: "Facture d'électricité", montant: 412.75, categorie: 'Logement' },
      { jours: 22, libelle: 'Carburant',            montant: 520.00, categorie: 'Transport' },
      { jours: 31, libelle: 'Courses du mois',      montant: 214.90, categorie: 'Alimentation' },
      { jours: 44, libelle: 'Loyer',                montant: 3200.00, categorie: 'Logement' },
      { jours: 58, libelle: 'Restaurant',           montant: 165.00, categorie: 'Alimentation' },
      { jours: 71, libelle: 'Loyer',                montant: 3200.00, categorie: 'Logement' },
      { jours: 83, libelle: 'Livres et revues',     montant: 143.60, categorie: 'Loisirs' }
    ];
    return modeles.map((m) => ({
      id: nouvelId(),
      libelle: m.libelle,
      montant: m.montant,
      categorie: m.categorie,
      date: ilYA(m.jours)
    }));
  }

  /** Normalise ce qui vient du stockage (données absentes, abîmées ou anciennes). */
  function normaliserDepenses(brut) {
    if (!Array.isArray(brut)) return null;
    const propres = [];
    brut.forEach((d) => {
      if (!d || typeof d !== 'object') return;
      const montant = Number(d.montant);
      if (!d.libelle || !isFinite(montant) || !dateDepuisISO(d.date)) return;
      propres.push({
        id: typeof d.id === 'string' && d.id ? d.id : nouvelId(),
        libelle: String(d.libelle),
        montant: montant,
        categorie: CATEGORIES.indexOf(d.categorie) !== -1 ? d.categorie : 'Autre',
        date: d.date
      });
    });
    return propres;
  }

  function chargerDepenses() {
    const enregistre = normaliserDepenses(stockage.lire(CLE_DEPENSES, null));
    if (enregistre) return enregistre;          // déjà des données (même vides)
    const exemple = depensesExemple();          // premier lancement
    stockage.ecrire(CLE_DEPENSES, exemple);
    return exemple;
  }

  /** Normalise les budgets : objet { catégorie: montant }, seules les valeurs > 0 sont gardées. */
  function normaliserBudgets(brut) {
    const propres = {};
    if (!brut || typeof brut !== 'object') return propres;
    CATEGORIES.forEach((cat) => {
      const montant = Number(brut[cat]);
      if (isFinite(montant) && montant > 0) propres[cat] = Math.round(montant * 100) / 100;
    });
    return propres;
  }

  function chargerBudgets() {
    return normaliserBudgets(stockage.lire(CLE_BUDGETS, null));
  }

  /* ------------------------------------------------------------------
     6. État de l'application
     ------------------------------------------------------------------ */
  const etat = {
    depenses: chargerDepenses(),
    budgets: chargerBudgets(),  // { catégorie: montant mensuel }
    categorie: null,   // null = toutes les catégories
    mois: null         // null = tous les mois
  };

  /* ------------------------------------------------------------------
     7. Références DOM
     ------------------------------------------------------------------ */
  const corps = document.body;
  const boutonTheme = $('theme');
  const form = $('form-depense');
  const champLibelle = $('libelle');
  const champMontant = $('montant');
  const champCategorie = $('categorie');
  const champDate = $('date');
  const erreurs = {
    libelle: $('erreur-libelle'),
    montant: $('erreur-montant'),
    date: $('erreur-date')
  };
  const barres = $('barres');
  const lectureGraph = $('lecture-graph');
  const repartition = $('repartition');
  const repartitionVide = $('repartition-vide');
  const zoneBudgets = $('budgets');
  const zoneBudgetsVide = $('budgets-vide');
  const donut = $('donut');
  const donutTotal = $('donut-total');
  const donutLegende = $('donut-legende');
  const donutVide = $('donut-vide');
  const donutNote = $('donut-note');
  const puces = $('puces');
  const liste = $('liste');
  const listeVide = $('liste-vide');
  const resumeListe = $('resume-liste');
  const boutonToutAfficher = $('tout-afficher');
  const boutonExport = $('export-csv');
  const statut = $('statut');

  /* ------------------------------------------------------------------
     8. Lecture des données
     ------------------------------------------------------------------ */
  function sauver() { stockage.ecrire(CLE_DEPENSES, etat.depenses); }

  /** Tri : date décroissante, puis id décroissant (les plus récentes d'abord). */
  function depensesTriees() {
    return etat.depenses.slice().sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      if (a.id === b.id) return 0;
      return a.id < b.id ? 1 : -1;
    });
  }

  function depensesFiltrees() {
    return depensesTriees().filter((d) => {
      if (etat.categorie && d.categorie !== etat.categorie) return false;
      if (etat.mois && cleMois(d.date) !== etat.mois) return false;
      return true;
    });
  }

  function totalDe(liste) {
    return liste.reduce((somme, d) => somme + d.montant, 0);
  }

  function filtreActif() { return etat.categorie !== null || etat.mois !== null; }

  /* ------------------------------------------------------------------
     8 bis. Variations (période courante comparée à la précédente)
     ------------------------------------------------------------------ */

  /** Clé « AAAA-MM » décalée de n mois (n négatif remonte le temps). */
  function decalerMois(cle, n) {
    const parties = /^(\d{4})-(\d{2})$/.exec(cle);
    if (!parties) return cle;
    const d = new Date(Number(parties[1]), Number(parties[2]) - 1 + n, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  /** Totaux des dépenses agrégés par clé de mois. */
  function totauxParMois() {
    const totaux = {};
    etat.depenses.forEach((d) => {
      const cle = cleMois(d.date);
      totaux[cle] = (totaux[cle] || 0) + d.montant;
    });
    return totaux;
  }

  /**
   * Variation d'un montant par rapport à un montant de référence.
   * Renvoie null quand l'historique manque : sans référence strictement
   * positive, aucun pourcentage n'a de sens (aucun badge n'est alors affiché).
   */
  function calculerVariation(actuel, precedent) {
    if (!(precedent > 0)) return null;
    const pourcent = Math.round(((actuel - precedent) / precedent) * 100);
    return {
      pourcent: pourcent,
      sens: pourcent > 0 ? 'hausse' : (pourcent < 0 ? 'baisse' : 'stable')
    };
  }

  /**
   * Écrit (ou masque) une variation dans un élément : symbole et pourcentage
   * visibles, phrase complète réservée aux lecteurs d'écran.
   */
  function ecrireVariation(element, variation, reference) {
    if (!variation) { element.hidden = true; return; }

    let fleche = element.querySelector('.variation-fleche');
    let valeur = element.querySelector('.variation-valeur');
    let lecture = element.querySelector('.variation-lecture');
    if (!fleche) {
      fleche = document.createElement('span');
      fleche.className = 'variation-fleche';
      fleche.setAttribute('aria-hidden', 'true');
      valeur = document.createElement('span');
      valeur.className = 'variation-valeur';
      valeur.setAttribute('aria-hidden', 'true');
      lecture = document.createElement('span');
      lecture.className = 'sr-only variation-lecture';
      element.append(fleche, valeur, lecture);
    }

    const nombre = fmtEntier.format(Math.abs(variation.pourcent));
    const signe = variation.pourcent > 0 ? '+' : (variation.pourcent < 0 ? '\u2212' : '');

    fleche.textContent = variation.sens === 'hausse' ? '\u25B2'
      : variation.sens === 'baisse' ? '\u25BC' : '=';
    valeur.textContent = signe + nombre + ' %';
    lecture.textContent = variation.sens === 'hausse'
      ? 'En hausse de ' + nombre + ' % ' + reference + '.'
      : variation.sens === 'baisse'
        ? 'En baisse de ' + nombre + ' % ' + reference + '.'
        : 'Stable ' + reference + '.';

    element.className = 'variation variation-' + variation.sens;
    element.hidden = false;
  }

  /* ------------------------------------------------------------------
     9. Rendu : tuiles de synthèse
     ------------------------------------------------------------------ */
  function rendreTuiles() {
    const moisCourant = cleMois(aujourdHuiISO());
    const totauxMois = totauxParMois();

    const duMois = etat.depenses.filter((d) => cleMois(d.date) === moisCourant);
    const totalMois = totalDe(duMois);
    const total = totalDe(etat.depenses);

    // Nombre de mois réellement couverts par les données (pour la moyenne)
    const moisUtilises = Object.keys(totauxMois).sort();
    const nbMois = moisUtilises.length;
    const moyenne = nbMois > 0 ? total / nbMois : 0;

    $('tuile-mois').textContent = fmtMAD.format(totalMois);
    $('tuile-mois-note').textContent = majuscule(fmtMoisLong.format(new Date())) +
      ' · ' + duMois.length + (duMois.length > 1 ? ' dépenses' : ' dépense');

    $('tuile-total').textContent = fmtMAD.format(total);
    $('tuile-total-note').textContent = etat.depenses.length +
      (etat.depenses.length > 1 ? ' dépenses enregistrées' : ' dépense enregistrée');

    $('tuile-moyenne').textContent = fmtMAD.format(moyenne);
    $('tuile-moyenne-note').textContent = nbMois > 0
      ? 'sur ' + nbMois + (nbMois > 1 ? ' mois couverts' : ' mois couvert')
      : 'aucune donnée';

    // « Ce mois-ci » : la tuile porte toujours sur le mois calendaire en cours,
    // elle est donc comparée au mois qui le précède immédiatement.
    ecrireVariation(
      $('tuile-mois-variation'),
      calculerVariation(totalMois, totauxMois[decalerMois(moisCourant, -1)] || 0),
      'par rapport au mois précédent'
    );

    // Total et moyenne : période courante = tout l'historique enregistré,
    // période précédente comparable = le même historique arrêté un mois plus
    // tôt (toutes les dépenses hors mois en cours). Un décalage d'un mois est
    // le seul décalage vraiment exploitable : une période de même longueur
    // posée avant la première dépense ne contiendrait jamais rien. Faute
    // d'historique antérieur au mois en cours, la référence vaut 0 et le badge
    // reste masqué.
    const duMoisPrecedent = etat.depenses.filter((d) => cleMois(d.date) !== moisCourant);
    const totalPrecedent = totalDe(duMoisPrecedent);
    const nbMoisPrecedent = moisUtilises.filter((cle) => cle !== moisCourant).length;
    ecrireVariation(
      $('tuile-total-variation'),
      calculerVariation(total, totalPrecedent),
      'par rapport au mois précédent'
    );
    ecrireVariation(
      $('tuile-moyenne-variation'),
      calculerVariation(moyenne, nbMoisPrecedent > 0 ? totalPrecedent / nbMoisPrecedent : 0),
      'par rapport au mois précédent'
    );
  }

  /* ------------------------------------------------------------------
     10. Rendu : graphique en barres (HTML/CSS)
     ------------------------------------------------------------------ */
  /** Totaux des 6 derniers mois, du plus ancien au plus récent. */
  function serieDesMois() {
    const base = new Date();
    base.setHours(12, 0, 0, 0);
    base.setDate(1); // 1er du mois courant

    const totaux = {};
    etat.depenses.forEach((d) => {
      const cle = cleMois(d.date);
      totaux[cle] = (totaux[cle] || 0) + d.montant;
    });

    const moisCourant = cleMois(aujourdHuiISO());
    const serie = [];
    for (let i = NB_MOIS - 1; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const cle = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      serie.push({
        cle: cle,
        total: totaux[cle] || 0,
        courant: cle === moisCourant
      });
    }
    return serie;
  }

  let moisAffiches = []; // clés des mois actuellement dessinés

  /** Construit une seule fois la structure des 6 colonnes. */
  function construireBarres(serie) {
    barres.innerHTML = '';
    serie.forEach((m) => {
      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.className = 'barre';
      bouton.dataset.mois = m.cle;

      const valeur = document.createElement('span');
      valeur.className = 'barre-val';

      const piste = document.createElement('span');
      piste.className = 'barre-piste';
      const jauge = document.createElement('span');
      jauge.className = 'barre-jauge';
      piste.appendChild(jauge);

      const etiquette = document.createElement('span');
      etiquette.className = 'barre-mois';

      /* Texte enrichi pour les lecteurs d'écran, ajouté EN DERNIER : le nom
         accessible est dérivé du contenu (pas d'aria-label), ce qui garantit
         que le texte visible y figure bien. */
      const srOnly = document.createElement('span');
      srOnly.className = 'sr-only';

      bouton.append(valeur, piste, etiquette, srOnly);
      barres.appendChild(bouton);
    });
    moisAffiches = serie.map((m) => m.cle);
  }

  function rendreGraphique() {
    const serie = serieDesMois();
    const maximum = serie.reduce((max, m) => Math.max(max, m.total), 0);
    const totalSerie = serie.reduce((somme, m) => somme + m.total, 0);

    // La structure n'est reconstruite que si la fenêtre de 6 mois a changé
    if (moisAffiches.join('|') !== serie.map((m) => m.cle).join('|')) construireBarres(serie);

    // Mise à jour en place : le focus clavier reste sur la colonne cliquée
    Array.prototype.forEach.call(barres.children, (bouton, i) => {
      const m = serie[i];
      bouton.className = 'barre' + (m.courant ? ' barre-courant' : '');
      bouton.setAttribute('aria-pressed', String(etat.mois === m.cle));

      const part = maximum > 0 ? (m.total / maximum) * 100 : 0;
      bouton.querySelector('.barre-val').textContent = montantBarre(m.total);
      bouton.querySelector('.barre-jauge').style.height =
        m.total > 0 ? Math.max(part, 4) + '%' : '0%';
      bouton.querySelector('.barre-mois').textContent = moisCourt(m.cle);
      /* Complète le nom (« 0 Mai » + année et sémantique) sans aria-label :
         le texte visible reste un préfixe exact du nom accessible. */
      bouton.querySelector('.sr-only').textContent =
        ' ' + moisLong(m.cle).split(' ').pop() + ' — total des dépenses';
    });

    // Ligne de lecture, mise à jour à chaque rendu
    if (etat.mois) {
      const mois = serie.filter((m) => m.cle === etat.mois);
      const total = mois.length ? mois[0].total : 0;
      const nb = etat.depenses.filter((d) => cleMois(d.date) === etat.mois).length;
      lectureGraph.innerHTML = '<strong>' + moisLong(etat.mois) + '</strong> : ' +
        fmtMAD.format(total) + ' · ' + nb + (nb > 1 ? ' dépenses' : ' dépense');
    } else {
      lectureGraph.innerHTML = 'Aucun mois sélectionné · total des ' + NB_MOIS +
        ' derniers mois : <strong>' + fmtMAD.format(totalSerie) + '</strong>';
    }
  }

  /* ------------------------------------------------------------------
     11. Rendu : répartition par catégorie (sur toutes les données)
     ------------------------------------------------------------------ */
  function rendreRepartition() {
    const total = totalDe(etat.depenses);
    const parCategorie = CATEGORIES
      .map((nom) => ({
        nom: nom,
        total: totalDe(etat.depenses.filter((d) => d.categorie === nom))
      }))
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total);

    repartition.innerHTML = '';

    if (parCategorie.length === 0) {
      repartitionVide.hidden = false;
      return;
    }
    repartitionVide.hidden = true;

    parCategorie.forEach((c) => {
      const part = total > 0 ? (c.total / total) * 100 : 0;

      const li = document.createElement('li');
      li.className = 'cat-ligne';

      const tete = document.createElement('div');
      tete.className = 'cat-tete';

      const nom = document.createElement('span');
      nom.className = 'cat-nom';
      nom.textContent = c.nom;

      const valeur = document.createElement('span');
      valeur.className = 'cat-val';
      valeur.textContent = fmtMAD.format(c.total);
      const pourcentage = document.createElement('span');
      pourcentage.className = 'cat-part';
      pourcentage.textContent = fmtEntier.format(Math.round(part)) + ' %';
      valeur.appendChild(pourcentage);

      const piste = document.createElement('div');
      piste.className = 'cat-piste';
      const jauge = document.createElement('span');
      jauge.className = 'cat-jauge';
      jauge.style.width = part.toFixed(2) + '%';
      piste.appendChild(jauge);

      tete.append(nom, valeur);
      li.append(tete, piste);
      repartition.appendChild(li);
    });
  }

  /* ------------------------------------------------------------------
     11 bis. Rendu : budgets par catégorie (enveloppe mensuelle)
     ------------------------------------------------------------------ */
  /** Mois lu par les budgets et l'anneau : le mois filtré, sinon le mois en cours. */
  function moisAffiche() {
    return etat.mois || cleMois(aujourdHuiISO());
  }

  /** Totaux d'un mois donné, par catégorie. */
  function totauxDuMois(cle) {
    const totaux = {};
    etat.depenses.forEach((d) => {
      if (cleMois(d.date) !== cle) return;
      totaux[d.categorie] = (totaux[d.categorie] || 0) + d.montant;
    });
    return totaux;
  }

  /** Identifiant DOM stable d'une catégorie (« Santé » -> « budget-sante »). */
  function identifiantBudget(cat) {
    return 'budget-' + cat.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  let lignesBudgets = []; // une référence DOM par catégorie, construite une seule fois

  /**
   * Construit les lignes une seule fois : une saisie en cours n'est jamais
   * reconstruite, le focus et le curseur restent donc en place.
   */
  function construireBudgets() {
    zoneBudgets.innerHTML = '';
    lignesBudgets = CATEGORIES.map((cat) => {
      const id = identifiantBudget(cat);
      const enregistre = etat.budgets[cat];

      const ligne = document.createElement('div');
      ligne.className = 'budget-ligne';

      const tete = document.createElement('div');
      tete.className = 'budget-tete';

      // Le libellé de catégorie sert d'étiquette au champ de saisie
      const nom = document.createElement('label');
      nom.className = 'budget-nom';
      nom.setAttribute('for', id);
      nom.textContent = cat;

      const champ = document.createElement('div');
      champ.className = 'budget-champ';

      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'budget-input';
      input.id = id;
      input.min = '0';
      input.step = '10';
      input.placeholder = '0';
      input.setAttribute('inputmode', 'decimal');
      input.setAttribute('aria-describedby', id + '-erreur');
      input.value = enregistre ? String(enregistre) : '';

      const unite = document.createElement('span');
      unite.className = 'budget-unite';
      unite.textContent = 'MAD/mois';

      champ.append(input, unite);
      tete.append(nom, champ);

      const erreur = document.createElement('p');
      erreur.className = 'budget-erreur erreur';
      erreur.id = id + '-erreur';
      erreur.hidden = true;

      const suivi = document.createElement('div');
      suivi.className = 'budget-suivi';

      const piste = document.createElement('div');
      piste.className = 'budget-piste';
      const jauge = document.createElement('span');
      jauge.className = 'budget-jauge';
      piste.appendChild(jauge);

      const info = document.createElement('p');
      info.className = 'budget-info';
      const etatLigne = document.createElement('span');
      etatLigne.className = 'budget-etat';
      const detail = document.createElement('span');
      detail.className = 'budget-detail';
      // Variation du mois affiché par rapport au mois précédent (masquée sans historique)
      const variation = document.createElement('span');
      variation.className = 'variation';
      variation.hidden = true;
      info.append(etatLigne, detail, variation);

      suivi.append(piste, info);
      ligne.append(tete, erreur, suivi);
      zoneBudgets.appendChild(ligne);

      return { cat: cat, ligne: ligne, input: input, erreur: erreur, suivi: suivi, jauge: jauge, etat: etatLigne, detail: detail, variation: variation };
    });
  }

  /** Met à jour jauges, états et légendes (jamais le champ en cours de saisie). */
  function rendreBudgets() {
    if (lignesBudgets.length !== CATEGORIES.length) construireBudgets();

    const actif = document.activeElement;
    const moisCourantBudget = moisAffiche();
    const parCategorie = totauxDuMois(moisCourantBudget);
    const parCategoriePrec = totauxDuMois(decalerMois(moisCourantBudget, -1));

    lignesBudgets.forEach((ref) => {
      const budget = etat.budgets[ref.cat] || 0;
      const depense = parCategorie[ref.cat] || 0;
      const pourcent = budget > 0 ? (depense / budget) * 100 : 0;

      // Le champ n'est corrigé que s'il ne reflète plus le budget enregistré,
      // et jamais pendant la saisie : le texte tapé et le curseur restent intacts.
      const texte = ref.input.value.trim();
      const nombre = texte === '' ? NaN : Number(texte.replace(',', '.'));
      const affiche = isFinite(nombre) && nombre > 0 ? nombre : 0;
      if (ref.input !== actif && affiche !== budget) {
        ref.input.value = budget > 0 ? String(budget) : '';
      }

      let cle = '';
      if (budget > 0) {
        if (depense > budget * (SEUIL_DEPASSE / 100)) cle = 'depasse';
        else if (depense >= budget * (SEUIL_ATTENTION / 100)) cle = 'attention';
      }
      if (cle) ref.suivi.dataset.etat = cle;
      else delete ref.suivi.dataset.etat;

      ref.jauge.style.width = (budget > 0 ? Math.min(pourcent, 100) : 0).toFixed(2) + '%';

      if (budget > 0) {
        ref.etat.textContent = cle === 'depasse' ? 'Budget dépassé'
          : cle === 'attention' ? 'À surveiller'
            : 'Dans le budget';
        ref.detail.textContent = fmtMAD.format(depense) + ' sur ' + fmtMAD.format(budget) +
          ' (' + fmtEntier.format(Math.floor(pourcent)) + ' %)';
      } else {
        ref.etat.textContent = 'Aucun budget';
        ref.detail.textContent = 'Dépensé : ' + fmtMAD.format(depense);
      }

      // Variation mensuelle de la catégorie : mois affiché contre mois précédent
      ecrireVariation(
        ref.variation,
        calculerVariation(depense, parCategoriePrec[ref.cat] || 0),
        'par rapport au mois précédent'
      );
    });

    zoneBudgetsVide.hidden = Object.keys(etat.budgets).length > 0;
  }

  /** Écrit les budgets, ou supprime la clé quand plus aucun budget n'est défini. */
  function memoriserBudgets() {
    if (Object.keys(etat.budgets).length === 0) stockage.supprimer(CLE_BUDGETS);
    else stockage.ecrire(CLE_BUDGETS, etat.budgets);
  }

  /** Enregistre la saisie d'une ligne (vide, 0 ou négatif retire l'enveloppe). */
  function enregistrerBudget(ref, brut) {
    const nombre = brut === '' ? NaN : Number(brut.replace(',', '.'));
    const valide = isFinite(nombre) && nombre > 0;
    const negatif = isFinite(nombre) && nombre < 0;

    ref.erreur.textContent = negatif ? 'Le budget ne peut pas être négatif.' : '';
    ref.erreur.hidden = !negatif;

    const avant = etat.budgets[ref.cat] || 0;
    if (valide) etat.budgets[ref.cat] = Math.round(nombre * 100) / 100;
    else delete etat.budgets[ref.cat];

    if ((etat.budgets[ref.cat] || 0) !== avant) memoriserBudgets();
    rendreBudgets();
  }

  function gererSaisieBudget(evenement) {
    const ligne = evenement.target.closest ? evenement.target.closest('.budget-ligne') : null;
    if (!ligne) return;
    const ref = lignesBudgets[Array.prototype.indexOf.call(zoneBudgets.children, ligne)];
    if (!ref) return;
    enregistrerBudget(ref, ref.input.value.trim());
  }

  /* ------------------------------------------------------------------
     11 ter. Rendu : répartition du mois (anneau conique + légende)
     ------------------------------------------------------------------ */
  function rendreDonut() {
    const mois = moisAffiche();
    const parCategorie = totauxDuMois(mois);

    // Une part par catégorie dépensée, de la plus forte à la plus faible
    const parts = CATEGORIES
      .map((nom, i) => ({ nom: nom, couleur: i + 1, total: parCategorie[nom] || 0 }))
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total || a.couleur - b.couleur);
    const totalMois = parts.reduce((somme, c) => somme + c.total, 0);

    donutNote.textContent = moisLong(mois) + (etat.mois ? '' : ' · mois en cours');
    donutLegende.innerHTML = '';
    donutTotal.textContent = fmtEntier.format(totalMois);

    if (totalMois <= 0) {
      donut.style.background = 'var(--accent-doux)'; // anneau neutre, aucune part
      donutVide.hidden = false;
      return;
    }
    donutVide.hidden = true;

    // Anneau : parts cumulées, dans le même ordre que la légende
    const morceaux = [];
    let angle = 0;
    parts.forEach((c, i) => {
      const debut = angle;
      angle += (c.total / totalMois) * 360;
      const fin = i === parts.length - 1 ? 360 : angle; // anneau fermé, sans liseré
      morceaux.push('var(--cat-' + c.couleur + ') ' + debut.toFixed(3) + 'deg ' + fin.toFixed(3) + 'deg');
    });
    donut.style.background = 'conic-gradient(from -90deg, ' + morceaux.join(', ') + ')';

    parts.forEach((c) => {
      const li = document.createElement('li');
      li.className = 'legende-ligne';

      const puce = document.createElement('span');
      puce.className = 'legende-puce c-' + c.couleur;
      puce.setAttribute('aria-hidden', 'true');

      const nom = document.createElement('span');
      nom.className = 'legende-nom';
      nom.textContent = c.nom;

      const valeur = document.createElement('span');
      valeur.className = 'legende-val';
      valeur.textContent = fmtMAD.format(c.total);

      const part = document.createElement('span');
      part.className = 'legende-part';
      part.textContent = fmtEntier.format(Math.round((c.total / totalMois) * 100)) + ' %';
      valeur.appendChild(part);

      li.append(puce, nom, valeur);
      donutLegende.appendChild(li);
    });
  }

  /* ------------------------------------------------------------------
     12. Rendu : puces de filtre par catégorie
     ------------------------------------------------------------------ */
  function construirePuces() {
    const options = [''].concat(CATEGORIES); // '' = « Toutes »
    puces.innerHTML = '';
    options.forEach((cat) => {
      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.className = 'puce';
      bouton.dataset.cat = cat;
      bouton.textContent = cat === '' ? 'Toutes' : cat;
      bouton.setAttribute('aria-pressed', String(etat.categorie === (cat === '' ? null : cat)));
      puces.appendChild(bouton);
    });
  }

  function majPuces() {
    Array.prototype.forEach.call(puces.querySelectorAll('.puce'), (bouton) => {
      const cat = bouton.dataset.cat === '' ? null : bouton.dataset.cat;
      bouton.setAttribute('aria-pressed', String(etat.categorie === cat));
    });
  }

  /* ------------------------------------------------------------------
     13. Rendu : liste des dépenses
     ------------------------------------------------------------------ */
  const minuteurs = new Map(); // bouton de suppression -> minuteur d'annulation

  function annulerMinuteurs() {
    minuteurs.forEach((t) => clearTimeout(t));
    minuteurs.clear();
  }

  function rendreListe() {
    const filtrees = depensesFiltrees();
    const aucuneDonnee = etat.depenses.length === 0;

    annulerMinuteurs(); // les boutons armés disparaissent au re-rendu
    liste.innerHTML = '';

    if (filtrees.length === 0) {
      listeVide.hidden = false;
      listeVide.textContent = aucuneDonnee
        ? 'Aucune dépense pour le moment.'
        : 'Aucune dépense ne correspond à ce filtre.';
    } else {
      listeVide.hidden = true;
    }

    filtrees.forEach((d) => {
      const jour = dateDepuisISO(d.date);

      const li = document.createElement('li');
      li.className = 'depense';

      // Bloc principal : libellé + date + catégorie
      const principal = document.createElement('div');
      principal.className = 'depense-principal';

      const libelle = document.createElement('span');
      libelle.className = 'depense-libelle';
      libelle.textContent = d.libelle;

      const meta = document.createElement('span');
      meta.className = 'depense-meta';

      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = d.categorie;

      const time = document.createElement('time');
      time.dateTime = d.date;
      time.textContent = jour ? fmtDate.format(jour) : d.date;

      meta.append(badge, time);
      principal.append(libelle, meta);

      // Montant
      const montant = document.createElement('span');
      montant.className = 'depense-montant';
      montant.textContent = fmtMAD.format(d.montant);

      // Bouton de suppression (confirmation en deux temps)
      const suppr = document.createElement('button');
      suppr.type = 'button';
      suppr.className = 'bouton-suppr';
      suppr.dataset.id = d.id;
      suppr.dataset.libelle = d.libelle;
      suppr.setAttribute('aria-label', 'Supprimer ' + d.libelle);

      const icone = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icone.setAttribute('class', 'icone');
      icone.setAttribute('aria-hidden', 'true');
      icone.setAttribute('focusable', 'false');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#i-corbeille');
      icone.appendChild(use);

      const texte = document.createElement('span');
      texte.className = 'suppr-texte';
      texte.textContent = 'Supprimer';

      suppr.append(icone, texte);
      li.append(principal, montant, suppr);
      liste.appendChild(li);
    });

    rendreBandeau(filtrees);
  }

  function rendreBandeau(filtrees) {
    const total = totalDe(filtrees);
    const n = filtrees.length;
    const totalGeneral = etat.depenses.length;

    const morceauNombre = '<strong>' + n + '</strong> ' + (n > 1 ? 'dépenses' : 'dépense');
    if (filtreActif()) {
      resumeListe.innerHTML = morceauNombre + ' affichée' + (n > 1 ? 's' : '') +
        ' sur ' + totalGeneral + ' · total <strong>' + fmtMAD.format(total) + '</strong>';
    } else {
      resumeListe.innerHTML = morceauNombre + ' · total <strong>' + fmtMAD.format(total) + '</strong>';
    }

    boutonToutAfficher.hidden = !filtreActif();
    boutonExport.disabled = n === 0;
  }

  /* ------------------------------------------------------------------
     14. Rendu global
     ------------------------------------------------------------------ */
  function rendre() {
    rendreTuiles();
    rendreGraphique();
    rendreRepartition();
    rendreBudgets();
    rendreDonut();
    majPuces();
    rendreListe();
  }

  function annoncer(message) { statut.textContent = message; }

  /* ------------------------------------------------------------------
     15. Formulaire d'ajout
     ------------------------------------------------------------------ */
  function remplirCategories() {
    champCategorie.innerHTML = '';
    CATEGORIES.forEach((cat) => {
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      champCategorie.appendChild(option);
    });
    champCategorie.value = 'Alimentation';
  }

  function afficherErreur(champ, cle, message) {
    erreurs[cle].textContent = message;
    erreurs[cle].hidden = false;
    champ.setAttribute('aria-invalid', 'true');
  }

  function effacerErreur(champ, cle) {
    erreurs[cle].textContent = '';
    erreurs[cle].hidden = true;
    champ.removeAttribute('aria-invalid');
  }

  function effacerErreurs() {
    effacerErreur(champLibelle, 'libelle');
    effacerErreur(champMontant, 'montant');
    effacerErreur(champDate, 'date');
  }

  function ajouterDepense(evenement) {
    evenement.preventDefault();
    effacerErreurs();

    const libelle = champLibelle.value.trim();
    const montantBrut = champMontant.value.trim().replace(',', '.');
    const montant = Number(montantBrut);
    const date = champDate.value;

    let premierFautif = null;

    if (libelle === '') {
      afficherErreur(champLibelle, 'libelle', 'Indiquez un libellé.');
      premierFautif = premierFautif || champLibelle;
    }
    if (montantBrut === '' || !isFinite(montant) || montant <= 0) {
      afficherErreur(champMontant, 'montant', 'Saisissez un montant supérieur à 0.');
      premierFautif = premierFautif || champMontant;
    }
    if (!dateDepuisISO(date)) {
      afficherErreur(champDate, 'date', 'Choisissez une date valide.');
      premierFautif = premierFautif || champDate;
    }

    if (premierFautif) {
      premierFautif.focus();
      annoncer('Le formulaire contient une erreur.');
      return;
    }

    etat.depenses.push({
      id: nouvelId(),
      libelle: libelle,
      montant: Math.round(montant * 100) / 100,
      categorie: champCategorie.value,
      date: date
    });
    sauver();

    // Réinitialisation du formulaire
    form.reset();
    champDate.value = aujourdHuiISO();
    champCategorie.value = 'Alimentation';
    champLibelle.focus();

    rendre();

    // Si l'ajout est masqué par un filtre actif, on le signale
    const visible = depensesFiltrees().some((d) => d.libelle === libelle && d.date === date);
    annoncer(visible
      ? 'Dépense ajoutée : ' + libelle + '.'
      : 'Dépense ajoutée : ' + libelle + ' (masquée par le filtre actif).');
  }

  /* ------------------------------------------------------------------
     16. Suppression en deux temps (jamais de confirm())
     ------------------------------------------------------------------ */
  function desarmerSuppression(bouton) {
    const t = minuteurs.get(bouton);
    if (t) { clearTimeout(t); minuteurs.delete(bouton); }
    if (!bouton.isConnected) return;

    delete bouton.dataset.confirme;
    bouton.classList.remove('bouton-suppr-arme');
    const texte = bouton.querySelector('.suppr-texte');
    if (texte) texte.textContent = 'Supprimer';
    bouton.setAttribute('aria-label', 'Supprimer ' + (bouton.dataset.libelle || 'la dépense'));
  }

  function gererClicListe(evenement) {
    const bouton = evenement.target.closest('.bouton-suppr');
    if (!bouton) return;

    const libelle = bouton.dataset.libelle || 'la dépense';

    // Premier clic : on arme la confirmation
    if (bouton.dataset.confirme !== '1') {
      bouton.dataset.confirme = '1';
      bouton.classList.add('bouton-suppr-arme');
      const texte = bouton.querySelector('.suppr-texte');
      if (texte) texte.textContent = 'Confirmer';
      bouton.setAttribute('aria-label', 'Confirmer la suppression de ' + libelle);
      annoncer('Cliquez de nouveau pour confirmer la suppression de ' + libelle + '.');
      minuteurs.set(bouton, setTimeout(() => desarmerSuppression(bouton), DELAI_CONFIRMATION));
      return;
    }

    // Second clic : suppression effective
    desarmerSuppression(bouton);
    etat.depenses = etat.depenses.filter((d) => d.id !== bouton.dataset.id);
    sauver();
    rendre();
    annoncer('Dépense supprimée : ' + libelle + '.');
  }

  /* ------------------------------------------------------------------
     17. Filtres
     ------------------------------------------------------------------ */
  function basculerMois(cle) {
    etat.mois = etat.mois === cle ? null : cle;
    rendre();
    annoncer(etat.mois ? 'Liste filtrée sur ' + moisLong(etat.mois) + '.' : 'Filtre de mois retiré.');
  }

  function definirCategorie(cat) {
    etat.categorie = cat;
    rendre();
    annoncer(cat ? 'Liste filtrée sur la catégorie ' + cat + '.' : 'Toutes les catégories affichées.');
  }

  function toutAfficher() {
    if (!filtreActif()) return;
    etat.mois = null;
    etat.categorie = null;
    rendre();
    annoncer('Tous les filtres ont été retirés.');
  }

  /* ------------------------------------------------------------------
     18. Export CSV (dépenses filtrées)
     ------------------------------------------------------------------ */
  function echapperCsv(valeur) {
    return '"' + String(valeur).replace(/"/g, '""') + '"';
  }

  function exporterCsv() {
    const lignes = depensesFiltrees();
    if (lignes.length === 0) return;

    const entete = ['date', 'libelle', 'categorie', 'montant'].map(echapperCsv).join(';');
    const corps = lignes.map((d) => [
      d.date,
      d.libelle,
      d.categorie,
      d.montant.toFixed(2).replace('.', ',')
    ].map(echapperCsv).join(';'));

    // BOM UTF-8 : accents corrects à l'ouverture dans un tableur
    const contenu = '\uFEFF' + [entete].concat(corps).join('\r\n');
    const blob = new Blob([contenu], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const lien = document.createElement('a');
    lien.href = url;
    lien.download = 'depenses-' + aujourdHuiISO() + '.csv';
    lien.style.display = 'none';
    document.body.appendChild(lien);
    lien.click();
    lien.remove();

    // L'URL objet est libérée une fois le téléchargement amorcé
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    annoncer(lignes.length + (lignes.length > 1 ? ' dépenses exportées' : ' dépense exportée') + ' en CSV.');
  }

  /* ------------------------------------------------------------------
     19. Thème clair / sombre
     ------------------------------------------------------------------ */
  function appliquerTheme(sombre, memoriser) {
    corps.classList.toggle('sombre', sombre);
    boutonTheme.setAttribute('aria-pressed', String(sombre));
    boutonTheme.setAttribute('aria-label', sombre ? 'Passer au thème clair' : 'Passer au thème sombre');
    if (memoriser) stockage.ecrire(CLE_THEME, sombre);
  }

  function themeInitial() {
    const enregistre = stockage.lire(CLE_THEME, null);
    if (typeof enregistre === 'boolean') return enregistre;
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  /* ------------------------------------------------------------------
     20. Initialisation
     ------------------------------------------------------------------ */
  function initialiser() {
    $('annee').textContent = String(new Date().getFullYear());

    appliquerTheme(themeInitial(), false);
    boutonTheme.addEventListener('click', () => {
      appliquerTheme(!corps.classList.contains('sombre'), true);
    });

    remplirCategories();
    champDate.value = aujourdHuiISO();
    construirePuces();

    form.addEventListener('submit', ajouterDepense);
    // Une saisie corrigée efface son message d'erreur
    champLibelle.addEventListener('input', () => effacerErreur(champLibelle, 'libelle'));
    champMontant.addEventListener('input', () => effacerErreur(champMontant, 'montant'));
    champDate.addEventListener('change', () => effacerErreur(champDate, 'date'));

    barres.addEventListener('click', (evenement) => {
      const colonne = evenement.target.closest('.barre');
      if (colonne) basculerMois(colonne.dataset.mois);
    });

    puces.addEventListener('click', (evenement) => {
      const puce = evenement.target.closest('.puce');
      if (puce) definirCategorie(puce.dataset.cat === '' ? null : puce.dataset.cat);
    });

    liste.addEventListener('click', gererClicListe);
    boutonToutAfficher.addEventListener('click', toutAfficher);
    boutonExport.addEventListener('click', exporterCsv);

    // Budgets : la jauge suit la frappe, la valeur est mémorisée aussitôt
    zoneBudgets.addEventListener('input', gererSaisieBudget);
    zoneBudgets.addEventListener('change', gererSaisieBudget);

    // Le thème suit le système tant que l'utilisateur n'a rien choisi
    if (typeof stockage.lire(CLE_THEME, null) !== 'boolean' && window.matchMedia) {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const suivi = (e) => appliquerTheme(e.matches, false);
      if (media.addEventListener) media.addEventListener('change', suivi);
      else if (media.addListener) media.addListener(suivi);
    }

    rendre();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialiser);
  } else {
    initialiser();
  }
})();
