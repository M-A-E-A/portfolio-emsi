/* =====================================================================
   Application — portefeuille, minage, explorateur, mini-marché.
   La chaîne de blocs est persistée dans localStorage — ou, en mode
   full-stack, dans une base SQLite via le serveur fourni (server.js).
   La clé privée du portefeuille ne quitte jamais le navigateur.
   ===================================================================== */
(function (global) {
  'use strict';

  const Chain = global.Chain;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const CLE_THEME = 'chain-theme';
  const CLE_PORTEFEUILLE = 'chain-portefeuille';
  const CLE_CHAINE = 'chain-blocage';

  const etat = {
    chaine: new Chain.Chaine(2),
    portefeuille: null,
    clePortefeuille: null,
    portefeuilleEnCours: false,
    enMinage: false,
    transactionsEnAttente: [],
    produits: [
      { id: 1, nom: 'Clavier mécanique', prix: 120, image: '⌨' },
      { id: 2, nom: 'Écran 27 pouces', prix: 260, image: '🖥' },
      { id: 3, nom: 'Casque studio', prix: 85, image: '🎧' },
      { id: 4, nom: 'Support de moniteur', prix: 45, image: '🖲' },
      { id: 5, nom: 'Chaise de bureau', prix: 310, image: '🪑' },
    ],
  };

  /* ---------------------------------------------------------------- */
  /* Persistance                                                       */
  /* ---------------------------------------------------------------- */

  /* Mode full-stack : quand un serveur Node répond à la sonde, la chaîne
     de blocs (publique par nature) est persistée dans une base SQLite,
     en écriture-transit (*write-through*). En mode local, tout reste dans
     localStorage. Le portefeuille — clé privée ECDSA — n'est JAMAIS
     envoyé au serveur : il reste strictement local. */
  let serveurActif = false;

  /* Applique une chaîne { blocs, difficulte, compteur } à l'état.
     Même forme exacte que l'objet écrit dans localStorage. */
  function appliquerChaine(donnees) {
    if (!donnees || !Array.isArray(donnees.blocs)) return false;
    etat.chaine.blocs = donnees.blocs;
    etat.chaine.difficulte = donnees.difficulte || 2;
    etat.chaine.compteurEncheres = donnees.compteur || 0;
    return true;
  }

  function etatCourant() {
    return {
      blocs: etat.chaine.blocs,
      difficulte: etat.chaine.difficulte,
      compteur: etat.chaine.compteurEncheres
    };
  }

  function sauvegarder() {
    const donnees = etatCourant();
    try { localStorage.setItem(CLE_CHAINE, JSON.stringify(donnees)); } catch (e) { /* file:// */ }
    /* Écriture-transit : le PUT est en feu-oublie, l'interface reste
       correcte même s'il échoue. */
    if (serveurActif && window.LumeAPI) {
      window.LumeAPI.appeler('PUT', 'api/chaine', donnees)
        .catch(() => { /* la UI reste correcte même si le PUT échoue */ });
    }
  }

  function charger() {
    /* En mode serveur, la chaîne provient déjà du préchargement :
       localStorage ne doit pas l'écraser (données potentiellement
       obsolètes). */
    if (serveurActif) return;
    try {
      const brut = localStorage.getItem(CLE_CHAINE);
      if (!brut) return;
      appliquerChaine(JSON.parse(brut));
    } catch (e) { /* file:// */ }
  }

  /* Préchargement : la base SQLite est la source de vérité. Si le
     serveur ne répond pas (200) — hébergement statique, serveur de
     test… — on reste entièrement en localStorage. */
  async function brancherModeServeur() {
    const r = await window.LumeAPI.appeler('GET', 'api/chaine');
    if (r.statut !== 200 || !r.corps) { serveurActif = false; return; }
    appliquerChaine(r.corps);
  }

  /* Le portefeuille est et reste LOCAL : la clé privée (JWK) ne quitte
     jamais ce navigateur, il n'existe aucune route serveur pour elle. */
  async function chargerPortefeuille() {
    try {
      const brut = localStorage.getItem(CLE_PORTEFEUILLE);
      if (!brut) return;
      const cle = JSON.parse(brut);
      etat.portefeuilleEnCours = true;
      etat.portefeuille = await Chain.Portefeuille.restaurer(cle);
      etat.clePortefeuille = cle;
    } catch (e) { /* file:// */ }
    etat.portefeuilleEnCours = false;
  }

  /* ---------------------------------------------------------------- */
  /* Affichage                                                        */
  /* ---------------------------------------------------------------- */

  function journaliser(texte, type) {
    const zone = $('#journal');
    const ligne = document.createElement('p');
    ligne.className = 'journal-ligne' + (type ? ' ' + type : '');
    ligne.textContent = texte;
    zone.appendChild(ligne);
    zone.scrollTop = zone.scrollHeight;
  }

  /**
   * Solde affiché : la chaîne plus les transactions signées qui attendent
   * encore d'être minées. Sans cela, l'utilisateur voit un solde « faux »
   * juste après avoir payé.
   */
  function soldeAffiche() {
    if (!etat.portefeuille) return 0;
    let total = etat.chaine.solde(etat.portefeuille.adresse);
    for (const t of etat.transactionsEnAttente) {
      if (t.expediteur === etat.portefeuille.adresse) total -= t.montant;
      if (t.destinataire === etat.portefeuille.adresse) total += t.montant;
    }
    return total;
  }

  function rafraichirPortefeuille() {
    const zone = $('#portefeuille');
    if (!etat.portefeuille) {
      /* Restauration en cours (WebCrypto est asynchrone) : on affiche un
         message neutre plutôt que « aucun portefeuille », qui serait faux. */
      zone.innerHTML = etat.portefeuilleEnCours
        ? '<p class="vide">Restauration du portefeuille…</p>'
        : '<p class="vide">Aucun portefeuille. Créez-en un pour miner et transférer.</p>';
      return;
    }
    const solde = soldeAffiche();
    const enAttente = etat.transactionsEnAttente.length;
    zone.innerHTML =
      '<div class="portefeuille-adresse"><span class="pf-lbl">Adresse</span><code>' + etat.portefeuille.adresse + '</code></div>' +
      '<div class="portefeuille-solde"><span class="pf-lbl">Solde' + (enAttente ? ' (dont ' + enAttente + ' en attente)' : '') + '</span>' +
      '<strong>' + solde + ' <span class="pf-unite">⛁ Lume</span></strong></div>';
  }

  function rafraichirExplorateur() {
    const zone = $('#explorateur');
    const vide = $('#explorateur-vide');
    if (!etat.chaine.blocs.length) {
      zone.innerHTML = '';
      vide.hidden = false;
      return;
    }
    vide.hidden = true;
    zone.innerHTML = etat.chaine.blocs
      .slice()
      .reverse()
      .map((bloc) => {
        const duree = bloc.dureeMs ? ' · ' + bloc.dureeMs + ' ms' : '';
        return '<li class="bloc-item">' +
          '<span class="bloc-index">#' + bloc.index + '</span>' +
          '<span class="bloc-hash" title="' + bloc.hash + '">' + bloc.hash.slice(0, 18) + '…</span>' +
          '<span class="bloc-meta">' + bloc.transactions.length + ' transaction(s) · nonce ' + bloc.nonce + duree + '</span>' +
          '</li>';
      })
      .join('');
  }

  function rafraichirMarche() {
    const zone = $('#marche');
    const solde = soldeAffiche();
    zone.innerHTML = etat.produits
      .map((p) => {
        const peut = solde >= p.prix && etat.portefeuille;
        return '<li class="produit">' +
          '<span class="produit-ico" aria-hidden="true">' + p.image + '</span>' +
          '<span class="produit-nom">' + p.nom + '</span>' +
          '<span class="produit-prix">' + p.prix + ' ⛁</span>' +
          '<button type="button" class="bouton-mini" data-produit="' + p.id + '"' + (peut ? '' : ' disabled') + '>Acheter</button>' +
          '</li>';
      })
      .join('');
  }

  function rafraichirTout() {
    rafraichirPortefeuille();
    rafraichirExplorateur();
    rafraichirMarche();
    $('#nb-blocs').textContent = String(etat.chaine.blocs.length);
    $('#nb-transactions').textContent = String(etat.chaine.transactions().length);
  }

  /* ---------------------------------------------------------------- */
  /* Actions                                                          */
  /* ---------------------------------------------------------------- */

  async function creerPortefeuille() {
    etat.portefeuille = await Chain.Portefeuille.creer();
    etat.clePortefeuille = await etat.portefeuille.exporterCle();
    try { localStorage.setItem(CLE_PORTEFEUILLE, JSON.stringify(etat.clePortefeuille)); } catch (e) { /* file:// */ }
    journaliser('Portefeuille créé : ' + etat.portefeuille.adresse, 'succes');

    // Allocation de départ : 100 jetons créés pour ce portefeuille.
    const allocation = new Chain.Transaction(
      null,
      etat.portefeuille.adresse,
      100,
      'Allocation de départ'
    );
    await allocation.calculerHash();
    etat.transactionsEnAttente.push(allocation);
    journaliser('Allocation de départ : 100 jetons (à miner).', 'info');

    rafraichirTout();
  }

  async function miner() {
    if (etat.enMinage) return;
    etat.enMinage = true;
    const bouton = $('#bouton-miner');
    bouton.disabled = true;
    const depart = performance.now();
    journaliser('Minage en cours… (difficulté ' + etat.chaine.difficulte + ')', 'info');

    // Les transactions signées en attente intègrent ce bloc.
    const transactions = etat.transactionsEnAttente.slice();
    etat.transactionsEnAttente = [];
    if (etat.portefeuille) {
      // Récompense de minage : les jetons sont créés, pas déplacés.
      const recompense = new Chain.Transaction(
        null,
        etat.portefeuille.adresse,
        10,
        'Récompense de minage'
      );
      await recompense.calculerHash();
      transactions.push(recompense);
    }

    const bloc = await etat.chaine.miner(transactions, (nonce, hash) => {
      $('#minage-etat').textContent = 'essai ' + nonce + '… ' + hash.slice(0, 12);
    });
    bloc.dureeMs = Math.round(performance.now() - depart);

    sauvegarder();
    journaliser('Bloc #' + bloc.index + ' miné en ' + bloc.dureeMs + ' ms — ' + bloc.hash.slice(0, 16) + '…', 'succes');
    $('#minage-etat').textContent = 'Prêt';
    etat.enMinage = false;
    bouton.disabled = false;
    rafraichirTout();
  }

  async function transferer(destinataire, montant, libelle) {
    if (!etat.portefeuille) {
      journaliser('✗ Créez d’abord un portefeuille.', 'erreur');
      return;
    }
    if (soldeAffiche() < montant) {
      journaliser('✗ Solde insuffisant (' + soldeAffiche() + ' ⛁).', 'erreur');
      return;
    }
    const transaction = new Chain.Transaction(
      etat.portefeuille.adresse,
      destinataire,
      montant,
      libelle || 'Transfert'
    );
    transaction.signature = await etat.portefeuille.signer(transaction.contenu());
    await transaction.calculerHash();
    etat.transactionsEnAttente.push(transaction);
    journaliser('Transaction signée : ' + transaction.hash.slice(0, 16) + '… (en attente de minage)', 'info');
    rafraichirTout();
  }

  async function acheter(idProduit) {
    const produit = etat.produits.find((p) => p.id === idProduit);
    if (!produit || !etat.portefeuille) return;
    const adresseVendeur = '0x' + 'marche'.padEnd(40, '0');
    await transferer(adresseVendeur, produit.prix, 'Achat : ' + produit.nom);
  }

  /* ---------------------------------------------------------------- */
  /* Interface                                                         */
  /* ---------------------------------------------------------------- */

  function brancherUI() {
    $('#bouton-portefeuille').addEventListener('click', creerPortefeuille);
    $('#bouton-miner').addEventListener('click', miner);

    $('#difficulte').addEventListener('change', (e) => {
      etat.chaine.difficulte = parseInt(e.target.value, 10);
      sauvegarder();
      journaliser('Difficulté portée à ' + etat.chaine.difficulte + ' zéros hexadécimaux.', 'info');
    });

    $('#form-transfert').addEventListener('submit', async (e) => {
      e.preventDefault();
      const destinataire = $('#destinataire').value.trim();
      const montant = parseInt($('#montant').value, 10);
      if (!destinataire || !montant || montant <= 0) {
        journaliser('✗ Destinataire et montant valides requis.', 'erreur');
        return;
      }
      await transferer(destinataire, montant, $('#libelle').value.trim());
      $('#form-transfert').reset();
    });

    $('#marche').addEventListener('click', (e) => {
      const bouton = e.target.closest('[data-produit]');
      if (!bouton) return;
      acheter(Number(bouton.dataset.produit));
    });

    $('#bouton-verifier').addEventListener('click', async () => {
      const resultat = await etat.chaine.verifier();
      journaliser((resultat.valide ? '✓ ' : '✗ ') + resultat.raison, resultat.valide ? 'succes' : 'erreur');
    });

    $('#bouton-reinitialiser').addEventListener('click', () => {
      etat.chaine = new Chain.Chaine(etat.chaine.difficulte);
      etat.transactionsEnAttente = [];
      sauvegarder();
      journaliser('Chaîne réinitialisée.', 'info');
      rafraichirTout();
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

  async function demarrer() {
    etat.transactionsEnAttente = [];

    /* Détection du moteur : si un serveur Node répond à la sonde, on
       précharge la chaîne depuis SQLite ; sinon on reste en localStorage
       (mode file:// garanti). Le portefeuille, lui, n'est jamais concerné. */
    try { await window.LumeAPI.detecter(); } catch (e) { /* mode local */ }
    if (window.LumeAPI && window.LumeAPI.actif) {
      serveurActif = true;
      try { await brancherModeServeur(); } catch (e) { serveurActif = false; /* on lit localStorage */ }
    }

    brancherUI();
    initialiserTheme();
    charger();
    await chargerPortefeuille();
    $('#difficulte').value = String(etat.chaine.difficulte);
    rafraichirTout();
    journaliser('Chaîne chargée : ' + etat.chaine.blocs.length + ' bloc(s)' +
      (serveurActif ? ' (base SQLite).' : '.'), 'info');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer);
  } else {
    demarrer();
  }
})(window);
