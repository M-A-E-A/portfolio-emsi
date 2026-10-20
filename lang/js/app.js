/* =====================================================================
   Application — éditeur, arbre syntaxique, débogueur.
   ---------------------------------------------------------------------
   Trois zones :
   - l'éditeur (le code source) ;
   - l'arbre syntaxique, dessiné en SVG, où le nœud courant s'allume ;
   - le panneau des variables et de la console.
   ===================================================================== */
(function (global) {
  'use strict';

  const Lume = global.Lume;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const CLE_THEME = 'lang-theme';

  const EXEMPLES = {
    fibonacci: `// La suite de Fibonacci, écrite récursivement.
fn fibonacci(n) {
  if (n < 2) {
    return n;
  }
  return fibonacci(n - 1) + fibonacci(n - 2);
}

print("fib(10) =", fibonacci(10));
print("fib(15) =", fibonacci(15));`,

    liste: `// Les listes : concaténation, indexation, parcours.
fn somme(liste) {
  let total = 0;
  let i = 0;
  while (i < len(liste)) {
    total = total + liste[i];
    i = i + 1;
  }
  return total;
}

let nombres = [4, 8, 15, 16, 23, 42];
print("somme =", somme(nombres));
print("moyenne =", somme(nombres) / len(nombres));
print("concaténation =", nombres + [1, 2, 3]);`,

    closures: `// Les fermetures : une fonction qui garde son environnement.
fn creerCompteur(depart) {
  let compte = depart;
  return fn() {
    compte = compte + 1;
    return compte;
  };
}

let compteur = creerCompteur(10);
print(compteur());
print(compteur());
print(compteur());

let autre = creerCompteur(100);
print(autre());`,

    erreurs: `// Le débogueur s'arrête sur chaque instruction.
// Utilise « Pas à pas » pour suivre l'exécution noeud par noeud.
let total = 0;
let i = 1;
while (i <= 5) {
  total = total + i * i;
  i = i + 1;
}
print("total =", total);
print("la variable total vaut", total);
`,
  };

  const etat = {
    programme: null,
    execution: null,
    evenements: [],
    nbEvenements: 0,   // nombre d'événements déjà consommés
    dernierEvenement: null,
    rafale: false,     // true pendant une exécution découpée en tranches
    generation: 0,     // incrémentée à chaque nouveau programme
    curseur: 0,      // index de l'événement courant dans la liste
    arbre: null,
    noeudCourant: null,
    pointsArret: new Set(),
    enCours: false,
    zoom: 100,
  };

  /* ---------------------------------------------------------------- */
  /* Construction de l'arbre affichable                                */
  /* ---------------------------------------------------------------- */

  /** Libellé court d'un nœud, affiché dans l'arbre. */
  function libelle(noeud) {
    switch (noeud.type) {
      case 'Programme': return 'Programme';
      case 'Nombre': return String(noeud.valeur);
      case 'Chaine': return '"' + noeud.valeur + '"';
      case 'Booleen': return noeud.valeur ? 'vrai' : 'faux';
      case 'Null': return 'null';
      case 'Identifiant': return noeud.nom;
      case 'Affectation': return noeud.nom + ' =';
      case 'ExpressionBinaire':
      case 'ExpressionLogique': return noeud.operateur;
      case 'ExpressionUnaire': return noeud.operateur;
      case 'AppelFonction': return 'appel';
      case 'AccesIndex': return '[]';
      case 'Liste': return 'liste';
      case 'Bloc': return '{ }';
      case 'InstructionSi': return 'si';
      case 'InstructionTantQue': return 'tant que';
      case 'DeclarationFonction': return 'fn ' + noeud.nom;
      case 'InstructionRetour': return 'retour';
      case 'InstructionExpression': return 'expr';
      case 'InstructionVide': return ';';
      default: return noeud.type;
    }
  }

  /** Liste des enfants d'un nœud, dans l'ordre d'évaluation. */
  function enfants(noeud) {
    const e = [];
    const ajouter = (nom, n) => { if (n) e.push({ nom, noeud: n }); };
    switch (noeud.type) {
      case 'Programme':
      case 'Bloc':
        noeud.corps.forEach((n, i) => ajouter('', n));
        break;
      case 'InstructionExpression': ajouter('expr', noeud.expression); break;
      case 'InstructionSi':
        ajouter('si', noeud.test);
        ajouter('alors', noeud.consequent);
        ajouter('sinon', noeud.alternate);
        break;
      case 'InstructionTantQue':
        ajouter('tant que', noeud.test);
        ajouter('faire', noeud.corps);
        break;
      case 'DeclarationFonction':
        ajouter('corps', noeud.corps);
        break;
      case 'InstructionRetour': ajouter('valeur', noeud.argument); break;
      case 'Affectation': ajouter('valeur', noeud.valeur); break;
      case 'ExpressionBinaire':
      case 'ExpressionLogique':
        ajouter('gauche', noeud.gauche);
        ajouter('droite', noeud.droite);
        break;
      case 'ExpressionUnaire': ajouter('opérande', noeud.argument); break;
      case 'AppelFonction':
        ajouter('appelé', noeud.callee);
        noeud.arguments.forEach((a) => ajouter('argument', a));
        break;
      case 'AccesIndex':
        ajouter('objet', noeud.objet);
        ajouter('index', noeud.index);
        break;
      case 'Liste': noeud.elements.forEach((a) => ajouter('élément', a)); break;
      default: break;
    }
    return e;
  }

  /** Construit l'arbre affichable et calcule la position de chaque nœud. */
  function construireArbre(programme) {
    const noeuds = [];

    function visiter(noeud, parent, etiquette, profondeur) {
      const element = {
        noeud,
        parent,
        etiquette,
        profondeur,
        fils: [],
        x: 0,
        y: profondeur,
        largeur: 0,
      };
      noeuds.push(element);
      const enfants_ = enfants(noeud);
      element.fils = enfants_.map((e) => visiter(e.noeud, element, e.nom, profondeur + 1));
      return element;
    }

    const racine = visiter(programme, null, '', 0);
    elementLargeur(racine);

    // Positionnement « tidier » : les feuilles se placent de gauche à
    // droite, chacune prenant la place de son libellé ; un parent se
    // centre sur ses enfants. L'arbre reste ainsi compact.
    let curseur = 0;
    const ecart = 18;
    function placer(element) {
      if (!element.fils.length) {
        element.x = curseur + element.largeur / 2;
        curseur += element.largeur + ecart;
        return element;
      }
      element.fils.forEach(placer);
      const premier = element.fils[0];
      const dernier = element.fils[element.fils.length - 1];
      element.x = (premier.x - premier.largeur / 2 + dernier.x + dernier.largeur / 2) / 2;
      return element;
    }
    placer(racine);

    return { racine, noeuds };
  }

  function elementLargeur(element) {
    const texte = libelle(element.noeud);
    element.largeur = Math.max(56, 26 + texte.length * 7.2);
    if (element.fils) element.fils.forEach(elementLargeur);
  }

  /* ---------------------------------------------------------------- */
  /* Dessin de l'arbre                                                 */
  /* ---------------------------------------------------------------- */

  function dessinerArbre() {
    const hote = $('#arbre');
    if (!etat.arbre) {
      hote.innerHTML = '<p class="arbre-vide">Analysez un programme pour voir son arbre syntaxique.</p>';
      return;
    }

    const { racine, noeuds } = etat.arbre;
    const largeurNoeud = (e) => e.largeur;

    let minX = Infinity;
    let maxX = -Infinity;
    for (const e of noeuds) {
      minX = Math.min(minX, e.x - largeurNoeud(e) / 2);
      maxX = Math.max(maxX, e.x + largeurNoeud(e) / 2);
    }
    const marge = 24;
    const largeur = maxX - minX + marge * 2;
    const hauteur = (racine.profondeurMax || profondeurMax(racine)) * 44 + 60;

    const parties = [];
    for (const e of noeuds) {
      const x = e.x - minX + marge;
      const y = e.y * 44 + 26;
      if (e.parent) {
        const px = e.parent.x - minX + marge;
        const py = e.parent.y * 44 + 26;
        parties.push('<path class="arbre-lien" d="M' + px + ' ' + (py + 13) + ' V' + (y - 13) + '" />');
        if (e.etiquette) {
          parties.push('<text class="arbre-etiquette" x="' + (px + 5) + '" y="' + ((py + y) / 2) + '">' + echapper(e.etiquette) + '</text>');
        }
      }
    }
    for (const e of noeuds) {
      const x = e.x - minX + marge;
      const y = e.y * 44 + 26;
      const classes = ['arbre-noeud'];
      if (etat.noeudCourant === e.noeud) classes.push('actif');
      if (etat.pointsArret.has(e.noeud)) classes.push('point-arret');
      const texte = libelle(e.noeud);
      const largeurBoite = largeurNoeud(e);
      parties.push(
        '<g class="' + classes.join(' ') + '" data-noeud="' + indexNoeud(e.noeud) + '" tabindex="0" role="button" ' +
        'aria-label="' + echapper('Nœud ' + texte) + '">' +
        '<rect x="' + (x - largeurBoite / 2) + '" y="' + (y - 13) + '" width="' + largeurBoite + '" height="26" rx="13" />' +
        '<text x="' + x + '" y="' + (y + 4) + '">' + echapper(texte) + '</text>' +
        '</g>'
      );
    }

    hote.innerHTML =
      '<svg class="arbre-svg" viewBox="0 0 ' + largeur + ' ' + hauteur + '" width="' + largeur + '" height="' + hauteur + '">' +
      parties.join('') +
      '</svg>';
    etat.largeurArbre = largeur;
    etat.hauteurArbre = hauteur;
    appliquerZoom();
  }

  /** Zoom appliqué à l'arbre : comme un zoom de navigateur. */
  function appliquerZoom() {
    const svg = document.querySelector('.arbre-svg');
    if (!svg || !etat.largeurArbre) return;
    const facteur = (etat.zoom || 100) / 100;
    svg.setAttribute('width', etat.largeurArbre * facteur);
    svg.setAttribute('height', etat.hauteurArbre * facteur);
  }

  function profondeurMax(element) {
    if (!element.fils || !element.fils.length) return element.profondeur;
    return Math.max(...element.fils.map(profondeurMax));
  }

  const indexNoeuds = new Map();
  function indexNoeud(noeud) {
    if (!indexNoeuds.has(noeud)) indexNoeuds.set(noeud, indexNoeuds.size);
    return indexNoeuds.get(noeud);
  }

  function echapper(texte) {
    return String(texte)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------------------------------------------------------------- */
  /* Exécution                                                         */
  /* ---------------------------------------------------------------- */

  function consoleLigne(texte, type) {
    const zone = $('#console');
    const ligne = document.createElement('p');
    ligne.className = 'console-ligne' + (type ? ' ' + type : '');
    ligne.textContent = texte;
    zone.appendChild(ligne);
    zone.scrollTop = zone.scrollHeight;
  }

  function rafraichirVariables() {
    const zone = $('#variables');
    if (!etat.execution) {
      zone.innerHTML = '<p class="vide">Aucune exécution en cours.</p>';
      return;
    }
    const variables = etat.execution.environnement.instantane();
    if (!variables.length) {
      zone.innerHTML = '<p class="vide">Aucune variable pour l’instant.</p>';
      return;
    }
    zone.innerHTML = variables
      .map((v) => '<div class="variable"><span class="variable-nom">' + echapper(v.nom) + '</span><span class="variable-val">' + echapper(v.valeur) + '</span></div>')
      .join('');
  }

  function analyse() {
    const source = $('#code').value;
    $('#console').innerHTML = '';
    try {
      etat.programme = Lume.analyserSource(source);
    } catch (e) {
      etat.programme = null;
      etat.arbre = null;
      dessinerArbre();
      consoleLigne('✗ ' + e.message, 'erreur');
      return false;
    }
    etat.arbre = construireArbre(etat.programme);
    etat.noeudCourant = null;
    dessinerArbre();
    consoleLigne('✓ Analyse réussie — ' + etat.arbre.noeuds.length + ' nœuds.', 'succes');
    return true;
  }

  function preparer() {
    etat.execution = new Lume.Execution(etat.programme, (env) => {
      const native = (fn, nom) => { fn.natif = true; fn.nom = nom; return fn; };
      env.definir('print', native((...args) => {
        consoleLigne(args.map(Lume.formatAffiche).join(' '));
        return null;
      }, 'print'));
      env.definir('len', native((x) => (x === null || x === undefined ? 0 : x.length), 'len'));
      env.definir('abs', native(Math.abs, 'abs'));
      env.definir('floor', native(Math.floor, 'floor'));
      env.definir('ceil', native(Math.ceil, 'ceil'));
      env.definir('round', native(Math.round, 'round'));
      env.definir('sqrt', native(Math.sqrt, 'sqrt'));
      env.definir('min', native(Math.min, 'min'));
      env.definir('max', native(Math.max, 'max'));
      env.definir('random', native(Math.random, 'random'));
    });
    etat.execution.demarrer();
    etat.evenements = [];
    etat.nbEvenements = 0;
    etat.dernierEvenement = null;
    etat.rafale = false;
    etat.generation++;
    etat.curseur = 0;
    etat.noeudCourant = null;
    etat.enCours = true;
    rafraichirVariables();
    majBoutons();
  }

  /**
   * Avance d'un événement.
   * @param {boolean} silencieux  vrai pour ne pas redessiner l'arbre
   *        (utilisé pendant une exécution en rafale).
   */
  function avancer(silencieux) {
    if (!etat.execution) return;
    const evenement = etat.execution.pas();
    if (!evenement) return;
    etat.nbEvenements++;
    etat.dernierEvenement = evenement;

    // Pendant une rafale, la trace n'est pas conservée : elle ne serait
    // jamais rejouée et représenterait des dizaines de milliers d'objets
    // pour un simple Fibonacci récursif.
    if (!silencieux) {
      etat.evenements.push(evenement);
      if (etat.evenements.length > 2000) etat.evenements.shift();
    }

    if (evenement.noeud) etat.noeudCourant = evenement.noeud;
    if (evenement.evenement === 'erreur') {
      consoleLigne('✗ ' + evenement.message, 'erreur');
      etat.enCours = false;
    }
    if (evenement.evenement === 'fin') {
      consoleLigne('■ Fin du programme — valeur : ' + Lume.formatValeur(evenement.valeur), 'fin');
      etat.enCours = false;
    }

    // Pendant une exécution en rafale, on ne redessine l'arbre qu'une
    // fois à la fin : le redessiner à chaque nœud serait bien trop lent.
    if (!silencieux) {
      dessinerArbre();
      rafraichirVariables();
      majBoutons();
    }
  }

  /**
   * Fait tourner le programme jusqu'au bout.
   *
   * Le travail est découpé en tranches d'une douzaine de millisecondes,
   * séparées par une frame : la page reste réactive au lieu de se figer
   * pendant une seconde entière sur un Fibonacci récursif.
   */
  function continuer() {
    if (!etat.execution || !etat.enCours || etat.rafale) return;
    etat.rafale = true;
    const generation = etat.generation;
    majBoutons();

    let precedente = performance.now();

    function tranche() {
      // Si le programme a été remplacé entre-temps (nouvelle analyse),
      // cette rafale n'a plus lieu d'être.
      if (generation !== etat.generation) { etat.rafale = false; majBoutons(); return; }

      const debut = performance.now();
      let arrete = false;
      while (etat.enCours && performance.now() - debut < 12) {
        const avant = etat.nbEvenements;
        avancer(true);
        if (etat.nbEvenements === avant) { arrete = true; break; } // terminé
        const dernier = etat.dernierEvenement;
        // Arrêt à l'entrée d'un nœud portant un point d'arrêt.
        if (dernier && dernier.evenement === 'entree' && etat.pointsArret.has(dernier.noeud)) {
          arrete = true;
          break;
        }
      }
      if (arrete || !etat.enCours) {
        etat.rafale = false;
        dessinerArbre();
        rafraichirVariables();
        majBoutons();
        return;
      }
      // On laisse le navigateur peindre entre deux tranches. Si la frame
      // ne vient pas (onglet masqué, fenêtre occultée), on rebascule sur
      // un minuteur : le programme doit toujours aller jusqu'au bout.
      const maintenant = performance.now();
      if (maintenant - precedente > 120) {
        precedente = maintenant;
        setTimeout(tranche, 0);
      } else {
        requestAnimationFrame(tranche);
      }
    }

    requestAnimationFrame(tranche);
  }

  function majBoutons() {
    // Pendant une rafale, les deux boutons de pilotage sont inactifs :
    // la rafale possède déjà le programme.
    $('#bouton-pas').disabled = !etat.enCours || etat.rafale;
    $('#bouton-continuer').disabled = !etat.enCours || etat.rafale;
    $('#bouton-analyser').disabled = !etat.programme;
  }

  /* ---------------------------------------------------------------- */
  /* Interface                                                         */
  /* ---------------------------------------------------------------- */

  function brancherUI() {
    $('#bouton-analyser').addEventListener('click', () => {
      if (analyse()) preparer();
    });

    $('#bouton-pas').addEventListener('click', () => avancer(false));
    $('#bouton-continuer').addEventListener('click', continuer);

    $('#bouton-exemples').addEventListener('change', (e) => {
      const nom = e.target.value;
      if (!nom) return;
      $('#code').value = EXEMPLES[nom];
      if (analyse()) {
        preparer();
        continuer();
      }
      e.target.value = '';
    });

    // Points d'arrêt : un clic sur un nœud de l'arbre.
    $('#arbre').addEventListener('click', (e) => {
      const groupe = e.target.closest('[data-noeud]');
      if (!groupe) return;
      const noeud = noeudDepuisIndex(Number(groupe.dataset.noeud));
      if (!noeud) return;
      if (etat.pointsArret.has(noeud)) etat.pointsArret.delete(noeud);
      else etat.pointsArret.add(noeud);
      dessinerArbre();
    });

    $('#arbre').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const groupe = e.target.closest('[data-noeud]');
      if (!groupe) return;
      e.preventDefault();
      groupe.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    $('#bouton-reinit').addEventListener('click', () => {
      etat.pointsArret.clear();
      etat.evenements = [];
      etat.nbEvenements = 0;
      etat.dernierEvenement = null;
      etat.rafale = false;
      etat.generation++;
      etat.noeudCourant = null;
      if (analyse()) preparer();
    });

    // Zoom de l'arbre syntaxique
    $('#zoom').addEventListener('input', (e) => {
      etat.zoom = parseInt(e.target.value, 10);
      $('#zoom-val').textContent = etat.zoom + ' %';
      appliquerZoom();
    });
  }

  function noeudDepuisIndex(index) {
    if (!etat.arbre) return null;
    for (const e of etat.arbre.noeuds) {
      if (indexNoeud(e.noeud) === index) return e.noeud;
    }
    return null;
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
    $('#code').value = EXEMPLES.fibonacci;
    if (analyse()) {
      preparer();
      // Premier lancement : on joue le programme jusqu'au bout pour que
      // la console montre le résultat. « Réinitialiser » ramène à zéro.
      continuer();
    }
    majBoutons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer);
  } else {
    demarrer();
  }
})(window);
