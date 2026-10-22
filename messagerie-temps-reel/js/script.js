/* =========================================================================
   Messagerie en temps réel — JavaScript vanilla (script classique, sans module)
   Synchronisation entre les onglets d'un même navigateur :
   1) BroadcastChannel("messagerie") quand il existe ;
   2) repli sur l'événement `storage` sinon.
   En mode full-stack (serveur Node + SQLite), les salons et les messages
   vivent dans la base et un flux SSE (/api/flux) relaye les changements
   d'un navigateur à l'autre — le mécanisme local reste intact.
   Aucune dépendance externe.
   Tout est protégé : l'application fonctionne même si localStorage ou le
   canal de diffusion sont indisponibles (au pire, en mémoire pour l'onglet).
   ========================================================================= */
(function () {
  'use strict';

  /* ------------------------------ Utilitaires ------------------------------ */

  // Utilitaire de stockage sûr : localStorage peut être bloqué en file://.
  const stockage = {
    lire(cle, defaut) { try { const v = localStorage.getItem(cle); return v === null ? defaut : JSON.parse(v); } catch (e) { return defaut; } },
    ecrire(cle, valeur) { try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch (e) {} }
  };

  const $ = function (selecteur) { return document.querySelector(selecteur); };

  // Identifiant court et unique.
  let compteurUid = 0;
  const uid = function () {
    compteurUid += 1;
    return Date.now().toString(36) + '-' + compteurUid.toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  };

  // Identifiant de cet onglet : sert à distinguer deux onglets portant le même nom
  // dans les accusés de lecture « vu par ».
  const ONGLET_ID = uid();

  /* ------------------------------ Constantes ------------------------------ */

  const CLE_SALONS = 'messagerie-salons';
  const CLE_MESSAGES = 'messagerie-messages';
  const CLE_NOM = 'messagerie-nom';
  const CLE_SALON_ACTIF = 'messagerie-salon-actif';
  const CLE_THEME = 'messagerie-theme';
  const CLE_SIGNAL = 'messagerie-signal';   // repli si BroadcastChannel est absent
  const NOM_CANAL = 'messagerie';

  const NOM_PAR_DEFAUT = 'Invité';
  const DELAI_SAISIE = 1500;          // durée de vie de l'indicateur « est en train d'écrire… »
  const ANTI_REBOND_SAISIE = 300;     // intervalle minimal entre deux diffusions de saisie
  const LIBELLE_VIDER = 'Vider le salon';
  const LIBELLE_CONFIRMER = 'Confirmer la suppression ?';
  const VU_DUREE = 24 * 60 * 60 * 1000;   // durée de conservation d'un accusé « vu »
  const DELAI_MARQUAGE = 700;             // intervalle minimal entre deux marquages « vu par »

  const ICONE_POUBELLE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M4 7h16M10 7V5h4v2M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>';

  const ICONE_REAGIR =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<circle cx="12" cy="12" r="9"/><path d="M8.6 14.2a4.4 4.4 0 0 0 6.8 0M9.2 9.5h.01M14.8 9.5h.01"/></svg>';

  const ICONE_REPONDRE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M9 7 4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 5 5v1"/></svg>';

  const ICONE_MODIFIER =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M4 20h4L18.5 9.5l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>';

  const ICONE_EPINGLER =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M9 4h6l-1 6 3 3H7l3-3-1-6z"/><path d="M12 13v7"/></svg>';

  // Jeu fixe de réactions proposées.
  // La clé reste un court identifiant textuel (utilisé comme index de stockage),
  // l'affichage est assuré par des icônes SVG — aucun emoji dans l'interface.
  const EMOJIS = ['pouce', 'coeur', 'rire', 'surprise'];
  const ICONES = {
    pouce: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9.5V5a3 3 0 0 0-3-3l-4 9v11h11.3a2 2 0 0 0 2-1.7l1.4-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>',
    coeur: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21.2l7.8-7.7 1.1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
    rire: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9.5h.01M15 9.5h.01"/></svg>',
    surprise: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M9.5 16.5h.01M14.5 16.5h.01"/></svg>'
  };
  const NOMS_REACTION = {
    pouce: 'Pouce levé', coeur: 'Cœur', rire: 'Rire', surprise: 'Surprise'
  };
  const LONGUEUR_EXTRAIT = 90;

  /* ------------------------------ État ------------------------------ */

  const etat = {
    salons: [],
    messages: [],
    salonActif: null,
    dernierSignalSaisie: 0,
    minuteurIndicateur: null,
    minuteurSynchro: null,
    minuteurVider: null,
    minuteurCible: null,
    attenteConfirmation: false,
    repondreA: null,        // { id, nom, extrait } du message cité en cours de réponse
    edition: null,          // { id, texte, focus } du message en cours d'édition
    reactionOuverte: null,  // id du message dont le sélecteur de réactions est ouvert
    recherche: '',          // terme de recherche local (jamais persisté)
    dernierMarquage: 0,     // horodatage du dernier marquage « vu »
    marquageEnCours: false,
    mentions: {             // état de la liste de suggestions de mention
      ouvert: false,
      debut: -1,            // index du « @ » dans la zone de saisie
      fin: -1,              // index de fin de la requête (position du curseur)
      index: 0,             // suggestion active
      items: []             // noms proposés
    }
  };

  /* ------------------------------ Éléments ------------------------------ */

  const el = {
    nom: $('#nom'),
    theme: $('#theme'),
    nbSalons: $('#nb-salons'),
    listeSalons: $('#liste-salons'),
    formSalon: $('#form-salon'),
    nomSalon: $('#nom-salon'),
    erreurSalon: $('#erreur-salon'),
    titreSalon: $('#titre-salon'),
    messages: $('#messages'),
    vider: $('#vider'),
    formMessage: $('#form-message'),
    zone: $('#zone-saisie'),
    indicateur: $('#saisie-indicateur'),
    reponseApercu: $('#reponse-apercu'),
    reponseTexte: $('#reponse-apercu-texte'),
    reponseAnnuler: $('#reponse-annuler'),
    formRecherche: $('#form-recherche'),
    recherche: $('#recherche'),
    rechercheCompte: $('#recherche-compte'),
    rechercheEffacer: $('#recherche-effacer'),
    epingle: $('#epingle'),
    epingleTexte: $('#epingle-texte'),
    epingleAller: $('#epingle-aller'),
    epingleRetirer: $('#epingle-retirer'),
    mentions: $('#mentions'),
    annee: $('#annee')
  };

  /* ------------------------------ Accès à l'identité ------------------------------ */

  function nomCourant() {
    return el.nom ? String(el.nom.value || '').trim() : '';
  }

  function estMoi(auteur) {
    const nom = nomCourant();
    return nom !== '' && auteur === nom;
  }

  // Recherche un message par identifiant, quel que soit le salon.
  function trouverMessage(id) {
    for (let i = 0; i < etat.messages.length; i += 1) {
      const m = etat.messages[i];
      if (m && m.id === id) return m;
    }
    return null;
  }

  // Extrait court d'un texte, pour les réponses citées.
  function extraire(texte) {
    const t = String(texte == null ? '' : texte).replace(/\s+/g, ' ').trim();
    return t.length > LONGUEUR_EXTRAIT ? t.slice(0, LONGUEUR_EXTRAIT).trim() + '…' : t;
  }

  function mouvementReduit() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* ------------------------------ Texte : recherche, mentions ------------------------------ */

  // Normalise une chaîne pour comparer sans tenir compte de la casse ni des accents.
  // Avec `avecCarte`, renvoie aussi la correspondance index normalisé → index d'origine,
  // indispensable pour surligner la bonne portion du texte réel.
  function normaliser(texte, avecCarte) {
    const source = String(texte == null ? '' : texte);
    let resultat = '';
    const carte = avecCarte ? [] : null;

    for (let i = 0; i < source.length; i += 1) {
      const caractere = source.charAt(i);
      let decompose;
      try {
        decompose = caractere.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      } catch (e) {
        decompose = caractere.toLowerCase();
      }
      for (let k = 0; k < decompose.length; k += 1) {
        resultat += decompose.charAt(k);
        if (carte) carte.push(i);
      }
    }
    if (carte) carte.push(source.length); // sentinelle : index juste après la fin
    return { texte: resultat, carte: carte };
  }

  function termeNormalise(texte) {
    return normaliser(texte, false).texte;
  }

  // Vrai si le caractère peut appartenir à un mot (sert à délimiter une mention).
  function estCaractereMot(c) {
    if (c === '') return false;
    if (/[0-9A-Za-z_]/.test(c)) return true;
    return (c >= '\u00C0' && c <= '\u024F') || (c >= '\u1E00' && c <= '\u1EFF');
  }

  function correspondRecherche(texte, terme) {
    if (!terme) return true;
    return normaliser(texte, false).texte.indexOf(terme) !== -1;
  }

  // Positions du terme recherché, exprimées en index du texte d'origine.
  function positionsRecherche(texte, terme) {
    const positions = [];
    if (!terme) return positions;

    const normalise = normaliser(texte, true);
    const contenu = normalise.texte;
    const carte = normalise.carte;
    let curseur = 0;

    while (curseur <= contenu.length - terme.length) {
      const trouve = contenu.indexOf(terme, curseur);
      if (trouve === -1) break;
      const fin = trouve + terme.length;
      positions.push({ debut: carte[trouve], fin: carte[fin], type: 'recherche' });
      curseur = fin;
      if (positions.length >= 200) break; // garde-fou : jamais de boucle pathologique
    }
    return positions;
  }

  // Positions des mentions « @Nom », exprimées en index du texte d'origine.
  function positionsMentions(texte, noms) {
    const positions = [];
    if (!noms || noms.length === 0) return positions;

    // Les noms les plus longs d'abord : « Jean Dupont » avant « Jean ».
    const tries = noms.slice().sort(function (a, b) { return b.norm.length - a.norm.length; });
    let curseur = 0;

    while (curseur < texte.length) {
      const arobase = texte.indexOf('@', curseur);
      if (arobase === -1) break;

      // Un « @ » collé à un mot (adresse e-mail) n'ouvre pas de mention.
      const avant = arobase > 0 ? texte.charAt(arobase - 1) : '';
      if (estCaractereMot(avant)) { curseur = arobase + 1; continue; }

      const suite = normaliser(texte.slice(arobase + 1), true);
      let trouve = null;
      for (let i = 0; i < tries.length; i += 1) {
        const nom = tries[i];
        if (nom.norm === '' || suite.texte.indexOf(nom.norm) !== 0) continue;
        const longueur = suite.carte[nom.norm.length];
        const apres = texte.charAt(arobase + 1 + longueur);
        if (estCaractereMot(apres)) continue; // « @Ali » ne matche pas « @Alice »
        trouve = { debut: arobase, fin: arobase + 1 + longueur, type: 'mention', nom: nom.nom };
        break;
      }

      if (trouve) { positions.push(trouve); curseur = trouve.fin; }
      else curseur = arobase + 1;
      if (positions.length >= 200) break;
    }
    return positions;
  }

  // Construit un fragment DOM sûr : texte brut + <mark> de recherche + <span> de mention.
  // Aucun HTML utilisateur n'est injecté : uniquement des nœuds texte et des éléments créés.
  function fragmentRiche(texte, terme, noms) {
    const fragment = document.createDocumentFragment();
    const source = String(texte == null ? '' : texte);

    const segments = positionsRecherche(source, terme);
    positionsMentions(source, noms).forEach(function (mention) {
      const chevauche = segments.some(function (s) {
        return mention.debut < s.fin && s.debut < mention.fin;
      });
      if (!chevauche) segments.push(mention); // la recherche prime sur la mention
    });
    segments.sort(function (a, b) { return a.debut - b.debut; });

    let curseur = 0;
    segments.forEach(function (segment) {
      if (segment.debut < curseur) return;
      if (segment.debut > curseur) {
        fragment.appendChild(document.createTextNode(source.slice(curseur, segment.debut)));
      }

      if (segment.type === 'recherche') {
        const marque = document.createElement('mark');
        marque.className = 'surlignage';
        marque.textContent = source.slice(segment.debut, segment.fin);
        fragment.appendChild(marque);
      } else {
        const pastille = document.createElement('span');
        pastille.className = 'mention' + (estMoi(segment.nom) ? ' mention--moi' : '');
        pastille.textContent = source.slice(segment.debut, segment.fin);
        fragment.appendChild(pastille);
      }
      curseur = segment.fin;
    });

    fragment.appendChild(document.createTextNode(source.slice(curseur)));
    return fragment;
  }

  // Noms connus dans le salon actif : auteurs des messages + utilisateur courant.
  function nomsParticipants() {
    const vus = {};
    const liste = [];

    const ajouter = function (nom) {
      const valeur = String(nom == null ? '' : nom).trim();
      const norm = termeNormalise(valeur);
      if (norm === '' || vus[norm]) return;
      vus[norm] = true;
      liste.push({ nom: valeur, norm: norm });
    };

    etat.messages.forEach(function (message) {
      if (message && message.salonId === etat.salonActif && message.auteur) ajouter(message.auteur);
    });

    const moi = nomCourant();
    if (moi !== '') ajouter(moi);

    liste.sort(function (a, b) { return a.nom.localeCompare(b.nom, 'fr'); });
    return liste;
  }

  /* ------------------------------ Dates ------------------------------ */

  function analyserDate(valeur) {
    const d = new Date(valeur);
    return isNaN(d.getTime()) ? new Date() : d;
  }

  function formaterHeure(d) {
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return h + ':' + m;
  }

  function cleJour(d) {
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function memeJour(a, b) {
    return cleJour(a) === cleJour(b);
  }

  function libelleJour(d) {
    const auj = new Date();
    const hier = new Date();
    hier.setDate(hier.getDate() - 1);

    if (memeJour(d, auj)) return "Aujourd'hui";
    if (memeJour(d, hier)) return 'Hier';

    let libelle;
    try {
      libelle = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
    } catch (e) {
      libelle = d.toLocaleDateString();
    }
    if (d.getFullYear() !== auj.getFullYear()) libelle += ' ' + d.getFullYear();
    return libelle;
  }

  /* ------------------------------ Persistance ------------------------------ */

  function sauverSalons() {
    stockage.ecrire(CLE_SALONS, etat.salons);
  }

  function sauverMessages() {
    stockage.ecrire(CLE_MESSAGES, etat.messages);
  }

  function compterMessages(salonId) {
    return etat.messages.filter(function (m) { return m && m.salonId === salonId; }).length;
  }

  function nomSalon(id) {
    const salon = etat.salons.filter(function (s) { return s.id === id; })[0];
    return salon ? salon.nom : '—';
  }

  // Validation légère : protège l'application contre un stockage corrompu.
  function salonsValides(liste) {
    if (!Array.isArray(liste)) return null;
    const propres = liste.filter(function (s) {
      return s && typeof s.id === 'string' && s.id !== '' && typeof s.nom === 'string' && s.nom.trim() !== '';
    });
    return propres.length > 0 ? propres : null;
  }

  function messagesValides(liste) {
    if (!Array.isArray(liste)) return null;
    return liste.filter(function (m) {
      return m && typeof m.id === 'string' && typeof m.salonId === 'string' &&
             typeof m.auteur === 'string' && typeof m.texte === 'string' && typeof m.date === 'string';
    });
  }

  function salonParId(id) {
    for (let i = 0; i < etat.salons.length; i += 1) {
      if (etat.salons[i] && etat.salons[i].id === id) return etat.salons[i];
    }
    return null;
  }

  // Message épinglé du salon actif (ou null si absent / introuvable).
  function messageEpingle() {
    const salon = salonParId(etat.salonActif);
    if (!salon || typeof salon.epingle !== 'string') return null;
    const message = trouverMessage(salon.epingle);
    return (message && message.salonId === salon.id) ? message : null;
  }

  // Supprime les épingles qui pointent vers un message disparu (données distantes comprises).
  function nettoyerEpingles() {
    let modifie = false;
    etat.salons.forEach(function (salon) {
      if (!salon || typeof salon.epingle !== 'string') return;
      const message = trouverMessage(salon.epingle);
      if (!message || message.salonId !== salon.id) {
        delete salon.epingle;
        modifie = true;
      }
    });
    if (modifie) sauverSalons();
  }

  // Noms des autres onglets ayant vu le message (hors onglet courant), dédoublonnés.
  function nomsVus(message) {
    if (!message || !message.vu || typeof message.vu !== 'object') return [];
    const vus = {};
    const noms = [];
    Object.keys(message.vu).forEach(function (cle) {
      if (cle === ONGLET_ID) return; // on ne s'affiche pas soi-même
      const entree = message.vu[cle];
      if (!entree || typeof entree !== 'object') return;
      const nom = String(entree.nom == null ? '' : entree.nom).trim();
      const norm = termeNormalise(nom);
      if (norm === '' || vus[norm]) return;
      vus[norm] = true;
      noms.push(nom);
    });
    return noms;
  }

  // Marque les messages du salon actif comme vus par cet onglet, et diffuse la mise à jour.
  function marquerVus() {
    if (etat.marquageEnCours || !etat.salonActif) return;
    if (typeof document !== 'undefined' && document.hidden) return; // onglet en arrière-plan

    const maintenant = Date.now();
    if (maintenant - etat.dernierMarquage < DELAI_MARQUAGE) return;

    // On relit le stockage pour ne pas écraser un message arrivé entre-temps.
    const messages = messagesValides(stockage.lire(CLE_MESSAGES, null)) || etat.messages;
    const nom = nomCourant();
    const date = new Date().toISOString();
    let modifie = false;

    messages.forEach(function (message) {
      if (!message || message.salonId !== etat.salonActif) return;
      if (!message.vu || typeof message.vu !== 'object') message.vu = {};

      Object.keys(message.vu).forEach(function (cle) {
        const entree = message.vu[cle];
        const age = entree && typeof entree === 'object' ? maintenant - Date.parse(entree.date) : NaN;
        if (!entree || typeof entree !== 'object' || !isFinite(age) || age > VU_DUREE) {
          delete message.vu[cle];
          modifie = true;
        }
      });

      if (typeof message.vu[ONGLET_ID] !== 'object') {
        message.vu[ONGLET_ID] = { nom: nom === '' ? NOM_PAR_DEFAUT : nom, date: date };
        modifie = true;
      }
    });

    etat.dernierMarquage = maintenant;
    if (!modifie) return;

    etat.messages = messages;
    etat.marquageEnCours = true;
    sauverMessages();
    diffuser({ type: 'message', salonId: etat.salonActif });
    etat.marquageEnCours = false;
  }

  /* ------------------------------ Diffusion temps réel ------------------------------ */

  let canal = null;

  function ouvrirCanal() {
    try {
      if (typeof BroadcastChannel === 'function') {
        canal = new BroadcastChannel(NOM_CANAL);
        canal.onmessage = function (evenement) {
          traiterSignal(evenement && evenement.data);
        };
      }
    } catch (e) {
      canal = null; // navigateur sans BroadcastChannel : on passera par `storage`
    }
  }

  // Diffuse un signal aux autres onglets.
  function diffuser(donnees) {
    let envoye = false;

    try {
      if (canal) {
        canal.postMessage(donnees);
        envoye = true;
      }
    } catch (e) { /* ignoré */ }

    // Repli : une écriture déclenche l'événement `storage` dans les autres onglets.
    if (!envoye) {
      try {
        localStorage.setItem(CLE_SIGNAL, JSON.stringify({
          donnees: donnees,
          jeton: Date.now() + Math.random()
        }));
      } catch (e) { /* ignoré */ }
    }

    // En mode serveur, l'indicateur de saisie est aussi relayé par le serveur :
    // il traverse alors les navigateurs, et pas seulement les onglets.
    if (moteurDistant && donnees && donnees.type === 'saisie') {
      window.LumeAPI.appeler('POST', 'api/saisie', donnees).catch(sansErreur);
    }
  }

  function traiterSignal(donnees) {
    if (!donnees || typeof donnees !== 'object') return;

    if (donnees.type === 'message') {
      // Les données ont changé ailleurs : on relit et on rafraîchit.
      planifierSynchro();
      return;
    }

    if (donnees.type === 'saisie') {
      if (donnees.salonId !== etat.salonActif) return;
      if (!donnees.auteur || estMoi(donnees.auteur)) return; // jamais pour soi-même
      afficherIndicateur(donnees.auteur);
    }
  }

  // Regroupe les rafraîchissements (BroadcastChannel + storage peuvent arriver ensemble).
  function planifierSynchro() {
    if (etat.minuteurSynchro) return;
    etat.minuteurSynchro = setTimeout(function () {
      etat.minuteurSynchro = null;
      synchroniser();
    }, 40);
  }

  // Relit l'état partagé et redessine l'interface.
  function synchroniser() {
    const salonsDistants = salonsValides(stockage.lire(CLE_SALONS, null));
    if (salonsDistants) {
      etat.salons = salonsDistants;
      if (!etat.salons.some(function (s) { return s.id === etat.salonActif; })) {
        etat.salonActif = etat.salons[0].id;
      }
    }

    const messagesDistants = messagesValides(stockage.lire(CLE_MESSAGES, null));
    if (messagesDistants) etat.messages = messagesDistants;

    nettoyerEpingles();

    el.titreSalon.textContent = nomSalon(etat.salonActif);
    rendreSalons();
    rendreMessages(false);
  }

  function ecouterOnglets() {
    window.addEventListener('storage', function (evenement) {
      if (!evenement) return;

      // Repli principal quand BroadcastChannel n'est pas disponible.
      if (evenement.key === CLE_SIGNAL && evenement.newValue) {
        try {
          const paquet = JSON.parse(evenement.newValue);
          if (paquet && paquet.donnees) traiterSignal(paquet.donnees);
        } catch (e) { /* ignoré */ }
        return;
      }

      // Filet de sécurité : une modification directe des données rafraîchit aussi.
      if (evenement.key === CLE_MESSAGES || evenement.key === CLE_SALONS) {
        planifierSynchro();
        return;
      }

      // Le nom et le thème suivent d'un onglet à l'autre.
      if (evenement.key === CLE_NOM && el.nom && document.activeElement !== el.nom) {
        try {
          const v = evenement.newValue === null ? NOM_PAR_DEFAUT : JSON.parse(evenement.newValue);
          el.nom.value = (typeof v === 'string' && v.trim() !== '') ? v : NOM_PAR_DEFAUT;
          rendreMessages(false);
        } catch (e) { /* valeur illisible : on l'ignore */ }
        return;
      }
      if (evenement.key === CLE_THEME && evenement.newValue) {
        appliquerTheme(evenement.newValue === 'sombre' ? 'sombre' : 'clair', false);
      }
    });
  }

  /* ------------------------------ Indicateur de saisie ------------------------------ */

  function afficherIndicateur(auteur) {
    if (!el.indicateur) return;
    el.indicateur.textContent = auteur + ' est en train d’écrire…';
    if (etat.minuteurIndicateur) clearTimeout(etat.minuteurIndicateur);
    etat.minuteurIndicateur = setTimeout(effacerIndicateur, DELAI_SAISIE);
  }

  function effacerIndicateur() {
    if (etat.minuteurIndicateur) {
      clearTimeout(etat.minuteurIndicateur);
      etat.minuteurIndicateur = null;
    }
    if (el.indicateur) el.indicateur.textContent = '';
  }

  function signalerSaisie() {
    const maintenant = Date.now();
    if (maintenant - etat.dernierSignalSaisie < ANTI_REBOND_SAISIE) return;
    etat.dernierSignalSaisie = maintenant;
    diffuser({ type: 'saisie', salonId: etat.salonActif, auteur: nomCourant() });
  }

  /* ------------------------------ Rendu : salons ------------------------------ */

  function rendreSalons() {
    if (!el.listeSalons) return;
    if (el.nbSalons) el.nbSalons.textContent = String(etat.salons.length);

    el.listeSalons.textContent = '';

    etat.salons.forEach(function (salon) {
      const actif = salon.id === etat.salonActif;

      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.className = 'salon' + (actif ? ' salon--actif' : '');
      bouton.dataset.salon = salon.id;
      if (actif) bouton.setAttribute('aria-current', 'true');

      const nom = document.createElement('span');
      nom.className = 'salon__nom';
      nom.textContent = salon.nom;

      const compteur = document.createElement('span');
      compteur.className = 'salon__compteur';
      compteur.textContent = String(compterMessages(salon.id));

      bouton.appendChild(nom);
      bouton.appendChild(compteur);
      bouton.addEventListener('click', function () { changerSalon(salon.id); });

      el.listeSalons.appendChild(bouton);
    });
  }

  /* ------------------------------ Rendu : messages ------------------------------ */

  function separateurJour(date) {
    const bloc = document.createElement('div');
    bloc.className = 'jour';
    const texte = document.createElement('span');
    texte.className = 'jour__texte';
    texte.textContent = libelleJour(date);
    bloc.appendChild(texte);
    return bloc;
  }

  // Petit bouton d'action d'un message (icône seule, révélé au survol).
  function boutonAction(classe, titre, libelle, icone, action) {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'message__action ' + classe;
    bouton.title = titre;
    bouton.setAttribute('aria-label', libelle);
    bouton.innerHTML = icone; // contenu statique, sûr
    bouton.addEventListener('click', function (evenement) {
      if (evenement && evenement.preventDefault) evenement.preventDefault();
      action();
    });
    return bouton;
  }

  function boutonReaction(message) {
    const ouvert = etat.reactionOuverte === message.id;
    const bouton = boutonAction('message__action--reagir', 'Ajouter une réaction',
      'Ajouter une réaction à ce message', ICONE_REAGIR,
      function () { basculerSelecteurReaction(message.id); });
    bouton.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
    return bouton;
  }

  // Bloc cité d'une réponse : cliquable pour rejoindre le message d'origine.
  function elementCitation(citation) {
    const bloc = document.createElement('button');
    bloc.type = 'button';
    bloc.className = 'citation';
    bloc.title = 'Voir le message d’origine';
    bloc.setAttribute('aria-label', 'Aller au message de ' + citation.nom + ' : ' + citation.extrait);

    const nom = document.createElement('span');
    nom.className = 'citation__nom';
    nom.textContent = '↩ ' + citation.nom;

    const extrait = document.createElement('span');
    extrait.className = 'citation__extrait';
    extrait.textContent = citation.extrait;

    bloc.appendChild(nom);
    bloc.appendChild(extrait);
    bloc.addEventListener('click', function () { ciblerMessage(citation.id); });
    return bloc;
  }

  // Pastilles de réactions affichées sous le message.
  function elementReactions(message) {
    if (!message.reactions || typeof message.reactions !== 'object') return null;

    const presents = EMOJIS.filter(function (cle) {
      return Array.isArray(message.reactions[cle]) && message.reactions[cle].length > 0;
    });
    if (presents.length === 0) return null;

    const rang = document.createElement('div');
    rang.className = 'message__reactions';

    const nom = nomCourant();
    presents.forEach(function (cle) {
      const noms = message.reactions[cle];
      const aMoi = nom !== '' && noms.indexOf(nom) !== -1;
      const libelle = NOMS_REACTION[cle] || cle;

      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.className = 'reaction' + (aMoi ? ' reaction--actif' : '');
      bouton.title = noms.join(', ');
      bouton.setAttribute('aria-pressed', aMoi ? 'true' : 'false');
      bouton.setAttribute('aria-label', libelle + ' — ' + noms.length + ' réaction' + (noms.length > 1 ? 's' : '') +
        (aMoi ? ' (vous avez réagi, cliquez pour retirer)' : ' (cliquez pour réagir)'));
      bouton.addEventListener('click', function () { basculerReaction(message.id, cle); });

      const face = document.createElement('span');
      face.className = 'reaction__emoji';
      face.innerHTML = ICONES[cle] || cle;

      const nombre = document.createElement('span');
      nombre.className = 'reaction__nombre';
      nombre.textContent = String(noms.length);

      bouton.appendChild(face);
      bouton.appendChild(nombre);
      rang.appendChild(bouton);
    });

    return rang;
  }

  // Sélecteur compact des réactions disponibles.
  function elementSelecteurReaction(message) {
    const boite = document.createElement('div');
    boite.className = 'reaction-selecteur';
    boite.setAttribute('role', 'group');
    boite.setAttribute('aria-label', 'Choisir une réaction');

    const nom = nomCourant();
    EMOJIS.forEach(function (emoji) {
      const noms = (message.reactions && Array.isArray(message.reactions[emoji])) ? message.reactions[emoji] : [];
      const actif = nom !== '' && noms.indexOf(nom) !== -1;

      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.className = 'reaction-selecteur__btn' + (actif ? ' reaction-selecteur__btn--actif' : '');
      bouton.textContent = emoji;
      bouton.setAttribute('aria-pressed', actif ? 'true' : 'false');
      bouton.setAttribute('aria-label', 'Réagir ' + emoji + ' à ce message');
      bouton.addEventListener('click', function () { basculerReaction(message.id, cle); });
      boite.appendChild(bouton);
    });

    return boite;
  }

  // Édition en place d'un de ses propres messages.
  function elementEdition(message) {
    const boite = document.createElement('div');
    boite.className = 'edition';

    const zone = document.createElement('textarea');
    zone.className = 'edition__zone';
    zone.rows = 2;
    zone.value = (etat.edition && etat.edition.texte != null) ? etat.edition.texte : message.texte;
    zone.setAttribute('aria-label', 'Modifier votre message');
    zone.title = 'Entrée (ou Ctrl+Entrée) pour enregistrer, Échap pour annuler';
    zone.addEventListener('input', function () {
      if (etat.edition && etat.edition.id === message.id) etat.edition.texte = zone.value;
      ajusterHauteurChamp(zone);
    });
    zone.addEventListener('keydown', function (evenement) {
      if (evenement.key === 'Escape') {
        evenement.preventDefault();
        annulerEdition();
        return;
      }
      if (evenement.key === 'Enter' && !evenement.shiftKey) {
        evenement.preventDefault();
        enregistrerEdition(message.id);
      }
    });

    const barre = document.createElement('div');
    barre.className = 'edition__barre';

    const annuler = document.createElement('button');
    annuler.type = 'button';
    annuler.className = 'btn btn--secondaire btn--petit';
    annuler.textContent = 'Annuler';
    annuler.addEventListener('click', function () { annulerEdition(); });

    const enregistrer = document.createElement('button');
    enregistrer.type = 'button';
    enregistrer.className = 'btn btn--primaire btn--petit';
    enregistrer.textContent = 'Enregistrer';
    enregistrer.addEventListener('click', function () { enregistrerEdition(message.id); });

    barre.appendChild(annuler);
    barre.appendChild(enregistrer);
    boite.appendChild(zone);
    boite.appendChild(barre);
    return boite;
  }

  function elementMessage(message, participants) {
    const date = analyserDate(message.date);
    const moi = estMoi(message.auteur);
    const enEdition = !!(etat.edition && etat.edition.id === message.id);
    const epingle = messageEpingle();
    const estEpingle = !!(epingle && epingle.id === message.id);

    const article = document.createElement('article');
    article.className = 'message' + (moi ? ' message--moi' : '') + (estEpingle ? ' message--epingle' : '');
    article.dataset.id = message.id;

    const entete = document.createElement('header');
    entete.className = 'message__entete';

    const auteur = document.createElement('span');
    auteur.className = 'message__auteur';
    auteur.textContent = message.auteur;

    const heure = document.createElement('time');
    heure.className = 'message__heure';
    heure.dateTime = date.toISOString();
    heure.textContent = formaterHeure(date);

    entete.appendChild(auteur);
    entete.appendChild(heure);

    // Marque discrète signalant une édition.
    if (message.modifie === true) {
      const marque = document.createElement('span');
      marque.className = 'message__modifie';
      marque.textContent = 'modifié';
      marque.title = 'Message modifié';
      entete.appendChild(marque);
    }

    // Marque signalant un message épinglé.
    if (estEpingle) {
      const marqueEpingle = document.createElement('span');
      marqueEpingle.className = 'message__epingle';
      marqueEpingle.textContent = 'épinglé';
      marqueEpingle.title = 'Message épinglé dans ce salon';
      entete.appendChild(marqueEpingle);
    }

    // Barre d'actions (révélation au survol ou au focus, comme la suppression).
    const actions = document.createElement('div');
    actions.className = 'message__actions';

    actions.appendChild(boutonReaction(message));
    actions.appendChild(boutonAction('message__action--repondre', 'Répondre',
      'Répondre à ce message de ' + message.auteur, ICONE_REPONDRE,
      function () { demarrerReponse(message.id); }));

    const boutonEpingle = boutonAction('message__action--epingler',
      estEpingle ? 'Désépingler ce message' : 'Épingler ce message',
      (estEpingle ? 'Désépingler' : 'Épingler') + ' le message de ' + message.auteur +
        ' de ' + formaterHeure(date),
      ICONE_EPINGLER,
      function () { basculerEpingle(message.id); });
    boutonEpingle.setAttribute('aria-pressed', estEpingle ? 'true' : 'false');
    actions.appendChild(boutonEpingle);

    if (moi) {
      actions.appendChild(boutonAction('message__action--modifier', 'Modifier',
        'Modifier votre message de ' + formaterHeure(date), ICONE_MODIFIER,
        function () { demarrerEdition(message.id); }));
      actions.appendChild(boutonAction('message__action--danger', 'Supprimer ce message',
        'Supprimer votre message de ' + formaterHeure(date), ICONE_POUBELLE,
        function () { supprimerMessage(message.id); }));
    }

    entete.appendChild(actions);
    article.appendChild(entete);

    // Bloc cité : présent seulement sur les réponses et si les données sont saines.
    const citation = message.repondA;
    if (citation && typeof citation === 'object' &&
        typeof citation.id === 'string' && typeof citation.nom === 'string' &&
        typeof citation.extrait === 'string') {
      article.appendChild(elementCitation(citation));
    }

    if (enEdition) {
      article.appendChild(elementEdition(message));
    } else {
      const texte = document.createElement('p');
      texte.className = 'message__texte';
      // Surlignage (recherche) et mentions : uniquement des nœuds texte et <mark>/<span>.
      texte.appendChild(fragmentRiche(message.texte, etat.recherche, participants));
      article.appendChild(texte);
    }

    const resume = elementReactions(message);
    if (resume) article.appendChild(resume);

    // Accusés de lecture : seulement sur ses propres messages.
    if (moi && !enEdition) {
      const vus = elementVus(message);
      if (vus) article.appendChild(vus);
    }

    if (!enEdition && etat.reactionOuverte === message.id) {
      article.appendChild(elementSelecteurReaction(message));
    }

    return article;
  }

  // Phrase « Vu par … » à partir de la liste des noms.
  function libelleVus(noms) {
    if (noms.length === 0) return '';
    if (noms.length === 1) return 'Vu par ' + noms[0];
    if (noms.length <= 3) {
      return 'Vu par ' + noms.slice(0, -1).join(', ') + ' et ' + noms[noms.length - 1];
    }
    const autres = noms.length - 2;
    return 'Vu par ' + noms.slice(0, 2).join(', ') + ' et ' + autres +
      ' autre' + (autres > 1 ? 's' : '');
  }

  function elementVus(message) {
    const noms = nomsVus(message);
    if (noms.length === 0) return null;

    const ligne = document.createElement('p');
    ligne.className = 'message__vu';
    ligne.textContent = libelleVus(noms);
    ligne.title = 'Vu par ' + noms.join(', ');
    return ligne;
  }

  // Met à jour le compteur de résultats de la recherche.
  function majCompteRecherche(nombre, terme) {
    if (el.rechercheEffacer) el.rechercheEffacer.hidden = terme === '';
    if (!el.rechercheCompte) return;

    if (terme === '') {
      el.rechercheCompte.textContent = '';
      el.rechercheCompte.classList.remove('recherche__compte--vide');
      return;
    }

    if (nombre === 0) {
      el.rechercheCompte.textContent = 'Aucun résultat';
      el.rechercheCompte.classList.add('recherche__compte--vide');
      return;
    }

    el.rechercheCompte.textContent = nombre + (nombre > 1 ? ' messages trouvés' : ' message trouvé');
    el.rechercheCompte.classList.remove('recherche__compte--vide');
  }

  // Bandeau du message épinglé (masqué si aucun message n'est épinglé dans ce salon).
  function rendreEpingle() {
    if (!el.epingle) return;

    const message = messageEpingle();
    if (!message) {
      el.epingle.hidden = true;
      if (el.epingleTexte) el.epingleTexte.textContent = '';
      return;
    }

    if (el.epingleTexte) {
      el.epingleTexte.textContent = message.auteur + ' : ' + extraire(message.texte);
    }
    el.epingle.hidden = false;
  }

  function rendreMessages(defiler) {
    const zone = el.messages;
    if (!zone) return;

    // On ne force le défilement que si l'utilisateur était déjà en bas.
    const dejaEnBas = zone.scrollHeight - zone.scrollTop - zone.clientHeight < 90;
    // Position mémorisée : un rendu qui ne défile pas (réactions, sélecteur,
    // arrivée de messages) ne doit pas ramener la vue tout en haut.
    const position = zone.scrollTop;
    const terme = etat.recherche;
    const termeAffiche = (el.recherche && el.recherche.value.trim() !== '') ? el.recherche.value.trim() : terme;
    const participants = nomsParticipants();

    const liste = etat.messages
      .filter(function (m) { return m && m.salonId === etat.salonActif; })
      .slice()
      .sort(function (a, b) { return analyserDate(a.date) - analyserDate(b.date); })
      .filter(function (m) { return correspondRecherche(m.texte, terme); });

    zone.textContent = '';

    if (liste.length === 0) {
      const vide = document.createElement('p');
      vide.className = 'vide';
      vide.textContent = terme
        ? 'Aucun message ne correspond à « ' + termeAffiche + ' » dans ce salon.'
        : 'Aucun message dans ce salon. Écrivez le premier.';
      zone.appendChild(vide);
    } else {
      let jourPrecedent = null;
      liste.forEach(function (message) {
        const date = analyserDate(message.date);
        const cle = cleJour(date);
        if (cle !== jourPrecedent) {
          jourPrecedent = cle;
          zone.appendChild(separateurJour(date));
        }
        zone.appendChild(elementMessage(message, participants));
      });
    }

    majCompteRecherche(liste.length, terme);
    rendreEpingle();

    if (terme !== '' && defiler) {
      zone.scrollTop = 0; // en recherche, on montre le début des résultats
    } else if (defiler && (dejaEnBas || zone.scrollHeight <= zone.clientHeight + 40)) {
      defilerEnBas();
    } else {
      zone.scrollTop = position;
    }

    marquerVus();
  }

  function defilerEnBas() {
    const zone = el.messages;
    if (!zone) return;
    zone.scrollTop = zone.scrollHeight;
  }

  /* ------------------------------ Interactions de message ------------------------------ */

  // Affiche/masque l'aperçu de la réponse en cours, au-dessus du formulaire.
  function appliquerApercuReponse() {
    if (!el.reponseApercu) return;

    const r = etat.repondreA;
    if (!r) {
      el.reponseApercu.hidden = true;
      if (el.reponseTexte) el.reponseTexte.textContent = '';
      return;
    }

    if (el.reponseTexte) el.reponseTexte.textContent = 'Réponse à ' + r.nom + ' : ' + r.extrait;
    el.reponseApercu.hidden = false;
  }

  // Ouvre ou referme le sélecteur d'emoji d'un message (un seul ouvert à la fois).
  function basculerSelecteurReaction(messageId) {
    etat.reactionOuverte = etat.reactionOuverte === messageId ? null : messageId;
    rendreMessages(false);
  }

  // Ajoute ou retire la réaction de l'utilisateur courant à un message.
  function basculerReaction(messageId, emoji) {
    const message = trouverMessage(messageId);
    if (!message) return;

    const nom = nomCourant();
    if (nom === '') {
      // Sans nom, impossible d'identifier qui a réagi : on guide l'utilisateur.
      if (el.indicateur) el.indicateur.textContent = 'Renseignez votre nom en haut de la page pour réagir.';
      if (el.nom) el.nom.focus();
      return;
    }

    if (!message.reactions || typeof message.reactions !== 'object') message.reactions = {};

    let noms = message.reactions[emoji];
    if (!Array.isArray(noms)) noms = [];

    const index = noms.indexOf(nom);
    if (index === -1) noms.push(nom); else noms.splice(index, 1); // jamais deux fois le même auteur

    if (noms.length === 0) delete message.reactions[emoji];
    else message.reactions[emoji] = noms;

    etat.reactionOuverte = null; // on referme le sélecteur après avoir réagi
    sauverMessages();
    rendreMessages(false);
    diffuser({ type: 'message', salonId: etat.salonActif });
  }

  // Commence une réponse citée à un message.
  function demarrerReponse(messageId) {
    const message = trouverMessage(messageId);
    if (!message) return;

    etat.edition = null;
    etat.reactionOuverte = null;
    etat.repondreA = { id: message.id, nom: message.auteur, extrait: extraire(message.texte) };

    appliquerApercuReponse();
    rendreMessages(false);
    if (el.zone) el.zone.focus();
  }

  function annulerReponse() {
    etat.repondreA = null;
    appliquerApercuReponse();
    rendreMessages(false);
    if (el.zone) el.zone.focus();
  }

  // Épingle / désépingle un message du salon actif (état partagé entre les onglets).
  function basculerEpingle(messageId) {
    const message = trouverMessage(messageId);
    if (!message) return;
    const salon = salonParId(message.salonId);
    if (!salon) return;

    if (salon.epingle === message.id) delete salon.epingle;
    else salon.epingle = message.id;

    etat.edition = null;
    etat.reactionOuverte = null;

    sauverSalons();
    rendreMessages(false);
    diffuser({ type: 'message', salonId: etat.salonActif });
  }

  // Applique le terme de recherche : normalisé pour comparer, jamais persisté.
  function appliquerRecherche(valeur) {
    const terme = termeNormalise(valeur);
    if (terme === etat.recherche) return;
    etat.recherche = terme;
    rendreMessages(true);
  }

  function effacerRecherche(rendre) {
    if (etat.recherche === '') return;
    etat.recherche = '';
    if (el.recherche) el.recherche.value = '';
    if (rendre !== false) rendreMessages(true);
  }

  /* ------------------------------ Mentions ------------------------------ */

  function fermerMentions() {
    if (!etat.mentions.ouvert) return;
    etat.mentions.ouvert = false;
    etat.mentions.items = [];
    etat.mentions.index = 0;
    if (el.mentions) {
      el.mentions.textContent = '';
      el.mentions.hidden = true;
    }
  }

  function rendreMentions() {
    if (!el.mentions) return;
    el.mentions.textContent = '';

    if (!etat.mentions.ouvert || etat.mentions.items.length === 0) {
      el.mentions.hidden = true;
      return;
    }

    etat.mentions.items.forEach(function (item, index) {
      const li = document.createElement('li');
      const actif = index === etat.mentions.index;
      li.className = 'mentions__item' + (actif ? ' mentions__item--actif' : '');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', actif ? 'true' : 'false');
      li.textContent = item.nom;
      // mousedown + preventDefault : on garde le focus dans la zone de saisie.
      li.addEventListener('mousedown', function (evenement) {
        if (evenement && evenement.preventDefault) evenement.preventDefault();
        choisirMention(index);
      });
      el.mentions.appendChild(li);
    });

    el.mentions.hidden = false;
  }

  // Analyse le texte avant le curseur et propose les participants correspondants.
  function analyserMentions() {
    if (!el.zone) return;

    const valeur = el.zone.value;
    let curseur = el.zone.selectionStart;
    if (typeof curseur !== 'number' || curseur < 0) curseur = valeur.length;

    const avant = valeur.slice(0, curseur);
    const arobase = avant.lastIndexOf('@');

    let requete = null;
    if (arobase !== -1) {
      const avantArobase = arobase > 0 ? avant.charAt(arobase - 1) : '';
      const suite = avant.slice(arobase + 1);
      // Pas de mention dans un mot (e-mail) ni au-delà d'un espace.
      if (!estCaractereMot(avantArobase) && !/\s/.test(suite)) requete = suite;
    }

    if (requete === null) { fermerMentions(); return; }

    const norm = termeNormalise(requete);
    const items = nomsParticipants().filter(function (nom) {
      return norm === '' || nom.norm.indexOf(norm) === 0;
    });

    if (items.length === 0) { fermerMentions(); return; }

    etat.mentions.ouvert = true;
    etat.mentions.debut = arobase;
    etat.mentions.fin = curseur;
    etat.mentions.items = items;
    if (etat.mentions.index >= items.length) etat.mentions.index = 0;
    rendreMentions();
  }

  function choisirMention(index) {
    if (!el.zone || !etat.mentions.ouvert) return;
    const item = etat.mentions.items[index];
    if (!item) return;

    const valeur = el.zone.value;
    const avant = valeur.slice(0, etat.mentions.debut);
    const apres = valeur.slice(etat.mentions.fin);
    const insertion = '@' + item.nom + ' ';
    el.zone.value = avant + insertion + apres;

    const position = avant.length + insertion.length;
    try { el.zone.setSelectionRange(position, position); } catch (e) { /* ignoré */ }

    fermerMentions();
    ajusterHauteurChamp(el.zone);
    signalerSaisie();
    el.zone.focus();
  }

  // Gère le clavier quand la liste de suggestions est ouverte. Renvoie true si consommé.
  function gererClavierMentions(evenement) {
    if (!etat.mentions.ouvert) return false;
    const nombre = etat.mentions.items.length;
    if (nombre === 0) return false;

    if (evenement.key === 'ArrowDown') {
      evenement.preventDefault();
      etat.mentions.index = (etat.mentions.index + 1) % nombre;
      rendreMentions();
      return true;
    }
    if (evenement.key === 'ArrowUp') {
      evenement.preventDefault();
      etat.mentions.index = (etat.mentions.index - 1 + nombre) % nombre;
      rendreMentions();
      return true;
    }
    if (evenement.key === 'Enter' || evenement.key === 'Tab') {
      evenement.preventDefault();
      choisirMention(etat.mentions.index);
      return true;
    }
    if (evenement.key === 'Escape') {
      evenement.preventDefault();
      fermerMentions();
      return true;
    }
    return false;
  }

  // Rejoint le message cité : défilement doux et surbrillance brève.
  function ciblerMessage(messageId) {
    if (!el.messages) return;

    const message = trouverMessage(messageId);
    // Le message d'origine peut vivre dans un autre salon : on s'y rend d'abord.
    if (message && message.salonId !== etat.salonActif) changerSalon(message.salonId);

    // Si une recherche masque la cible, on rétablit d'abord le fil complet.
    if (etat.recherche !== '' && (!message || !correspondRecherche(message.texte, etat.recherche))) {
      effacerRecherche(false);
      rendreMessages(false);
    }

    let cible = null;
    const tous = el.messages.querySelectorAll('.message');
    for (let i = 0; i < tous.length; i += 1) {
      if (tous[i].dataset.id === messageId) { cible = tous[i]; break; }
    }
    if (!cible) return;

    if (etat.minuteurCible) clearTimeout(etat.minuteurCible);
    const anciens = el.messages.querySelectorAll('.message--cible');
    for (let j = 0; j < anciens.length; j += 1) {
      anciens[j].classList.remove('message--cible');
      anciens[j].style.outline = '';
      anciens[j].style.outlineOffset = '';
    }

    cible.classList.add('message--cible');
    cible.style.outline = '2px solid var(--accent)';
    cible.style.outlineOffset = '2px';

    if (typeof cible.scrollIntoView === 'function') {
      try {
        cible.scrollIntoView({ behavior: mouvementReduit() ? 'auto' : 'smooth', block: 'center' });
      } catch (e) {
        try { cible.scrollIntoView(); } catch (e2) { /* ignoré */ }
      }
    }

    etat.minuteurCible = setTimeout(function () {
      etat.minuteurCible = null;
      cible.classList.remove('message--cible');
      cible.style.outline = '';
      cible.style.outlineOffset = '';
    }, 1200);
  }

  // Édition en place d'un de ses propres messages.
  function demarrerEdition(messageId) {
    const message = trouverMessage(messageId);
    if (!message) return;
    if (!estMoi(message.auteur)) return; // on ne modifie que ses propres messages

    etat.repondreA = null;
    etat.reactionOuverte = null;
    etat.edition = { id: message.id, texte: message.texte, focus: true };

    appliquerApercuReponse();
    rendreMessages(false);

    // Place le curseur en fin de texte dans la zone d'édition fraîchement rendue.
    const zoneEdition = el.messages ? el.messages.querySelector('.edition__zone') : null;
    if (zoneEdition) {
      zoneEdition.focus();
      const fin = zoneEdition.value.length;
      try { zoneEdition.setSelectionRange(fin, fin); } catch (e) { /* ignoré */ }
      ajusterHauteurChamp(zoneEdition);
    }
  }

  function annulerEdition() {
    etat.edition = null;
    rendreMessages(false);
  }

  function enregistrerEdition(messageId) {
    const message = trouverMessage(messageId);
    if (!message) { etat.edition = null; rendreMessages(false); return; }
    if (!estMoi(message.auteur)) return; // sécurité : uniquement ses messages

    const brut = (etat.edition && etat.edition.id === messageId && etat.edition.texte != null)
      ? etat.edition.texte
      : message.texte;
    const texte = String(brut).trim();
    if (texte === '') return; // rien à enregistrer : on laisse l'édition ouverte

    message.texte = texte;
    message.modifie = true;
    etat.edition = null;

    sauverMessages();
    rendreMessages(true);
    diffuser({ type: 'message', salonId: etat.salonActif });
  }

  // Redimensionne une zone de texte à son contenu (entre sa hauteur `rows` et ~10 lignes).
  function ajusterHauteurChamp(zone) {
    if (!zone) return;

    const style = window.getComputedStyle ? window.getComputedStyle(zone) : null;
    const ligne = style ? (parseFloat(style.lineHeight) || 22) : 22;
    const talon = style
      ? (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0) +
        (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0)
      : 0;

    const lignes = parseInt(zone.rows, 10) > 0 ? parseInt(zone.rows, 10) : 1;
    const mini = lignes * ligne + talon;
    const maxi = Math.max(mini, 10 * ligne + talon);

    zone.style.height = 'auto';
    zone.style.height = Math.min(Math.max(zone.scrollHeight, mini), maxi) + 'px';
  }

  /* ------------------------------ Actions ------------------------------ */

  function changerSalon(id) {
    if (!etat.salons.some(function (s) { return s.id === id; })) return;
    if (id === etat.salonActif) return;

    etat.salonActif = id;
    stockage.ecrire(CLE_SALON_ACTIF, id);
    etat.edition = null;
    etat.repondreA = null;
    etat.reactionOuverte = null;
    // La recherche et les mentions sont locales à la conversation affichée.
    etat.recherche = '';
    if (el.recherche) el.recherche.value = '';
    fermerMentions();
    appliquerApercuReponse();
    effacerIndicateur();

    el.titreSalon.textContent = nomSalon(id);
    rendreSalons();
    rendreMessages(true);
  }

  function envoyer() {
    const texte = el.zone ? el.zone.value.trim() : '';
    if (!texte) return;

    const auteur = nomCourant();
    if (auteur === '') {
      // Pas de nom : on refuse l'envoi et on guide l'utilisateur.
      if (el.indicateur) el.indicateur.textContent = 'Renseignez votre nom en haut de la page pour envoyer.';
      if (el.nom) el.nom.focus();
      return;
    }

    // Réponse citée : on fige une copie de la citation, puis on l'oublie.
    const repondA = etat.repondreA
      ? { id: etat.repondreA.id, nom: etat.repondreA.nom, extrait: etat.repondreA.extrait }
      : null;

    etat.messages.push({
      id: uid(),
      salonId: etat.salonActif,
      auteur: auteur,
      texte: texte,
      date: new Date().toISOString(),
      repondA: repondA
    });

    etat.repondreA = null;
    appliquerApercuReponse();
    sauverMessages();
    el.zone.value = '';
    fermerMentions();
    ajusterHauteur();
    effacerIndicateur();
    etat.dernierSignalSaisie = 0;

    rendreSalons();
    rendreMessages(true);
    diffuser({ type: 'message', salonId: etat.salonActif });
  }

  function supprimerMessage(id) {
    const index = etat.messages.findIndex(function (m) { return m && m.id === id; });
    if (index === -1) return;
    if (!estMoi(etat.messages[index].auteur)) return; // seulement ses propres messages

    const message = etat.messages[index];
    etat.messages.splice(index, 1);

    // Si le message supprimé était épinglé, le bandeau disparaît partout.
    const salon = salonParId(message.salonId);
    if (salon && salon.epingle === id) {
      delete salon.epingle;
      sauverSalons();
    }

    sauverMessages();
    rendreSalons();
    rendreMessages(false);
    diffuser({ type: 'message', salonId: etat.salonActif });
  }

  function reinitialiserVider() {
    etat.attenteConfirmation = false;
    if (etat.minuteurVider) {
      clearTimeout(etat.minuteurVider);
      etat.minuteurVider = null;
    }
    if (el.vider) {
      el.vider.textContent = LIBELLE_VIDER;
      el.vider.classList.remove('btn--confirme');
    }
  }

  function viderSalon() {
    if (!etat.attenteConfirmation) {
      // Premier clic : on demande confirmation, sans `confirm()`.
      etat.attenteConfirmation = true;
      el.vider.textContent = LIBELLE_CONFIRMER;
      el.vider.classList.add('btn--confirme');
      etat.minuteurVider = setTimeout(reinitialiserVider, 4000);
      return;
    }

    // Second clic : suppression effective.
    reinitialiserVider();
    etat.messages = etat.messages.filter(function (m) { return m.salonId !== etat.salonActif; });

    // Le salon vidé ne peut plus avoir de message épinglé.
    const salon = salonParId(etat.salonActif);
    if (salon && typeof salon.epingle === 'string') {
      delete salon.epingle;
      sauverSalons();
    }

    sauverMessages();
    rendreSalons();
    rendreMessages(false);
    diffuser({ type: 'message', salonId: etat.salonActif });
    if (el.zone) el.zone.focus();
  }

  function creerSalon() {
    const nom = el.nomSalon.value.trim();

    if (nom === '') {
      el.erreurSalon.textContent = 'Le nom du salon ne peut pas être vide.';
      el.nomSalon.focus();
      return;
    }

    const doublon = etat.salons.some(function (s) {
      return s.nom.toLowerCase() === nom.toLowerCase();
    });
    if (doublon) {
      el.erreurSalon.textContent = 'Un salon porte déjà ce nom.';
      el.nomSalon.focus();
      return;
    }

    const nouveau = { id: uid(), nom: nom };
    etat.salons.push(nouveau);
    sauverSalons();

    el.nomSalon.value = '';
    el.erreurSalon.textContent = '';

    etat.salonActif = nouveau.id;
    stockage.ecrire(CLE_SALON_ACTIF, nouveau.id);
    el.titreSalon.textContent = nouveau.nom;
    rendreSalons();
    rendreMessages(true);

    // Les autres onglets relisent la liste des salons grâce à ce signal.
    diffuser({ type: 'message', salonId: nouveau.id });
  }

  /* ------------------------------ Thème ------------------------------ */

  const mediaSombre = (window.matchMedia)
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

  function themeInitial() {
    const enregistre = stockage.lire(CLE_THEME, null);
    if (enregistre === 'sombre' || enregistre === 'clair') return enregistre;
    return (mediaSombre && mediaSombre.matches) ? 'sombre' : 'clair';
  }

  function appliquerTheme(mode, memoriser) {
    const sombre = mode === 'sombre';
    document.body.classList.toggle('sombre', sombre);

    if (el.theme) {
      el.theme.setAttribute('aria-label', sombre ? 'Activer le thème clair' : 'Activer le thème sombre');
      el.theme.setAttribute('aria-pressed', sombre ? 'true' : 'false');
    }
    if (memoriser) stockage.ecrire(CLE_THEME, mode);
  }

  function basculerTheme() {
    const mode = document.body.classList.contains('sombre') ? 'clair' : 'sombre';
    appliquerTheme(mode, true);
  }

  /* ------------------------------ Zone de saisie ------------------------------ */

  function ajusterHauteur() {
    ajusterHauteurChamp(el.zone);
  }

  /* ------------------------------ Écouteurs ------------------------------ */

  function brancherEvenements() {
    // Identité : mémorisée à la frappe ; on redessine au changement de champ.
    el.nom.addEventListener('input', function () {
      stockage.ecrire(CLE_NOM, el.nom.value.trim());
      effacerIndicateur();
    });
    el.nom.addEventListener('change', function () {
      rendreMessages(false);
    });

    // Thème
    el.theme.addEventListener('click', basculerTheme);

    // Salons
    el.formSalon.addEventListener('submit', function (evenement) {
      evenement.preventDefault();
      creerSalon();
    });
    el.nomSalon.addEventListener('input', function () {
      if (el.erreurSalon.textContent !== '') el.erreurSalon.textContent = '';
    });

    // Vider le salon (confirmation en deux temps)
    el.vider.addEventListener('click', viderSalon);

    // Recherche dans le fil : filtre l'affichage sans modifier les données.
    if (el.formRecherche) {
      el.formRecherche.addEventListener('submit', function (evenement) { evenement.preventDefault(); });
    }
    if (el.recherche) {
      el.recherche.addEventListener('input', function () { appliquerRecherche(el.recherche.value); });
      el.recherche.addEventListener('keydown', function (evenement) {
        if (evenement.key === 'Escape') {
          evenement.preventDefault();
          effacerRecherche(true);
        }
      });
    }
    if (el.rechercheEffacer) el.rechercheEffacer.addEventListener('click', function () { effacerRecherche(true); });

    // Bandeau du message épinglé : rejoindre ou retirer.
    if (el.epingleAller) el.epingleAller.addEventListener('click', function () {
      const message = messageEpingle();
      if (message) ciblerMessage(message.id);
    });
    if (el.epingleRetirer) el.epingleRetirer.addEventListener('click', function () {
      const message = messageEpingle();
      if (message) basculerEpingle(message.id);
    });

    // Annulation de la réponse en cours (bloc d'aperçu au-dessus du formulaire).
    if (el.reponseAnnuler) el.reponseAnnuler.addEventListener('click', annulerReponse);

    // Envoi : bouton (submit) et touche Entrée (Maj+Entrée = nouvelle ligne)
    el.formMessage.addEventListener('submit', function (evenement) {
      evenement.preventDefault();
      envoyer();
    });
    el.zone.addEventListener('keydown', function (evenement) {
      // La liste de mentions capte les flèches, Entrée, Tab et Échap.
      if (gererClavierMentions(evenement)) return;
      if (evenement.key === 'Enter' && !evenement.shiftKey) {
        evenement.preventDefault();
        envoyer();
      }
    });

    // Indicateur de saisie diffusé à la frappe + suggestions de mention
    el.zone.addEventListener('input', function () {
      ajusterHauteurChamp(el.zone);
      signalerSaisie();
      analyserMentions();
    });
    el.zone.addEventListener('blur', fermerMentions);

    // Un clic en dehors du sélecteur de réactions le referme.
    document.addEventListener('click', function (evenement) {
      if (etat.reactionOuverte === null) return;

      const cible = evenement.target;
      if (cible && cible.closest) {
        if (cible.closest('.reaction-selecteur')) return;      // clic dans le sélecteur
        if (cible.closest('.message__action--reagir')) return; // clic sur le bouton qui l'ouvre
      }

      etat.reactionOuverte = null;
      rendreMessages(false);
    });

    // Suit les changements de préférence système si l'utilisateur n'a rien choisi.
    if (mediaSombre) {
      const surChangement = function (evenement) {
        if (stockage.lire(CLE_THEME, null) === null) {
          appliquerTheme(evenement.matches ? 'sombre' : 'clair', false);
        }
      };
      if (typeof mediaSombre.addEventListener === 'function') {
        mediaSombre.addEventListener('change', surChangement);
      } else if (typeof mediaSombre.addListener === 'function') {
        mediaSombre.addListener(surChangement);
      }
    }
  }

  /* ------------------------------ Données d'exemple ------------------------------ */

  // Date d'hier à `h`:`m` (heure locale) : toujours dans le passé.
  function hierA(h, m) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  }

  // Date d'il y a quelques minutes, sans jamais franchir minuit vers hier.
  function ilYA(minutes) {
    const d = new Date();
    const minutesDuJour = d.getHours() * 60 + d.getMinutes();
    d.setMinutes(d.getMinutes() - Math.min(minutes, Math.max(0, minutesDuJour - 1)));
    d.setSeconds(0, 0);
    return d.toISOString();
  }

  function messageExemple(salonId, date, auteur, texte) {
    return { id: uid(), salonId: salonId, auteur: auteur, texte: texte, date: date };
  }

  // Quelques messages répartis sur les salons et sur deux jours différents
  // (pour illustrer les séparateurs « Hier » / « Aujourd'hui »).
  function messagesExemple() {
    return [
      messageExemple('general', hierA(9, 12), 'Amina', 'Bonjour tout le monde ! Le dépôt est prêt, on peut commencer.'),
      messageExemple('general', hierA(9, 31), 'Yassine', 'Parfait. Je m’occupe de la mise en page ce matin.'),
      messageExemple('projet', hierA(16, 5), 'Sofia', 'J’ai poussé la structure HTML, il reste à habiller.'),
      messageExemple('aide', hierA(18, 44), 'Karim', 'Quelqu’un sait comment on ouvre un second onglet pour tester ?'),
      messageExemple('general', ilYA(14), 'Sofia', 'Petit rappel : le point de suivi est à 14 h.'),
      messageExemple('projet', ilYA(9), 'Yassine', 'La feuille de style est terminée, je passe aux tests.'),
      messageExemple('aide', ilYA(4), 'Amina', 'Oui : ouvrez cette page dans un second onglet et écrivez, tout apparaît en direct.')
    ];
  }

  /* ---------------------------------------------------------
     Mode full-stack (serveur Node + SQLite)
     Quand un serveur Node répond à la sonde (X-Serveur), les deux
     collections partagées — salons et messages — vivent dans une
     vraie base SQLite :
       • lecture  : préchargement dans un cache mémoire, relu
                    synchrone­ment par la couche `stockage` ;
       • écriture : écriture-transit (write-through) — à chaque
                    sauvegarde, le différentiel avec le dernier état
                    connu du serveur est appliqué en REST (POST /
                    PUT / DELETE par identifiant) ;
       • temps réel : un EventSource sur /api/flux reçoit les
                    événements « message » du serveur ; à chaque
                    événement on recharge le cache puis on réutilise
                    la fonction synchroniser() existante.
     Le mécanisme BroadcastChannel / storage reste intact : les
     onglets d'un même navigateur se synchronisent comme avant,
     en plus du serveur. Sans serveur (file://), rien ne change.
     --------------------------------------------------------- */

  let moteurDistant = false;
  const cache = { salons: null, messages: null };   // dernière réponse du serveur
  let miroirSalons = {};    // id → dernier état connu du serveur (pour le diff)
  let miroirMessages = {};

  function sansErreur() { /* feu-oublie : l'UI reste correcte même si la requête échoue */ }

  function brancherModeServeur() {
    moteurDistant = true;
    return rechargerDonnees().then(function () {
      indexMiroirs();
      brancherEcritureTransit();
      ouvrirFluxServeur();
      afficherMoteur();
    });
  }

  // Met le cache à jour avec l'état actuel de la base (source de vérité).
  function rechargerDonnees() {
    return Promise.all([
      window.LumeAPI.appeler('GET', 'api/salons'),
      window.LumeAPI.appeler('GET', 'api/messages')
    ]).then(function (reponses) {
      const rSalons = reponses[0];
      const rMessages = reponses[1];
      if (rSalons.statut === 200 && rSalons.corps && Array.isArray(rSalons.corps.donnees)) {
        cache.salons = rSalons.corps.donnees;
      }
      if (rMessages.statut === 200 && rMessages.corps && Array.isArray(rMessages.corps.donnees)) {
        cache.messages = rMessages.corps.donnees;
      }
    });
    // En cas d'échec, le cache précédent reste servable.
  }

  // Copie les caches dans les miroirs (comparaison par JSON.stringify).
  function indexMiroirs() {
    miroirSalons = {};
    (cache.salons || []).forEach(function (salon) {
      if (salon && salon.id) miroirSalons[salon.id] = JSON.parse(JSON.stringify(salon));
    });
    miroirMessages = {};
    (cache.messages || []).forEach(function (message) {
      if (message && message.id) miroirMessages[message.id] = JSON.parse(JSON.stringify(message));
    });
  }

  /* Écriture-transit : le différentiel entre la liste sauvegardée et le
     dernier état du serveur est traduit en verbes REST par identifiant. */
  function brancherEcritureTransit() {
    const ecrireLocal = stockage.ecrire;
    stockage.ecrire = function (cle, valeur) {
      ecrireLocal(cle, valeur); // localStorage : le mode file:// reste nourri
      if (cle === CLE_SALONS) pousserSalons(valeur);
      else if (cle === CLE_MESSAGES) pousserMessages(valeur);
    };

    // Les lectures des deux collections partagées viennent du cache serveur.
    const lireLocal = stockage.lire;
    stockage.lire = function (cle, defaut) {
      if (cle === CLE_SALONS && cache.salons) return cache.salons;
      if (cle === CLE_MESSAGES && cache.messages) return cache.messages;
      return lireLocal(cle, defaut);
    };
  }

  function pousserSalons(liste) {
    if (!moteurDistant || !Array.isArray(liste)) return;
    const presents = {};
    liste.forEach(function (salon) {
      if (!salon || !salon.id) return;
      presents[salon.id] = true;
      const connu = miroirSalons[salon.id];
      if (!connu) {
        window.LumeAPI.appeler('POST', 'api/salons', salon).catch(sansErreur);
      } else if (JSON.stringify(connu) !== JSON.stringify(salon)) {
        window.LumeAPI.appeler('PUT', 'api/salons/' + encodeURIComponent(salon.id), salon).catch(sansErreur);
      }
      miroirSalons[salon.id] = JSON.parse(JSON.stringify(salon));
    });
    Object.keys(miroirSalons).forEach(function (id) {
      if (presents[id]) return;
      window.LumeAPI.appeler('DELETE', 'api/salons/' + encodeURIComponent(id)).catch(sansErreur);
      delete miroirSalons[id];
    });
  }

  function pousserMessages(liste) {
    if (!moteurDistant || !Array.isArray(liste)) return;
    const presents = {};
    liste.forEach(function (message) {
      if (!message || !message.id) return;
      presents[message.id] = true;
      const connu = miroirMessages[message.id];
      if (!connu) {
        window.LumeAPI.appeler('POST', 'api/messages', message).catch(sansErreur);
      } else if (JSON.stringify(connu) !== JSON.stringify(message)) {
        window.LumeAPI.appeler('PUT', 'api/messages/' + encodeURIComponent(message.id), message).catch(sansErreur);
      }
      miroirMessages[message.id] = JSON.parse(JSON.stringify(message));
    });
    Object.keys(miroirMessages).forEach(function (id) {
      if (presents[id]) return;
      window.LumeAPI.appeler('DELETE', 'api/messages/' + encodeURIComponent(id)).catch(sansErreur);
      delete miroirMessages[id];
    });
  }

  /* Temps réel serveur : à chaque événement « message » du serveur, on
     recharge le cache puis on réutilise la synchronisation existante. */
  function ouvrirFluxServeur() {
    try {
      if (typeof EventSource !== 'function') return;
      const flux = new EventSource('api/flux');

      flux.addEventListener('message', function (evenement) {
        let donnees = null;
        try { donnees = JSON.parse(evenement.data); } catch (e) { donnees = { type: 'message' }; }
        if (!donnees || typeof donnees !== 'object') return;

        if (donnees.type === 'message') {
          // Les données ont changé ailleurs : on recharge puis on rafraîchit.
          rechargerDonnees().then(planifierSynchro).catch(sansErreur);
          return;
        }
        traiterSignal(donnees); // « saisie » et compagnie passent par le traitement commun
      });
    } catch (e) { /* navigateur sans EventSource : le mode local suffit */ }
  }

  // Indicateur d'interface : mention du moteur réellement actif.
  function afficherMoteur() {
    const aide = document.querySelector('.aide');
    if (!aide) return;
    if (moteurDistant) {
      aide.textContent = 'La synchronisation passe par le serveur Node + SQLite : ' +
        'ouvrez cette page dans un second onglet ou un autre navigateur, ' +
        'tout se met à jour en direct.';
    }
  }

  /* ------------------------------ Initialisation ------------------------------ */

  async function initialiser() {
    // Détection du moteur : si un serveur Node répond, on bascule en mode
    // full-stock (SQLite + SSE) ; sinon on reste en localStorage.
    try { await window.LumeAPI.detecter(); } catch (e) { /* mode local */ }
    if (window.LumeAPI.actif) {
      try { await brancherModeServeur(); } catch (e) { /* on reste en mode local */ }
    }

    // Année du pied de page
    if (el.annee) el.annee.textContent = String(new Date().getFullYear());

    // Salons : trois salons au premier lancement
    let salons = salonsValides(stockage.lire(CLE_SALONS, null));
    if (!salons) {
      salons = [
        { id: 'general', nom: 'général' },
        { id: 'projet', nom: 'projet' },
        { id: 'aide', nom: 'aide' }
      ];
      stockage.ecrire(CLE_SALONS, salons);
    }
    etat.salons = salons;

    // Messages : jeu d'exemple au premier lancement
    let messages = messagesValides(stockage.lire(CLE_MESSAGES, null));
    if (!messages) {
      messages = messagesExemple();
      stockage.ecrire(CLE_MESSAGES, messages);
    }
    etat.messages = messages;

    // Identité
    const nomMemorise = stockage.lire(CLE_NOM, NOM_PAR_DEFAUT);
    el.nom.value = (typeof nomMemorise === 'string' && nomMemorise.trim() !== '') ? nomMemorise : NOM_PAR_DEFAUT;

    // Salon actif
    const salonMemorise = stockage.lire(CLE_SALON_ACTIF, null);
    const salonValide = etat.salons.some(function (s) { return s.id === salonMemorise; });
    etat.salonActif = salonValide ? salonMemorise : etat.salons[0].id;

    // Thème
    appliquerTheme(themeInitial(), false);

    // Temps réel
    ouvrirCanal();
    ecouterOnglets();

    // Interactions
    brancherEvenements();
    ajusterHauteur();

    // Premier rendu
    el.titreSalon.textContent = nomSalon(etat.salonActif);
    rendreSalons();
    rendreMessages(true);
  }

  // Démarrage : le script est chargé en fin de <body>.
  try {
    initialiser().catch(function () {
      // Aucun plantage visible : on échoue silencieusement si le DOM est incomplet.
    });
  } catch (e) {
    // Idem pour une erreur de synchronisation avant le premier await.
  }
})();
