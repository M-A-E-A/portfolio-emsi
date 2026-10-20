// =====================================================================
// Portfolio — Abderrahmane El ADNANI
// Interactions (JavaScript, sans dépendance externe).
// ---------------------------------------------------------------------
// Chaque bloc suit la même logique :
//   1. retrouver l'élément  →  2. écouter un événement  →  3. modifier la page
// Un garde-fou (if) protège chaque bloc : un élément absent ne casse pas le reste.
// =====================================================================

( function () {
  'use strict';

  const $  = ( sel, racine = document ) => racine.querySelector( sel );
  const $$ = ( sel, racine = document ) => Array.from( racine.querySelectorAll( sel ) );

  // Le fond « constellation » redessine ses couleurs quand le thème change,
  // mais seulement s'il est figé (prefers-reduced-motion). Déclaré ici car
  // appliquerTheme() plus bas en parle avant que la section 6 l'assigne.
  let redessinerFond = null;

  // -----------------------------------------------------------------
  // 1. Thème sombre / clair — mémorisé dans localStorage
  // -----------------------------------------------------------------
  const CLE_THEME = 'portfolio-theme';

  function appliquerTheme( sombre ) {
    document.body.classList.toggle( 'sombre', sombre );
    const bouton = $( '#theme' );
    if ( bouton ) {
      bouton.setAttribute( 'aria-label', sombre ? 'Basculer en mode clair' : 'Basculer en mode sombre' );
      bouton.title = sombre ? 'Mode clair' : 'Mode sombre';
    }
    if ( typeof redessinerFond === 'function' ) redessinerFond();
    try { localStorage.setItem( CLE_THEME, sombre ? 'sombre' : 'clair' ); } catch ( e ) { /* stockage indisponible */ }
  }

  function themeInitial() {
    let prefere = null;
    try { prefere = localStorage.getItem( CLE_THEME ); } catch ( e ) { /* ignore */ }
    if ( prefere ) return prefere === 'sombre';
    return window.matchMedia( '(prefers-color-scheme: dark)' ).matches;
  }

  appliquerTheme( themeInitial() );

  const boutonTheme = $( '#theme' );
  if ( boutonTheme ) {
    boutonTheme.addEventListener( 'click', function () {
      appliquerTheme( ! document.body.classList.contains( 'sombre' ) );
    } );
  }

  // -----------------------------------------------------------------
  // 2. Menu mobile — ouvrir / fermer
  // -----------------------------------------------------------------
  const menu  = $( '#menu' );
  const nav   = $( '#navigation' );

  if ( menu && nav ) {
    const ouvrirMenu = ( ouverture ) => {
      nav.classList.toggle( 'ouvert', ouverture );
      menu.setAttribute( 'aria-expanded', String( ouverture ) );
      menu.setAttribute( 'aria-label', ouverture ? 'Fermer le menu' : 'Ouvrir le menu' );
    };

    menu.addEventListener( 'click', () => ouvrirMenu( ! nav.classList.contains( 'ouvert' ) ) );
    $$( 'a', nav ).forEach( ( a ) => a.addEventListener( 'click', () => ouvrirMenu( false ) ) );

    // Clic à l'extérieur : on referme
    document.addEventListener( 'click', ( e ) => {
      if ( nav.classList.contains( 'ouvert' ) && ! nav.contains( e.target ) && ! menu.contains( e.target ) ) {
        ouvrirMenu( false );
      }
    } );
    // Échap : on referme
    document.addEventListener( 'keydown', ( e ) => {
      if ( e.key === 'Escape' && nav.classList.contains( 'ouvert' ) ) {
        ouvrirMenu( false );
        menu.focus();
      }
    } );
  }

  // -----------------------------------------------------------------
  // 3. « Voir plus / moins » sur les projets (délégation d'événement)
  // -----------------------------------------------------------------
  const projets = $( '.projets' );
  if ( projets ) {
    projets.addEventListener( 'click', ( e ) => {
      const bouton = e.target.closest( '.lien[data-cible]' );
      if ( ! bouton ) return;

      const details = document.getElementById( bouton.dataset.cible );
      if ( ! details ) return;

      const ouvre = details.hidden;
      details.hidden = ! ouvre;
      bouton.setAttribute( 'aria-expanded', String( ouvre ) );
      // Seul le libellé change ; le chevron pivote via [aria-expanded] en CSS.
      const label = bouton.querySelector( '.lien-label' );
      if ( label ) label.textContent = ouvre ? 'Voir moins' : 'Voir plus';
    } );
  }

  // -----------------------------------------------------------------
  // 4. Coordonnées dans une alerte
  // -----------------------------------------------------------------
  const coordonnees = $( '#coordonnees' );
  if ( coordonnees ) {
    coordonnees.addEventListener( 'click', () => {
      alert(
        'Mes coordonnées\n\n' +
        'E-mail : m.a.eladnani1@gmail.com\n' +
        'Téléphone : +212 7 77 60 92 28\n' +
        'Ville : Marrakech, Maroc'
      );
    } );
  }

  // -----------------------------------------------------------------
  // 5. Message d'accueil selon l'heure
  // -----------------------------------------------------------------
  const salutation = $( '#salutation' );
  if ( salutation ) {
    const h = new Date().getHours();
    const messages = [
      [ 5,  12, 'Bonjour' ],
      [ 12, 18, 'Bon après-midi' ],
      [ 18, 22, 'Bonsoir' ],
      [ 22, 24, 'Bonne nuit' ],
      [ 0,  5,  'Bonne nuit' ]
    ];
    for ( const [ debut, fin, texte ] of messages ) {
      if ( h >= debut && h < fin ) { salutation.textContent = texte; break; }
    }
  }

  // -----------------------------------------------------------------
  // 6. Barres de compétences animées (IntersectionObserver)
  // -----------------------------------------------------------------
  const skills = $$( '.skill' );

  function remplirSkill( el ) {
    const fill = $( '.skill-fill', el );
    if ( fill ) fill.style.width = el.dataset.niveau + '%';
  }

  if ( skills.length ) {
    if ( 'IntersectionObserver' in window ) {
      const io = new IntersectionObserver( ( entrees, obs ) => {
        entrees.forEach( ( entree ) => {
          if ( ! entree.isIntersecting ) return;
          remplirSkill( entree.target );
          obs.unobserve( entree.target );
        } );
      }, { threshold: 0.2, rootMargin: '0px 0px -40px 0px' } );

      skills.forEach( ( el ) => io.observe( el ) );

      // Filet de sécurité : au bout de 3 s, on remplit ce qui ne l'est pas encore.
      window.setTimeout( () => skills.forEach( remplirSkill ), 3000 );
    } else {
      skills.forEach( remplirSkill );
    }
  }

  // -----------------------------------------------------------------
  // 7. Formulaire validé (pas d'envoi réel)
  // -----------------------------------------------------------------
  const formulaire = $( '#formulaire' );
  if ( formulaire ) {
    const message   = $( '#form-message' );
    const champs    = {
      nom:     $( '#nom' ),
      email:   $( '#email' ),
      texte:   $( '#message' ),
      consent: $( '#ok' )
    };
    const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const afficherMessage = ( texte, type ) => {
      if ( ! message ) return;
      message.hidden = false;
      message.className = 'form-message ' + type;
      message.textContent = texte;
    };

    formulaire.addEventListener( 'submit', ( e ) => {
      e.preventDefault();
      $$( '.invalide', formulaire ).forEach( ( c ) => c.classList.remove( 'invalide' ) );

      const erreurs = [];

      if ( champs.nom.value.trim().length < 2 ) {
        erreurs.push( 'Indiquez votre nom.' );
        champs.nom.classList.add( 'invalide' );
      }
      if ( ! EMAIL_RE.test( champs.email.value.trim() ) ) {
        erreurs.push( 'Vérifiez votre e-mail.' );
        champs.email.classList.add( 'invalide' );
      }
      if ( champs.texte.value.trim().length < 10 ) {
        erreurs.push( 'Votre message est trop court (10 caractères minimum).' );
        champs.texte.classList.add( 'invalide' );
      }
      if ( ! champs.consent.checked ) {
        erreurs.push( 'Cochez la case de consentement.' );
      }

      if ( erreurs.length ) {
        afficherMessage( erreurs.join( ' ' ), 'erreur' );
        ( formulaire.querySelector( '.invalide' ) || champs.nom ).focus();
        return;
      }

      afficherMessage( 'Merci ' + champs.nom.value.trim() + ', votre message est bien pris en compte. Je vous réponds rapidement.', 'succes' );
      formulaire.reset();
    } );

    // On efface l'erreur d'un champ dès qu'on le corrige
    $$( 'input, textarea', formulaire ).forEach( ( champ ) => {
      champ.addEventListener( 'input', () => champ.classList.remove( 'invalide' ) );
    } );
  }

  // -----------------------------------------------------------------
  // 8. Année automatique dans le pied de page
  // -----------------------------------------------------------------
  const annee = $( '#annee' );
  if ( annee ) annee.textContent = new Date().getFullYear();

  // -----------------------------------------------------------------
  // 9. Lien du menu mis en évidence pendant le défilement (scrollspy)
  // -----------------------------------------------------------------
  const liensNav = $$( '#navigation a' );
  const sections = $$( 'main section[id]' );

  if ( liensNav.length && sections.length && 'IntersectionObserver' in window ) {
    const marquer = ( id ) => {
      liensNav.forEach( ( a ) => {
        a.setAttribute( 'aria-current', a.getAttribute( 'href' ) === '#' + id ? 'true' : 'false' );
      } );
    };

    const io = new IntersectionObserver( ( entrees ) => {
      entrees.forEach( ( entree ) => {
        if ( entree.isIntersecting ) marquer( entree.target.id );
      } );
    }, { rootMargin: '-45% 0px -50% 0px' } );

    sections.forEach( ( s ) => io.observe( s ) );
  }

  // -----------------------------------------------------------------
  // 6. Fond — six variantes choisies par le visiteur
  // -----------------------------------------------------------------
  // Chaque page du portfolio contient déjà la couche .fond-anime (voir §12
  // de style.css). On lui pose un attribut data-fond et on reconstruit ses
  // calques : aucun fichier HTML n'est modifié, la même source tourne donc
  // sur les neuf pages. Sans JavaScript, la page garde l'aurore d'origine.
  const CLE_FOND = 'portfolio-fond';
  const CLE_FOND_ANIME = 'lume-fond-anime';

  /** L'animation du fond est-elle active ? (cle partagee avec les demos) */
  function fondAnimeActif() {
    try {
      return localStorage.getItem( CLE_FOND_ANIME ) !== 'off';
    } catch ( e ) {
      return true;
    }
  }

  /** Active ou coupe le mouvement du fond, et le memorise. */
  function appliquerFondAnime( actif ) {
    if ( ! fond ) return;
    if ( actif ) fond.removeAttribute( 'data-fond-anime' );
    else fond.setAttribute( 'data-fond-anime', 'off' );
    try {
      localStorage.setItem( CLE_FOND_ANIME, actif ? 'on' : 'off' );
    } catch ( e ) { /* stockage indisponible */ }
  }
  const FONDS = [
    { id: 'grille',   nom: 'Grille de points',   note: 'Quadrillage fin et lueur lente' },
    { id: 'soie',     nom: 'Rubans d’aurore', note: 'Nappes indigo qui tournent' },
    { id: 'contours', nom: 'Lignes de niveau',   note: 'Carte topographique' },
    { id: 'plat',     nom: 'Plat et lumière',    note: 'Deux plans qui glissent' },
    { id: 'etoiles',  nom: 'Constellation',      note: 'Points reliés, suit le curseur' },
    { id: 'aurore',   nom: 'Aurore (d’origine)', note: 'Les quatre taches qui dérivent' }
  ];

  const fond = $( '.fond-anime' );
  let arretConstellation = null;

  function element( tag, classe ) {
    const n = document.createElement( tag );
    if ( classe ) n.className = classe;
    return n;
  }

  // --- Constellation : dessinée sur canvas, couleur relue à chaque image
  //     pour suivre le thème sans avoir à tout reconstruire.
  function demarrerConstellation( canvas ) {
    if ( ! canvas || ! canvas.getContext ) return null;
    const ctx = canvas.getContext( '2d' );
    if ( ! ctx ) return null;

    // Le fond décoratif reste animé même quand le système demande moins
    // d'animation : c'est un écoulement lent (10 px/s) de faible
    // amplitude, qui ne déclenche pas de trouble vestibulaire. Le
    // mouvement réduit reste appliqué au reste de la page.
    let points = [];
    let boucle = 0;
    const curseur = { x: -9999, y: -9999 };

    function ajuster() {
      if ( ! fond ) return;
      canvas.width  = fond.clientWidth;
      canvas.height = fond.clientHeight;
      const n = Math.max( 18, Math.min( 70, Math.round( canvas.width / 32 ) ) );
      points = [];
      for ( let i = 0; i < n; i++ ) {
        points.push( {
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: ( Math.random() - .5 ) * .9,
          vy: ( Math.random() - .5 ) * .9,
          phase: Math.random() * Math.PI * 2
        } );
      }
    }

    function dessiner() {
      const sombre = document.body.classList.contains( 'sombre' );
      const cAccent = sombre ? '125,160,255' : '27,77,228';
      const cPoint  = sombre ? '255,255,255' : '18,22,28';
      const n = points.length;
      const instant = performance.now() / 1000;

      ctx.clearRect( 0, 0, canvas.width, canvas.height );

      for ( let i = 0; i < n; i++ ) {
        const p = points[ i ];
        p.x += p.vx; p.y += p.vy;
        if ( p.x < 0 || p.x > canvas.width )  p.vx *= -1;
        if ( p.y < 0 || p.y > canvas.height ) p.vy *= -1;

        for ( let j = i + 1; j < n; j++ ) {
          const q = points[ j ];
          const dx = p.x - q.x, dy = p.y - q.y;
          const d = Math.sqrt( dx * dx + dy * dy );
          if ( d < 74 ) {
            ctx.strokeStyle = 'rgba(' + cAccent + ',' + ( .12 * ( 1 - d / 74 ) ).toFixed( 3 ) + ')';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo( p.x, p.y );
            ctx.lineTo( q.x, q.y );
            ctx.stroke();
          }
        }

        const mx = p.x - curseur.x, my = p.y - curseur.y;
        const dm = Math.sqrt( mx * mx + my * my );
        const actif = dm < 110;
        if ( actif ) {
          ctx.strokeStyle = 'rgba(' + cAccent + ',' + ( .45 * ( 1 - dm / 110 ) ).toFixed( 3 ) + ')';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo( p.x, p.y );
          ctx.lineTo( curseur.x, curseur.y );
          ctx.stroke();
        }

        // Scintillement : chaque point pulse, ce qui rend le mouvement
        // immediatement perceptible meme quand les points sont fixes.
        const pulse = .62 + .38 * Math.sin( instant * 1.7 + p.phase );
        ctx.fillStyle = actif
          ? 'rgba(' + cAccent + ',.9)'
          : 'rgba(' + cPoint + ',' + ( sombre ? ( .3 + .35 * pulse ) : ( .22 + .3 * pulse ) ).toFixed( 3 ) + ')';
        ctx.beginPath();
        ctx.arc( p.x, p.y, ( actif ? 2.8 : 1.8 ) * ( .82 + .3 * pulse ), 0, Math.PI * 2 );
        ctx.fill();
      }

      boucle = requestAnimationFrame( dessiner );
    }

    ajuster();
    dessiner();

    // .fond-anime est en pointer-events:none : on écoute sur le document.
    const surMolette = function ( e ) { curseur.x = e.clientX; curseur.y = e.clientY; };
    const quitter = function () { curseur.x = -9999; curseur.y = -9999; };
    const recalculer = function () { cancelAnimationFrame( boucle ); ajuster(); dessiner(); };

    document.addEventListener( 'mousemove', surMolette );
    document.addEventListener( 'mouseleave', quitter );
    window.addEventListener( 'blur', quitter );
    window.addEventListener( 'resize', recalculer );

    // Le fond est animé en continu : le redessiner à chaque changement de
    // thème suffit (la boucle requestAnimationFrame s'en charge).
    redessinerFond = dessiner;

    return function () {
      cancelAnimationFrame( boucle );
      document.removeEventListener( 'mousemove', surMolette );
      document.removeEventListener( 'mouseleave', quitter );
      window.removeEventListener( 'blur', quitter );
      window.removeEventListener( 'resize', recalculer );
      redessinerFond = null;
    };
  }

  // --- Reconstruction des calques de la variante demandée
  function poserCalques( id ) {
    if ( ! fond ) return;
    if ( arretConstellation ) { arretConstellation(); arretConstellation = null; }
    while ( fond.firstChild ) fond.removeChild( fond.firstChild );

    if ( id === 'aurore' ) {
      [ 'blob-1', 'blob-2', 'blob-3', 'blob-4' ].forEach( function ( c ) {
        fond.appendChild( element( 'span', 'blob ' + c ) );
      } );
    } else if ( id === 'soie' ) {
      [ 'ruban-1', 'ruban-2', 'ruban-3' ].forEach( function ( c ) {
        fond.appendChild( element( 'span', 'ruban ' + c ) );
      } );
    } else if ( id === 'grille' ) {
      // Le quadrillage est porte par un calque enfant deplace en transform.
      fond.appendChild( element( 'span', 'trame' ) );
    } else if ( id === 'contours' ) {
      // Les anneaux, eux aussi, sur un calque enfant.
      fond.appendChild( element( 'span', 'topo' ) );
    } else if ( id === 'plat' ) {
      [ 'plan-1', 'plan-2', 'plan-3' ].forEach( function ( c ) {
        fond.appendChild( element( 'span', 'plan ' + c ) );
      } );
    } else if ( id === 'etoiles' ) {
      const canvas = element( 'canvas', 'etoiles' );
      fond.appendChild( canvas );
      arretConstellation = demarrerConstellation( canvas );
    }

    fond.appendChild( element( 'span', 'grain' ) );
  }

  function poserFond( id ) {
    if ( ! fond ) return;
    const connu = FONDS.some( function ( f ) { return f.id === id; } );
    if ( ! connu ) id = 'grille';
    fond.setAttribute( 'data-fond', id );
    poserCalques( id );
    // On conserve l'etat de l'interrupteur quand la variante change.
    if ( fondAnimeActif() ) fond.removeAttribute( 'data-fond-anime' );
    else fond.setAttribute( 'data-fond-anime', 'off' );
    try { localStorage.setItem( CLE_FOND, id ); } catch ( e ) { /* stockage indisponible */ }
    return id;
  }

  function fondInitial() {
    try {
      const mémorise = localStorage.getItem( CLE_FOND );
      if ( mémorise ) return mémorise;
    } catch ( e ) { /* ignore */ }
    return 'grille';
  }

  poserFond( fondInitial() );

  // --- Le sélecteur : un bouton fixe qui ouvre une liste de radios
  function creerSelecteur() {
    if ( ! fond ) return;

    const bouton = element( 'button', 'fond-choix-bouton' );
    bouton.type = 'button';
    bouton.id = 'fond-bouton';
    // Le libellé visible (« Fond ») fait partie de ce nom : l'entrée au
    // clavier et le lecteur d'écran restent cohérents avec l'écran.
    bouton.setAttribute( 'aria-label', 'Choisir le fond de la page' );
    bouton.setAttribute( 'aria-expanded', 'false' );
    bouton.setAttribute( 'aria-controls', 'fond-panneau' );
    bouton.innerHTML =
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false">' +
      '<rect x="3" y="3" width="7" height="7" rx="1.5"/>' +
      '<rect x="14" y="3" width="7" height="7" rx="1.5"/>' +
      '<rect x="3" y="14" width="7" height="7" rx="1.5"/>' +
      '<rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';
    const libelle = element( 'span', 'fond-choix-libelle' );
    libelle.textContent = 'Fond';
    bouton.appendChild( libelle );

    const panneau = element( 'div', 'fond-choix-panneau' );
    panneau.id = 'fond-panneau';
    panneau.hidden = true;

    const fs = element( 'fieldset' );
    const legende = element( 'legend' );
    legende.textContent = 'Choisir le fond de la page';
    fs.appendChild( legende );

    FONDS.forEach( function ( f ) {
      const label = element( 'label', 'fond-option' );

      const radio = document.createElement( 'input' );
      radio.type = 'radio';
      radio.name = 'fond';
      radio.value = f.id;
      radio.checked = f.id === fond.getAttribute( 'data-fond' );
      radio.addEventListener( 'change', function () { poserFond( f.id ); } );

      const apercu = element( 'span', 'fond-apercu apercu-' + f.id );
      apercu.setAttribute( 'aria-hidden', 'true' );

      const texte = element( 'span', 'fond-option-texte' );
      const nom = element( 'b' );
      nom.textContent = f.nom;
      const note = element( 'span' );
      note.textContent = f.note;
      texte.appendChild( nom );
      texte.appendChild( note );

      label.appendChild( radio );
      label.appendChild( apercu );
      label.appendChild( texte );
      fs.appendChild( label );
    } );

    panneau.appendChild( fs );

    // Interrupteur : le fond bouge-t-il ?
    const ligneOption = element( 'label', 'fond-anime-option' );
    const caseAnime = document.createElement( 'input' );
    caseAnime.type = 'checkbox';
    caseAnime.id = 'fond-anime-case';
    caseAnime.checked = fondAnimeActif();
    caseAnime.addEventListener( 'change', function () {
      appliquerFondAnime( caseAnime.checked );
    });
    const texteAnime = element( 'span' );
    texteAnime.textContent = 'Fond animé';
    ligneOption.appendChild( caseAnime );
    ligneOption.appendChild( texteAnime );
    panneau.appendChild( ligneOption );

    function fermer() {
      panneau.hidden = true;
      bouton.setAttribute( 'aria-expanded', 'false' );
    }

    bouton.addEventListener( 'click', function () {
      const ouvrir = panneau.hidden;
      panneau.hidden = ! ouvrir;
      bouton.setAttribute( 'aria-expanded', String( ouvrir ) );
    } );

    document.addEventListener( 'keydown', function ( e ) {
      if ( e.key === 'Escape' && ! panneau.hidden ) { fermer(); bouton.focus(); }
    } );

    // Clic à l'extérieur : on referme. Le clic sur le bouton lui-même est
    // exclu, sinon le panneau se rouvrirait puis se refermerait aussitôt.
    document.addEventListener( 'click', function ( e ) {
      if ( panneau.hidden ) return;
      if ( panneau.contains( e.target ) || bouton.contains( e.target ) ) return;
      fermer();
    } );

    document.body.appendChild( bouton );
    document.body.appendChild( panneau );
  }

  creerSelecteur();

} )();
