/* =====================================================================
   Souk — logique de la boutique
   JavaScript « vanilla », sans module ni dépendance. Fonctionne en file://.
   Sommaire :
     1. Utilitaires
     2. Données du catalogue
     3. État
     4. Thème clair / sombre
     5. Catalogue (rendu, filtres, tri, prix, favoris)
     6. Avis des clients
     7. Fiche produit (modale, focus)
     8. Panier (rendu, quantités, totaux)
     9. Tiroir (ouverture, fermeture, piège de focus)
    10. Commande et confirmation
    11. Démarrage
   ===================================================================== */

(function () {
  'use strict';

  /* ------------------------- 1. Utilitaires ------------------------- */

  // Accès au localStorage protégé : il peut être bloqué en file:// ou en
  // navigation privée, d'où les try/catch systématiques.
  const stockage = {
    lire(cle, defaut) { try { const v = localStorage.getItem(cle); return v === null ? defaut : JSON.parse(v); } catch (e) { return defaut; } },
    ecrire(cle, valeur) { try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch (e) {} }
  };

  const $ = (id) => document.getElementById(id);
  const CLE_PANIER = 'boutique-panier';
  const CLE_THEME = 'souk-theme';
  const CLE_AVIS = 'boutique-avis';
  const CLE_FAVORIS = 'boutique-favoris';
  const SEUIL_LIVRAISON = 500;   // livraison offerte dès 500 MAD
  const FRAIS_LIVRAISON = 30;    // sinon 30 MAD

  // Échappe le texte inséré dans du HTML (par prudence).
  function echapper(txt) {
    return String(txt).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // Prix en MAD, chiffres tabulaires (l'espace est insécable).
  function formaterPrix(n) {
    return n.toLocaleString('fr-FR') + '\u00A0MAD';
  }

  // Normalise pour la recherche (minuscules, sans accents).
  function normaliser(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // Note à une décimale, virgule française : 4,3
  function formaterNote(n) {
    return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  // Date ISO -> « 14 février 2026 » (repli sur la valeur brute si invalide).
  function formaterDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Identifiant court, sans dépendance externe.
  function nouvelId(prefixe) {
    return prefixe + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  // Étoiles (5 au plus) : icônes décoratives, le sens passe par aria-label.
  function etoilesHTML(note, libelle) {
    const pleines = Math.max(0, Math.min(5, Math.round(note)));
    let html = '<span class="etoiles" role="img" aria-label="' + echapper(libelle) + '">';
    for (let i = 1; i <= 5; i += 1) {
      html += '<span class="etoile' + (i <= pleines ? ' etoile--pleine' : '')
        + '" aria-hidden="true"><svg><use href="#i-etoile"/></svg></span>';
    }
    return html + '</span>';
  }

  // Message annoncé aux lecteurs d'écran (zone aria-live dédiée).
  let minuteurAnnonce = null;
  function annoncer(texte) {
    const zone = $('annonce');
    if (!zone) return;
    zone.textContent = '';
    window.clearTimeout(minuteurAnnonce);
    minuteurAnnonce = window.setTimeout(function () { zone.textContent = texte; }, 80);
  }

  /* --------------------- 2. Données du catalogue -------------------- */

  const CATEGORIES = ['Cuisine', 'Textile', 'Luminaires', 'Décoration'];

  // Icône SVG (symbole) associée à chaque catégorie.
  const ICONE_CATEGORIE = {
    'Cuisine': '#i-cuisine',
    'Textile': '#i-textile',
    'Luminaires': '#i-luminaire',
    'Décoration': '#i-decoration'
  };

  // Motif de la vignette (dégradé CSS) par catégorie.
  const VIGNETTE_CATEGORIE = {
    'Cuisine': 'vignette--cuisine',
    'Textile': 'vignette--textile',
    'Luminaires': 'vignette--luminaires',
    'Décoration': 'vignette--decoration'
  };

  // Chaque article : nom, prix, catégorie, accroche (carte), description
  // détaillée (fiche), caractéristiques et stock disponible.
  const ARTICLES = [
    {
      id: 'theiere', nom: 'Théière en cuivre', prix: 180, categorie: 'Cuisine', stock: 8,
      accroche: "Cuivre martelé à la main, bec verseur fin et poignée torsadée.",
      description: "Théière en cuivre au fini martelé, pensée pour le thé à la menthe. "
        + "Le bec verseur fin limite les gouttes et la poignée torsadée reste facile à saisir. "
        + "Chaque pièce est un peu différente, le cuivre étant travaillé à la main.",
      details: {
        'Matière': 'Cuivre martelé',
        'Dimensions': 'Hauteur 22 cm · contenance 0,9 L',
        'Entretien': 'Lavage à la main, essuyer après usage',
        'Finition': 'Martelée'
      }
    },
    {
      id: 'plateau', nom: 'Plateau en cèdre', prix: 240, categorie: 'Cuisine', stock: 5,
      accroche: "Bois de cèdre massif, bord relevé, veinage naturel apparent.",
      description: "Plateau taillé dans une pièce de cèdre massif, avec un bord légèrement relevé. "
        + "Le veinage naturel varie d'un plateau à l'autre. "
        + "La surface est poncée puis huilée pour résister à l'usage quotidien.",
      details: {
        'Matière': 'Cèdre massif',
        'Dimensions': '42 × 30 × 3 cm',
        'Entretien': 'Essuyer avec un chiffon humide',
        'Finition': 'Huilée'
      }
    },
    {
      id: 'verres', nom: 'Verres à thé (x6)', prix: 150, categorie: 'Cuisine', stock: 14,
      accroche: "Six verres gravés, parfaits pour le thé à la menthe.",
      description: "Série de six verres à thé gravés d'un motif géométrique discret. "
        + "Le verre épais garde la chaleur plus longtemps et supporte les boissons chaudes. "
        + "Ils se rangent facilement et se lavent sans difficulté.",
      details: {
        'Matière': 'Verre',
        'Dimensions': 'Hauteur 11 cm · contenance 20 cl',
        'Entretien': 'Lavage à la main conseillé',
        'Finition': 'Gravée'
      }
    },
    {
      id: 'tapis', nom: 'Tapis berbère', prix: 950, categorie: 'Textile', stock: 3,
      accroche: "Laine nouée à la main, motifs géométriques des Beni Ouarain.",
      description: "Tapis en laine nouée à la main, aux motifs géométriques inspirés des tapis Beni Ouarain. "
        + "La laine épaisse apporte un confort chaud et s'use lentement. "
        + "Les teintes naturelles varient légèrement d'une pièce à l'autre.",
      details: {
        'Matière': 'Laine nouée main',
        'Dimensions': '200 × 140 cm',
        'Entretien': 'Aspirer sans brosse, nettoyage à sec',
        'Finition': 'Motifs géométriques'
      }
    },
    {
      id: 'coussin', nom: 'Coussin brodé', prix: 120, categorie: 'Textile', stock: 20,
      accroche: "Housse en coton, broderie au fil de soie, fermeture zippée.",
      description: "Coussin avec housse en coton et broderie au fil de soie. "
        + "La fermeture zippée permet de retirer la housse pour l'entretien. "
        + "Le garnissage est ferme, adapté à un canapé comme à un lit.",
      details: {
        'Matière': 'Coton, broderie fil de soie',
        'Dimensions': '45 × 45 cm',
        'Entretien': 'Housse déhoussable, lavage 30 °C',
        'Finition': 'Broderie'
      }
    },
    {
      id: 'lampe', nom: 'Lampe en laiton', prix: 320, categorie: 'Luminaires', stock: 6,
      accroche: "Laiton poli, lumière tamisée, interrupteur sur cordon.",
      description: "Lampe en laiton poli qui diffuse une lumière tamisée. "
        + "L'interrupteur se trouve sur le cordon, ce qui laisse le pied libre de tout bouton. "
        + "Elle éclaire un coin de salon ou une tête de lit.",
      details: {
        'Matière': 'Laiton poli',
        'Dimensions': 'Hauteur 38 cm · câble 1,8 m',
        'Entretien': 'Chiffon doux, produit non abrasif',
        'Finition': 'Polie'
      }
    },
    {
      id: 'lanterne', nom: 'Lanterne en fer forgé', prix: 280, categorie: 'Luminaires', stock: 9,
      accroche: "Fer forgé patiné, verre coloré, se pose ou se suspend.",
      description: "Lanterne en fer forgé patiné, montée avec des verres colorés. "
        + "Elle se pose sur une table ou se suspend grâce à son anneau. "
        + "La lumière filtrée dessine des motifs sur les murs.",
      details: {
        'Matière': 'Fer forgé, verre coloré',
        'Dimensions': 'Hauteur 30 cm · diamètre 16 cm',
        'Entretien': 'Chiffon sec',
        'Finition': 'Patinée'
      }
    },
    {
      id: 'miroir', nom: 'Miroir peint', prix: 410, categorie: 'Décoration', stock: 4,
      accroche: "Cadre en bois peint à la main, finition mat, accroche incluse.",
      description: "Miroir encadré d'un bois peint à la main, à la finition mate. "
        + "L'accroche est fournie et le cadre reste assez léger pour un mur creux. "
        + "Il se pose aussi bien à l'entrée que dans une chambre.",
      details: {
        'Matière': 'Bois peint, verre',
        'Dimensions': '50 × 70 cm',
        'Entretien': 'Chiffon doux, éviter l’humidité',
        'Finition': 'Mate'
      }
    }
  ];

  // Index id -> article.
  const PAR_ARTICLE = {};
  ARTICLES.forEach((a) => { PAR_ARTICLE[a.id] = a; });

  /* ----------------------------- 3. État ---------------------------- */

  let panier = [];               // [{ id, qte }]
  let avis = {};                 // { "<idProduit>": [ { id, auteur, note, texte, date } ] }
  let favoris = [];              // [ "<idProduit>" ]
  let filtreCategorie = 'Tout';
  let filtreTexte = '';
  let filtreFavoris = false;
  let filtrePrixMax = 0;            // prix maximum accepté (borne fixée au démarrage)
  let triCatalogue = 'pertinence';  // « pertinence » conserve l'ordre du catalogue
  let dernierFocus = null;       // élément à re-focus à la fermeture du tiroir
  let articleCourant = null;     // id de l'article affiché dans la fiche
  let quantiteFiche = 1;         // quantité choisie dans la fiche
  let dernierFocusFiche = null;  // élément à re-focus à la fermeture de la fiche

  /* ---------------------- 4. Thème clair / sombre ------------------- */

  function appliquerTheme(sombre, enregistrer) {
    document.body.classList.toggle('sombre', sombre);
    if (boutonTheme) {
      boutonTheme.setAttribute('aria-label', sombre ? 'Basculer en mode clair' : 'Basculer en mode sombre');
      boutonTheme.title = sombre ? 'Mode clair' : 'Mode sombre';
    }
    if (enregistrer) stockage.ecrire(CLE_THEME, sombre);
  }

  function themeInitial() {
    const prefere = stockage.lire(CLE_THEME, null);
    if (typeof prefere === 'boolean') return prefere;
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  /* ------------------------- 5. Catalogue --------------------------- */

  // Libellé accessible du bouton cœur.
  function libelleFavori(a, estFav) {
    return (estFav ? 'Retirer ' : 'Ajouter ') + a.nom
      + (estFav ? ' des favoris' : ' aux favoris');
  }

  // Bloc « étoiles + note » d'une carte, seulement si l'article a des avis.
  function noteCarteHTML(id) {
    const s = statsAvis(id);
    if (!s.nombre) return '';
    const texte = formaterNote(s.moyenne) + ' / 5 · ' + s.nombre + ' avis';
    return '<p class="carte-note">'
      + etoilesHTML(s.moyenne, 'Note moyenne ' + formaterNote(s.moyenne) + ' sur 5')
      + '<span class="carte-note-texte">' + echapper(texte) + '</span>'
      + '</p>';
  }

  function carteHTML(a) {
    const fav = estFavori(a.id);
    return ''
      + '<article class="carte' + (fav ? ' carte--favori' : '') + '" data-ouvrir="' + a.id + '">'
      +   '<div class="carte-media">'
      +     '<div class="vignette ' + VIGNETTE_CATEGORIE[a.categorie] + '" aria-hidden="true">'
      +       '<svg><use href="' + ICONE_CATEGORIE[a.categorie] + '"/></svg>'
      +     '</div>'
      +     '<button type="button" class="carte-favori" data-favori="' + a.id + '"'
      +       ' aria-pressed="' + fav + '" aria-label="' + echapper(libelleFavori(a, fav)) + '">'
      +       '<span class="ico" aria-hidden="true"><svg><use href="#i-coeur"/></svg></span>'
      +     '</button>'
      +   '</div>'
      +   '<div class="carte-corps">'
      +     '<span class="carte-cat">' + echapper(a.categorie) + '</span>'
      +     '<h2 class="carte-nom">'
      +       '<button type="button" class="carte-lien" data-ouvrir="' + a.id + '">'
      +         echapper(a.nom)
      +       '</button>'
      +     '</h2>'
      +     noteCarteHTML(a.id)
      +     '<p class="carte-desc">' + echapper(a.accroche) + '</p>'
      +     '<div class="carte-bas">'
      +       '<span class="prix">' + formaterPrix(a.prix) + '</span>'
      +       '<button type="button" class="bouton" data-ajouter="' + a.id + '">'
      +         '<span class="ico" aria-hidden="true"><svg><use href="#i-plus"/></svg></span>Ajouter'
      +       '</button>'
      +     '</div>'
      +   '</div>'
      + '</article>';
  }

  // Prix le plus élevé du catalogue : borne haute du curseur de prix.
  function prixMaxCatalogue() {
    return ARTICLES.reduce(function (max, a) { return Math.max(max, a.prix); }, 0);
  }

  // Comparaison alphabétique française (casse et accents ignorés).
  function comparerNoms(a, b) {
    return a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' });
  }

  // Tri de la liste déjà filtrée. Array.prototype.sort étant stable, les
  // articles à égalité restent dans l'ordre du catalogue (« pertinence »).
  function trierArticles(liste) {
    const triee = liste.slice();
    if (triCatalogue === 'prix-croissant') {
      triee.sort((a, b) => (a.prix - b.prix) || comparerNoms(a, b));
    } else if (triCatalogue === 'prix-decroissant') {
      triee.sort((a, b) => (b.prix - a.prix) || comparerNoms(a, b));
    } else if (triCatalogue === 'nom') {
      triee.sort(comparerNoms);
    } else if (triCatalogue === 'note') {
      triee.sort(function (a, b) {
        const na = statsAvis(a.id);
        const nb = statsAvis(b.id);
        if (!na.nombre || !nb.nombre) {
          if (!na.nombre && !nb.nombre) return 0; // aucun avis des deux côtés
          return na.nombre ? -1 : 1;              // sans avis : en dernier
        }
        return nb.moyenne - na.moyenne;
      });
    }
    return triee;
  }

  function articlesFiltres() {
    const texte = normaliser(filtreTexte.trim());
    const liste = ARTICLES.filter((a) => {
      const okCategorie = filtreCategorie === 'Tout' || a.categorie === filtreCategorie;
      const okFavori = !filtreFavoris || estFavori(a.id);
      const okPrix = a.prix <= filtrePrixMax;
      const champs = a.nom + ' ' + a.accroche + ' ' + a.description;
      const okTexte = !texte || normaliser(champs).indexOf(texte) !== -1;
      return okCategorie && okFavori && okPrix && okTexte;
    });
    return trierArticles(liste);
  }

  function rendreCatalogue() {
    const liste = articlesFiltres();
    grille.innerHTML = liste.map(carteHTML).join('');
    grille.hidden = liste.length === 0;
    grilleVide.hidden = liste.length !== 0;

    if (filtreFavoris && favoris.length === 0) {
      grilleVide.textContent = "Vous n'avez pas encore de favoris. Touchez le cœur d'un article pour l'ajouter.";
    } else if (filtreFavoris) {
      grilleVide.textContent = 'Aucun de vos favoris ne correspond à ce filtre.';
    } else if (filtreTexte.trim()) {
      grilleVide.textContent = 'Aucun article ne correspond à votre recherche.';
    } else {
      grilleVide.textContent = 'Aucun article ne correspond à ces filtres.';
    }

    compteResultats.textContent = liste.length === 0
      ? ''
      : (liste.length === 1 ? '1 article affiché' : liste.length + ' articles affichés');
  }

  function rendrePuces() {
    const toutes = ['Tout'].concat(CATEGORIES);
    puces.innerHTML = toutes.map((c) => (
      '<button type="button" class="puce" data-categorie="' + echapper(c) + '"'
      + ' aria-pressed="' + (c === filtreCategorie) + '">' + echapper(c) + '</button>'
    )).join('');
  }

  /* ------------------------ Filtres : prix & tri -------------------- */

  // Curseur de prix : valeur courante, libellé visible et version annoncée.
  function rendrePrix() {
    prixMax.value = String(filtrePrixMax);
    const libelle = "Jusqu'à " + formaterPrix(filtrePrixMax);
    prixMaxValeur.textContent = libelle;
    prixMax.setAttribute('aria-valuetext', libelle);
  }

  // Bornes du curseur recalculées depuis le catalogue (rien en dur).
  function initialiserPrix() {
    const pas = 10;
    prixMax.min = '0';
    prixMax.max = String(Math.ceil(prixMaxCatalogue() / pas) * pas);
    prixMax.step = String(pas);
    filtrePrixMax = prixMaxCatalogue();
    rendrePrix();
  }

  // Remet recherche, catégorie, favoris, prix et tri dans leur état initial.
  function reinitialiserFiltres() {
    filtreTexte = '';
    recherche.value = '';
    filtreCategorie = 'Tout';
    filtreFavoris = false;
    triCatalogue = 'pertinence';
    tri.value = 'pertinence';
    initialiserPrix();
    rendrePuces();
    rendreFiltreFavoris();
    rendreCatalogue();
    annoncer('Filtres réinitialisés.');
  }

  /* --------------------------- Favoris ------------------------------ */

  function chargerFavoris() {
    const brut = stockage.lire(CLE_FAVORIS, []);
    const liste = Array.isArray(brut) ? brut : [];
    // On ne garde que des identifiants connus, sans doublon.
    favoris = liste
      .filter((id) => PAR_ARTICLE[id])
      .filter((id, i, t) => t.indexOf(id) === i);
  }

  function estFavori(id) {
    return favoris.indexOf(id) !== -1;
  }

  function rendreFiltreFavoris() {
    filtreFavorisBouton.setAttribute('aria-pressed', String(filtreFavoris));
    favorisCompteur.textContent = favoris.length;
  }

  function basculerFavori(id) {
    const a = PAR_ARTICLE[id];
    if (!a) return;
    const i = favoris.indexOf(id);
    if (i === -1) favoris.push(id);
    else favoris.splice(i, 1);
    stockage.ecrire(CLE_FAVORIS, favoris);

    const fav = estFavori(id);
    majBoutonsFavori(id, fav);
    rendreFiltreFavoris();
    // Si le filtre « Favoris » est actif, la grille doit se mettre à jour.
    if (filtreFavoris) rendreCatalogue();
    annoncer(a.nom + (fav ? ' ajouté aux favoris.' : ' retiré des favoris.'));
  }

  // Met à jour tous les boutons cœur d'un article (carte et fiche) sans
  // reconstruire le DOM, pour ne pas perdre le focus.
  function majBoutonsFavori(id, fav) {
    const boutons = document.querySelectorAll('[data-favori="' + id + '"]');
    Array.prototype.forEach.call(boutons, function (bouton) {
      bouton.setAttribute('aria-pressed', String(fav));
      bouton.setAttribute('aria-label', libelleFavori(PAR_ARTICLE[id], fav));
      const carte = bouton.closest('.carte');
      if (carte) carte.classList.toggle('carte--favori', fav);
    });
  }

  /* ------------------------ 6. Avis clients ------------------------- */

  // Jeu d'avis de départ. Écrit une seule fois, quand la clé est absente.
  function avisDepart() {
    return {
      theiere: [
        { id: 'avis-v1', auteur: 'Salma B.', note: 5, date: '2026-02-14T10:12:00.000Z',
          texte: "Le bec ne goutte pas et le cuivre a une belle couleur. Je l'utilise tous les jours depuis un mois." },
        { id: 'avis-v2', auteur: 'Yassine R.', note: 4, date: '2026-03-02T18:40:00.000Z',
          texte: "Bonne contenance pour six verres. Un peu lourde à vide, mais ça ne me gêne pas." }
      ],
      tapis: [
        { id: 'avis-v3', auteur: 'Nadia K.', note: 5, date: '2026-01-21T09:05:00.000Z',
          texte: "Laine épaisse et motifs bien nets. Les couleurs sont proches des photos." },
        { id: 'avis-v4', auteur: 'Omar T.', note: 4, date: '2026-02-27T16:20:00.000Z',
          texte: "Tapis chaud et dense. Il perd un peu de laine au début, c'est normal pour cette matière." }
      ],
      lampe: [
        { id: 'avis-v5', auteur: 'Imane Z.', note: 4, date: '2026-03-11T20:15:00.000Z',
          texte: "Lumière douce et pied stable. Le cordon est un peu court pour ma table de chevet." }
      ],
      verres: [
        { id: 'avis-v6', auteur: 'Karim L.', note: 5, date: '2026-02-05T11:30:00.000Z',
          texte: "Six verres solides et la gravure reste discrète. Lavés à la main sans souci." },
        { id: 'avis-v7', auteur: 'Hind M.', note: 3, date: '2026-03-19T08:50:00.000Z',
          texte: "Jolis verres mais plus petits que je pensais. Bon rapport qualité-prix malgré tout." }
      ]
    };
  }

  // Un avis stocké est retenu s'il a un texte et une note plausible.
  function avisValide(x) {
    return x && typeof x === 'object'
      && typeof x.texte === 'string' && x.texte.trim() !== ''
      && Number.isInteger(x.note) && x.note >= 1 && x.note <= 5;
  }

  function normaliserAvis(x) {
    const date = (typeof x.date === 'string' && !isNaN(new Date(x.date).getTime()))
      ? x.date : new Date().toISOString();
    return {
      id: typeof x.id === 'string' && x.id ? x.id : nouvelId('avis'),
      auteur: typeof x.auteur === 'string' && x.auteur.trim() ? x.auteur.trim().slice(0, 40) : 'Anonyme',
      note: x.note,
      texte: String(x.texte).trim().slice(0, 500),
      date: date
    };
  }

  function chargerAvis() {
    const brut = stockage.lire(CLE_AVIS, null);
    // Clé absente : on écrit le jeu d'exemple une seule fois.
    if (brut === null) {
      avis = avisDepart();
      stockage.ecrire(CLE_AVIS, avis);
      return;
    }
    avis = {};
    if (typeof brut !== 'object' || Array.isArray(brut)) return; // clé illisible : on repart à vide
    Object.keys(brut).forEach(function (id) {
      if (!PAR_ARTICLE[id] || !Array.isArray(brut[id])) return;
      const liste = brut[id].filter(avisValide).map(normaliserAvis);
      if (liste.length) avis[id] = liste;
    });
  }

  function enregistrerAvis() {
    stockage.ecrire(CLE_AVIS, avis);
  }

  // Moyenne et nombre d'avis d'un article.
  function statsAvis(id) {
    const liste = avis[id] || [];
    if (!liste.length) return { moyenne: 0, nombre: 0 };
    const somme = liste.reduce((s, a) => s + a.note, 0);
    return { moyenne: somme / liste.length, nombre: liste.length };
  }

  // Le plus récent d'abord.
  function avisTries(id) {
    return (avis[id] || []).slice().sort(function (a, b) {
      return new Date(b.date) - new Date(a.date);
    });
  }

  function ajouterAvis(id, auteur, note, texte) {
    if (!PAR_ARTICLE[id]) return;
    if (!avis[id]) avis[id] = [];
    avis[id].push({
      id: nouvelId('avis'),
      auteur: auteur.trim().slice(0, 40),
      note: note,
      texte: texte.trim().slice(0, 500),
      date: new Date().toISOString()
    });
    enregistrerAvis();
  }

  /* --------------------- 7. Fiche produit --------------------------- */

  function ficheOuverte() {
    return !fiche.hidden;
  }

  function detailsHTML(a) {
    return Object.keys(a.details).map(function (cle) {
      return '<div><dt>' + echapper(cle) + '</dt><dd>' + echapper(a.details[cle]) + '</dd></div>';
    }).join('');
  }

  function dispoHTML(a) {
    if (a.stock <= 0) return { html: 'Rupture de stock', classe: ' fiche-dispo--rupture', rupture: true };
    if (a.stock <= 3) return { html: 'Plus que ' + a.stock + ' en stock', classe: ' fiche-dispo--rare', rupture: false };
    return { html: 'En stock · ' + a.stock + ' exemplaires', classe: '', rupture: false };
  }

  function resumeNoteHTML(id) {
    const s = statsAvis(id);
    if (!s.nombre) {
      return '<p class="avis-vide">Aucun avis pour le moment. Soyez le premier à donner le vôtre.</p>';
    }
    return '<div class="fiche-note-resume">'
      + etoilesHTML(s.moyenne, 'Note moyenne ' + formaterNote(s.moyenne) + ' sur 5')
      + '<strong>' + formaterNote(s.moyenne) + ' / 5</strong>'
      + '<span class="avis-nombre">' + s.nombre + ' avis</span>'
      + '</div>';
  }

  function listeAvisHTML(id) {
    const liste = avisTries(id);
    if (!liste.length) return '';
    return '<ul class="avis-liste">' + liste.map(function (a) {
      return '<li class="avis">'
        + '<div class="avis-tete">'
        +   '<span class="avis-auteur">' + echapper(a.auteur) + '</span>'
        +   '<span class="avis-date">' + echapper(formaterDate(a.date)) + '</span>'
        + '</div>'
        + etoilesHTML(a.note, 'Note ' + a.note + ' sur 5')
        + '<p class="avis-texte">' + echapper(a.texte) + '</p>'
        + '</li>';
    }).join('') + '</ul>';
  }

  function formAvisHTML() {
    return ''
      + '<form id="form-avis" class="form-avis" novalidate>'
      +   '<h4 class="form-avis-titre">Laisser un avis</h4>'
      +   '<div class="avis-champs">'
      +     '<div class="champ">'
      +       '<label for="avis-auteur">Votre nom</label>'
      +       '<input id="avis-auteur" name="auteur" type="text" autocomplete="name"'
      +         ' maxlength="40" aria-describedby="erreur-avis-auteur">'
      +       '<p id="erreur-avis-auteur" class="erreur" hidden></p>'
      +     '</div>'
      +     '<div class="champ">'
      +       '<label for="avis-note">Note</label>'
      +       '<select id="avis-note" name="note" aria-describedby="erreur-avis-note">'
      +         '<option value="">Choisir…</option>'
      +         '<option value="5">5 — Excellent</option>'
      +         '<option value="4">4 — Très bien</option>'
      +         '<option value="3">3 — Correct</option>'
      +         '<option value="2">2 — Moyen</option>'
      +         '<option value="1">1 — Décevant</option>'
      +       '</select>'
      +       '<p id="erreur-avis-note" class="erreur" hidden></p>'
      +     '</div>'
      +   '</div>'
      +   '<div class="champ">'
      +     '<label for="avis-texte">Votre avis</label>'
      +     '<textarea id="avis-texte" name="texte" rows="3" maxlength="500"'
      +       ' aria-describedby="erreur-avis-texte"></textarea>'
      +     '<p id="erreur-avis-texte" class="erreur" hidden></p>'
      +   '</div>'
      +   '<button type="submit" class="bouton bouton-primaire">Publier mon avis</button>'
      + '</form>';
  }

  function ficheContenuHTML(a) {
    const fav = estFavori(a.id);
    const dispo = dispoHTML(a);
    return ''
      + '<div class="fiche-haut">'
      +   '<div class="vignette fiche-vignette ' + VIGNETTE_CATEGORIE[a.categorie] + '" aria-hidden="true">'
      +     '<svg><use href="' + ICONE_CATEGORIE[a.categorie] + '"/></svg>'
      +   '</div>'
      +   '<div class="fiche-info">'
      +     '<div class="fiche-ligne-prix">'
      +       '<span class="prix fiche-prix">' + formaterPrix(a.prix) + '</span>'
      +       '<button type="button" class="carte-favori carte-favori--fiche" data-favori="' + a.id + '"'
      +         ' aria-pressed="' + fav + '" aria-label="' + echapper(libelleFavori(a, fav)) + '">'
      +         '<span class="ico" aria-hidden="true"><svg><use href="#i-coeur"/></svg></span>'
      +       '</button>'
      +     '</div>'
      +     resumeNoteHTML(a.id)
      +     '<p class="fiche-description">' + echapper(a.description) + '</p>'
      +     '<dl class="fiche-details">' + detailsHTML(a) + '</dl>'
      +     '<p id="fiche-dispo" class="fiche-dispo' + dispo.classe + '">' + echapper(dispo.html) + '</p>'
      +     '<div class="fiche-achat">'
      +       '<div class="qte" role="group" aria-label="Quantité">'
      +         '<button type="button" class="qte-bouton" data-fiche-moins aria-label="Diminuer la quantité">'
      +           '<span class="ico" aria-hidden="true"><svg><use href="#i-moins"/></svg></span>'
      +         '</button>'
      +         '<span id="fiche-qte" class="qte-valeur" aria-live="polite">' + quantiteFiche + '</span>'
      +         '<button type="button" class="qte-bouton" data-fiche-plus aria-label="Augmenter la quantité">'
      +           '<span class="ico" aria-hidden="true"><svg><use href="#i-plus"/></svg></span>'
      +         '</button>'
      +       '</div>'
      +       '<button type="button" class="bouton bouton-primaire" data-fiche-ajouter'
      +         (dispo.rupture ? ' disabled' : '') + '>Ajouter au panier</button>'
      +     '</div>'
      +   '</div>'
      + '</div>'
      + '<section class="fiche-avis" aria-labelledby="fiche-avis-titre">'
      +   '<h3 id="fiche-avis-titre" class="fiche-avis-titre" tabindex="-1">Avis des clients</h3>'
      +   listeAvisHTML(a.id)
      +   formAvisHTML()
      + '</section>';
  }

  function rendreFiche() {
    const a = PAR_ARTICLE[articleCourant];
    if (!a) return;
    ficheCat.textContent = a.categorie;
    ficheNom.textContent = a.nom;
    ficheContenu.innerHTML = ficheContenuHTML(a);
    majBoutonsQuantiteFiche(a);
  }

  function ouvrirFiche(id) {
    if (!PAR_ARTICLE[id]) return;
    articleCourant = id;
    quantiteFiche = 1;
    dernierFocusFiche = document.activeElement;
    rendreFiche();
    fiche.hidden = false;
    fiche.setAttribute('aria-hidden', 'false');
    document.body.classList.add('fiche-ouverte');
    fiche.focus();
  }

  function fermerFiche() {
    if (!ficheOuverte()) return;
    fiche.hidden = true;
    fiche.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('fiche-ouverte');
    articleCourant = null;
    if (dernierFocusFiche && document.contains(dernierFocusFiche)) dernierFocusFiche.focus();
    else filtreFavorisBouton.focus();
    dernierFocusFiche = null;
  }

  function changerQuantiteFiche(delta) {
    const a = PAR_ARTICLE[articleCourant];
    if (!a) return;
    const max = Math.max(1, a.stock);
    quantiteFiche = Math.min(max, Math.max(1, quantiteFiche + delta));
    const valeur = $('fiche-qte');
    if (valeur) valeur.textContent = quantiteFiche;
    majBoutonsQuantiteFiche(a);
  }

  function majBoutonsQuantiteFiche(a) {
    const moins = fiche.querySelector('[data-fiche-moins]');
    const plus = fiche.querySelector('[data-fiche-plus]');
    const max = Math.max(1, a.stock);
    if (moins) moins.disabled = quantiteFiche <= 1;
    if (plus) plus.disabled = quantiteFiche >= max;
  }

  function ajouterDepuisFiche() {
    const a = PAR_ARTICLE[articleCourant];
    if (!a || a.stock <= 0) return;
    const qte = quantiteFiche;
    ajouterAuPanier(a.id, qte);
    fermerFiche();
  }

  /* --------------------------- Avis : formulaire -------------------- */

  const CHAMPS_AVIS = [
    { id: 'avis-auteur', valider: (v) => (v.trim() ? '' : 'Merci d’indiquer votre nom.') },
    { id: 'avis-note', valider: (v) => {
      const n = Number(v);
      return (Number.isInteger(n) && n >= 1 && n <= 5) ? '' : 'Merci de choisir une note de 1 à 5.';
    } },
    { id: 'avis-texte', valider: (v) => (v.trim().length >= 10 ? '' : 'Merci d’écrire au moins quelques mots (10 caractères).') }
  ];

  function soumettreAvis(e) {
    e.preventDefault();
    const id = articleCourant;
    const a = PAR_ARTICLE[id];
    if (!a) return;

    let premierInvalide = null;
    let valide = true;
    CHAMPS_AVIS.forEach(function (champ) {
      if (!validerChamp(champ)) {
        valide = false;
        if (!premierInvalide) premierInvalide = $(champ.id);
      }
    });
    if (!valide) {
      if (premierInvalide) premierInvalide.focus();
      return;
    }

    ajouterAvis(id, $('avis-auteur').value, Number($('avis-note').value), $('avis-texte').value);
    rendreFiche();
    const titre = $('fiche-avis-titre');
    if (titre) titre.focus();
    rendreCatalogue(); // met à jour la note affichée sur la carte
    annoncer('Merci, votre avis sur ' + a.nom + ' a été publié.');
  }


  /* --------------------------- 8. Panier ---------------------------- */

  function chargerPanier() {
    const brut = stockage.lire(CLE_PANIER, []);
    if (!Array.isArray(brut)) { panier = []; return; }
    // On ne garde que des articles connus, avec une quantité entière positive.
    panier = brut
      .filter((l) => l && PAR_ARTICLE[l.id] && Number.isFinite(l.qte))
      .map((l) => ({ id: l.id, qte: Math.max(1, Math.floor(l.qte)) }));
  }

  function enregistrerPanier() {
    stockage.ecrire(CLE_PANIER, panier);
  }

  // Le panier transformé en lignes complètes (nom, prix, sous-total).
  function calculerLignes() {
    return panier.map((l) => {
      const a = PAR_ARTICLE[l.id];
      return {
        id: a.id, nom: a.nom, prix: a.prix, categorie: a.categorie,
        qte: l.qte, sousTotal: a.prix * l.qte
      };
    });
  }

  function calculerTotaux(sousTotal) {
    const livraison = (sousTotal === 0 || sousTotal >= SEUIL_LIVRAISON) ? 0 : FRAIS_LIVRAISON;
    return { sousTotal: sousTotal, livraison: livraison, total: sousTotal + livraison };
  }

  function texteLivraison(t) {
    if (t.sousTotal === 0) return '—';
    return t.livraison === 0 ? 'Offerte' : formaterPrix(t.livraison);
  }

  function rendrePanier() {
    const lignes = calculerLignes();
    const vide = lignes.length === 0;

    panierLignes.innerHTML = lignes.map((l) => (
      '<div class="ligne">'
      +   '<div class="ligne-vignette" aria-hidden="true"><svg><use href="' + ICONE_CATEGORIE[l.categorie] + '"/></svg></div>'
      +   '<div class="ligne-corps">'
      +     '<div class="ligne-haut">'
      +       '<span class="ligne-nom">' + echapper(l.nom) + '</span>'
      +       '<span class="ligne-prix">' + formaterPrix(l.prix) + '</span>'
      +     '</div>'
      +     '<div class="ligne-bas">'
      +       '<div class="qte" role="group" aria-label="Quantité — ' + echapper(l.nom) + '">'
      +         '<button type="button" class="qte-bouton" data-moins="' + l.id + '" aria-label="Diminuer la quantité">'
      +           '<span class="ico" aria-hidden="true"><svg><use href="#i-moins"/></svg></span>'
      +         '</button>'
      +         '<span class="qte-valeur" aria-live="polite">' + l.qte + '</span>'
      +         '<button type="button" class="qte-bouton" data-plus="' + l.id + '" aria-label="Augmenter la quantité">'
      +           '<span class="ico" aria-hidden="true"><svg><use href="#i-plus"/></svg></span>'
      +         '</button>'
      +       '</div>'
      +       '<span class="ligne-sous-total">' + formaterPrix(l.sousTotal) + '</span>'
      +     '</div>'
      +     '<button type="button" class="retirer" data-retirer="' + l.id + '">Retirer</button>'
      +   '</div>'
      + '</div>'
    )).join('');

    const sousTotal = lignes.reduce((s, l) => s + l.sousTotal, 0);
    const t = calculerTotaux(sousTotal);

    panierLignes.hidden = vide;
    panierVide.hidden = !vide;
    panierPied.hidden = vide;
    panierCommander.disabled = vide;

    panierSousTotal.textContent = formaterPrix(t.sousTotal);
    panierLivraison.textContent = texteLivraison(t);
    panierTotal.textContent = formaterPrix(t.total);

    panierCompteur.textContent = lignes.reduce((s, l) => s + l.qte, 0);

    rendreRecapCommande();
  }

  function ajouterAuPanier(id, qte) {
    if (!PAR_ARTICLE[id]) return;
    const n = Math.max(1, Math.floor(qte || 1));
    const ligne = panier.find((l) => l.id === id);
    if (ligne) ligne.qte += n;
    else panier.push({ id: id, qte: n });
    enregistrerPanier();
    rendrePanier();
    annoncer(n + ' × ' + PAR_ARTICLE[id].nom + ' ajouté au panier.');
  }

  function changerQuantite(id, delta) {
    const ligne = panier.find((l) => l.id === id);
    if (!ligne) return;
    ligne.qte += delta;
    if (ligne.qte <= 0) panier = panier.filter((l) => l.id !== id);
    enregistrerPanier();
    rendrePanier();
  }

  function retirerDuPanier(id) {
    const a = PAR_ARTICLE[id];
    panier = panier.filter((l) => l.id !== id);
    enregistrerPanier();
    rendrePanier();
    if (a) annoncer(a.nom + ' retiré du panier.');
  }

  // Petit retour visuel sur le bouton « Ajouter ».
  function signalerAjout(bouton) {
    if (bouton.dataset.occupe) return;
    bouton.dataset.occupe = '1';
    const html = bouton.innerHTML;
    bouton.innerHTML = '<span class="ico" aria-hidden="true"><svg><use href="#i-check"/></svg></span>Ajouté';
    bouton.classList.add('bouton-ajoute');
    window.setTimeout(function () {
      bouton.innerHTML = html;
      bouton.classList.remove('bouton-ajoute');
      delete bouton.dataset.occupe;
    }, 1200);
  }

  /* --------------------- 9. Tiroir du panier ------------------------ */

  const SELECTEUR_FOCUS = 'a[href],button:not([disabled]),input:not([disabled]),'
    + 'textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

  function panierOuvert() {
    return !tiroir.hidden;
  }

  function ouvrirPanier() {
    if (panierOuvert()) return;
    dernierFocus = document.activeElement;
    voile.hidden = false;
    tiroir.hidden = false;
    tiroir.setAttribute('aria-hidden', 'false');
    document.body.classList.add('panier-ouvert');
    panierBouton.setAttribute('aria-expanded', 'true');
    const premier = tiroir.querySelector(SELECTEUR_FOCUS);
    if (premier) premier.focus();
  }

  function fermerPanier() {
    if (!panierOuvert()) return;
    tiroir.hidden = true;
    tiroir.setAttribute('aria-hidden', 'true');
    voile.hidden = true;
    document.body.classList.remove('panier-ouvert');
    panierBouton.setAttribute('aria-expanded', 'false');
    if (dernierFocus && document.contains(dernierFocus)) dernierFocus.focus();
    else panierBouton.focus();
  }

  // Piège de focus simple : Tab reste à l'intérieur du conteneur donné.
  function piegerFocusDans(conteneur, e) {
    const elements = Array.prototype.slice
      .call(conteneur.querySelectorAll(SELECTEUR_FOCUS))
      .filter((el) => el.getClientRects().length > 0);
    if (!elements.length) return;
    const premier = elements[0];
    const dernier = elements[elements.length - 1];
    if (e.shiftKey && document.activeElement === premier) {
      e.preventDefault();
      dernier.focus();
    } else if (!e.shiftKey && document.activeElement === dernier) {
      e.preventDefault();
      premier.focus();
    }
  }

  function piegerFocus(e) {
    piegerFocusDans(tiroir, e);
  }

  /* ------------------- 10. Commande et confirmation ----------------- */

  function afficherVue(nom) {
    vueCatalogue.hidden = nom !== 'catalogue';
    vueCommande.hidden = nom !== 'commande';
    vueConfirmation.hidden = nom !== 'confirmation';
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function recapLignesHTML(lignes) {
    return lignes.map((l) => (
      '<div class="recap-ligne">'
      +   '<span class="recap-ligne-nom">' + echapper(l.nom)
      +     '<span class="recap-ligne-qte">' + l.qte + ' × ' + formaterPrix(l.prix) + '</span>'
      +   '</span>'
      +   '<span class="recap-ligne-prix">' + formaterPrix(l.sousTotal) + '</span>'
      + '</div>'
    )).join('');
  }

  function rendreRecapCommande() {
    if (vueCommande.hidden) return;
    const lignes = calculerLignes();
    recapLignes.innerHTML = recapLignesHTML(lignes);
    const sousTotal = lignes.reduce((s, l) => s + l.sousTotal, 0);
    const t = calculerTotaux(sousTotal);
    recapSousTotal.textContent = formaterPrix(t.sousTotal);
    recapLivraison.textContent = texteLivraison(t);
    recapTotal.textContent = formaterPrix(t.total);
  }

  function allerCommande() {
    if (!panier.length) return;
    fermerPanier();
    afficherVue('commande');
    rendreRecapCommande();
    window.requestAnimationFrame(function () { $('nom').focus(); });
  }

  // Champs à valider : la règle renvoie un message d'erreur, ou '' si valide.
  const CHAMPS = [
    { id: 'nom', valider: (v) => (v.trim() ? '' : 'Merci d’indiquer votre nom.') },
    { id: 'email', valider: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Merci d’indiquer une adresse e-mail valide.') },
    { id: 'adresse', valider: (v) => (v.trim() ? '' : 'Merci d’indiquer une adresse de livraison.') }
  ];

  function validerChamp(champ) {
    const champSaisie = $(champ.id);
    const zoneErreur = $('erreur-' + champ.id);
    const message = champ.valider(champSaisie.value);
    if (message) {
      zoneErreur.textContent = message;
      zoneErreur.hidden = false;
      champSaisie.setAttribute('aria-invalid', 'true');
      return false;
    }
    zoneErreur.textContent = '';
    zoneErreur.hidden = true;
    champSaisie.removeAttribute('aria-invalid');
    return true;
  }

  function reinitialiserFormulaire() {
    form.reset();
    CHAMPS.forEach((champ) => {
      const champSaisie = $(champ.id);
      const zoneErreur = $('erreur-' + champ.id);
      zoneErreur.textContent = '';
      zoneErreur.hidden = true;
      champSaisie.removeAttribute('aria-invalid');
    });
  }

  function genererNumero() {
    return 'CMD-' + Math.floor(1000 + Math.random() * 9000);
  }

  function finaliserCommande() {
    const lignes = calculerLignes();
    const sousTotal = lignes.reduce((s, l) => s + l.sousTotal, 0);
    const t = calculerTotaux(sousTotal);

    // Remplissage de la vue de confirmation.
    confNumero.textContent = genererNumero();
    confLignes.innerHTML = recapLignesHTML(lignes);
    confSousTotal.textContent = formaterPrix(t.sousTotal);
    confLivraison.textContent = texteLivraison(t);
    confTotal.textContent = formaterPrix(t.total);

    afficherVue('confirmation');
    confRetour.focus();

    // Le panier est vidé une fois la commande passée.
    panier = [];
    enregistrerPanier();
    rendrePanier();
    reinitialiserFormulaire();
  }

  function soumettreFormulaire(e) {
    e.preventDefault();
    let premierInvalide = null;
    let valide = true;
    CHAMPS.forEach((champ) => {
      if (!validerChamp(champ)) {
        valide = false;
        if (!premierInvalide) premierInvalide = $(champ.id);
      }
    });
    if (!valide) {
      if (premierInvalide) premierInvalide.focus();
      return;
    }
    finaliserCommande();
  }

  /* ------------------ Raccourci : nœuds du document ----------------- */

  const vueCatalogue = $('vue-catalogue');
  const vueCommande = $('vue-commande');
  const vueConfirmation = $('vue-confirmation');
  const grille = $('grille');
  const grilleVide = $('grille-vide');
  const puces = $('puces');
  const recherche = $('recherche');
  const compteResultats = $('compte-resultats');
  const tri = $('tri');
  const prixMax = $('prix-max');
  const prixMaxValeur = $('prix-max-valeur');
  const reinitialiserBouton = $('reinitialiser-filtres');
  const panierBouton = $('panier-bouton');
  const panierCompteur = $('panier-compteur');
  const tiroir = $('panier');
  const panierLignes = $('panier-lignes');
  const panierVide = $('panier-vide');
  const panierPied = $('panier-pied');
  const panierSousTotal = $('panier-sous-total');
  const panierLivraison = $('panier-livraison');
  const panierTotal = $('panier-total');
  const panierCommander = $('panier-commander');
  const panierFermer = $('panier-fermer');
  const voile = $('voile');
  const form = $('form-commande');
  const recapLignes = $('recap-lignes');
  const recapSousTotal = $('recap-sous-total');
  const recapLivraison = $('recap-livraison');
  const recapTotal = $('recap-total');
  const confNumero = $('conf-numero');
  const confLignes = $('conf-lignes');
  const confSousTotal = $('conf-sous-total');
  const confLivraison = $('conf-livraison');
  const confTotal = $('conf-total');
  const confRetour = $('conf-retour');
  const retourCatalogue = $('retour-catalogue');
  const boutonTheme = $('theme');
  const filtreFavorisBouton = $('filtre-favoris');
  const favorisCompteur = $('favoris-compteur');
  const fiche = $('fiche');
  const ficheContenu = $('fiche-contenu');
  const ficheNom = $('fiche-nom');
  const ficheCat = $('fiche-cat');
  const ficheFermer = $('fiche-fermer');

  /* -------------------------- 11. Démarrage ------------------------- */

  function brancherEvenements() {
    // Thème
    boutonTheme.addEventListener('click', function () {
      appliquerTheme(!document.body.classList.contains('sombre'), true);
    });

    // Recherche
    recherche.addEventListener('input', function () {
      filtreTexte = recherche.value;
      rendreCatalogue();
    });

    // Puces de catégorie (délégation)
    puces.addEventListener('click', function (e) {
      const puce = e.target.closest('.puce');
      if (!puce) return;
      filtreCategorie = puce.dataset.categorie;
      rendrePuces();
      rendreCatalogue();
    });

    // Tri du catalogue
    tri.addEventListener('change', function () {
      triCatalogue = tri.value;
      rendreCatalogue();
      const option = tri.options[tri.selectedIndex];
      annoncer('Tri : ' + (option ? option.text : tri.value) + '.');
    });

    // Prix maximum
    prixMax.addEventListener('input', function () {
      const valeur = Number(prixMax.value);
      if (!Number.isFinite(valeur)) return;
      filtrePrixMax = valeur;
      rendrePrix();
      rendreCatalogue();
    });

    // Réinitialisation de tous les filtres
    reinitialiserBouton.addEventListener('click', reinitialiserFiltres);

    // Grille : ajout, favori, ouverture de la fiche (délégation)
    grille.addEventListener('click', function (e) {
      const boutonAjout = e.target.closest('[data-ajouter]');
      if (boutonAjout) {
        ajouterAuPanier(boutonAjout.dataset.ajouter);
        signalerAjout(boutonAjout);
        return;
      }
      const boutonFavori = e.target.closest('[data-favori]');
      if (boutonFavori) {
        basculerFavori(boutonFavori.dataset.favori);
        return;
      }
      const ouvrir = e.target.closest('[data-ouvrir]');
      if (ouvrir) ouvrirFiche(ouvrir.dataset.ouvrir);
    });

    // Filtre « Favoris »
    filtreFavorisBouton.addEventListener('click', function () {
      filtreFavoris = !filtreFavoris;
      rendreFiltreFavoris();
      rendreCatalogue();
    });

    // Fiche produit : fermeture, favori, quantité, ajout (délégation)
    ficheFermer.addEventListener('click', fermerFiche);
    fiche.addEventListener('click', function (e) {
      // Clic sur le fond (hors panneau) : on ferme.
      if (e.target === fiche) { fermerFiche(); return; }

      const boutonFavori = e.target.closest('[data-favori]');
      if (boutonFavori) { basculerFavori(boutonFavori.dataset.favori); return; }

      if (e.target.closest('[data-fiche-moins]')) { changerQuantiteFiche(-1); return; }
      if (e.target.closest('[data-fiche-plus]')) { changerQuantiteFiche(1); return; }
      if (e.target.closest('[data-fiche-ajouter]')) { ajouterDepuisFiche(); }
    });

    // Formulaire d'avis (contenu reconstruit à chaque rendu : délégation).
    fiche.addEventListener('submit', function (e) {
      if (e.target && e.target.id === 'form-avis') soumettreAvis(e);
    });
    fiche.addEventListener('input', function (e) {
      const champ = CHAMPS_AVIS.filter((c) => c.id === e.target.id)[0];
      if (champ && e.target.getAttribute('aria-invalid') === 'true') validerChamp(champ);
    });
    fiche.addEventListener('change', function (e) {
      const champ = CHAMPS_AVIS.filter((c) => c.id === e.target.id)[0];
      if (champ && e.target.getAttribute('aria-invalid') === 'true') validerChamp(champ);
    });

    // Ouverture / fermeture du tiroir
    panierBouton.addEventListener('click', ouvrirPanier);
    panierFermer.addEventListener('click', fermerPanier);
    voile.addEventListener('click', fermerPanier);

    // Actions dans le panier (délégation)
    tiroir.querySelector('.tiroir-corps').addEventListener('click', function (e) {
      const plus = e.target.closest('[data-plus]');
      const moins = e.target.closest('[data-moins]');
      const retirer = e.target.closest('[data-retirer]');
      if (plus) changerQuantite(plus.dataset.plus, 1);
      else if (moins) changerQuantite(moins.dataset.moins, -1);
      else if (retirer) retirerDuPanier(retirer.dataset.retirer);
    });

    panierCommander.addEventListener('click', allerCommande);

    // Formulaire de commande
    form.addEventListener('submit', soumettreFormulaire);
    CHAMPS.forEach(function (champ) {
      const champSaisie = $(champ.id);
      champSaisie.addEventListener('input', function () {
        if (champSaisie.getAttribute('aria-invalid') === 'true') validerChamp(champ);
      });
    });

    // Navigation entre les vues
    retourCatalogue.addEventListener('click', function () { afficherVue('catalogue'); });
    confRetour.addEventListener('click', function () {
      afficherVue('catalogue');
      rendreCatalogue();
      panierBouton.focus();
    });

    // Clavier global : Échap ferme, Tab reste dans la fiche ou le tiroir.
    document.addEventListener('keydown', function (e) {
      if (ficheOuverte()) {
        if (e.key === 'Escape') {
          e.preventDefault();
          fermerFiche();
        } else if (e.key === 'Tab') {
          piegerFocusDans(fiche, e);
        }
        return;
      }
      if (!panierOuvert()) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        fermerPanier();
      } else if (e.key === 'Tab') {
        piegerFocus(e);
      }
    });
  }

  function initialiser() {
    $('annee').textContent = new Date().getFullYear();
    appliquerTheme(themeInitial(), false);

    chargerPanier();
    chargerAvis();
    chargerFavoris();
    rendreFiltreFavoris();
    rendrePuces();
    initialiserPrix();
    rendreCatalogue();
    rendrePanier();
    brancherEvenements();
  }

  initialiser();
})();
