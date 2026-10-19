/* =====================================================================
   Blockchain — blocs, transactions, arbre de Merkle, preuve de travail.
   ---------------------------------------------------------------------
   Les primitives cryptographiques (SHA-256, ECDSA) viennent de WebCrypto :
   on n'implémente pas la cryptographie, on écrit la blockchain.

   Point important : le hachage est asynchrone (WebCrypto renvoie une
   promesse). Le mineur travaille donc par lots, en rendant la main
   régulièrement pour ne pas figer l'interface.
   ===================================================================== */
(function (global) {
  'use strict';

  const Chain = (global.Chain = global.Chain || {});

  /* ---------------------------------------------------------------- */
  /* Utilitaires cryptographiques                                       */
  /* ---------------------------------------------------------------- */

  const encodeur = new TextEncoder();

  function versHex(buffer) {
    const octets = new Uint8Array(buffer);
    let hex = '';
    for (let i = 0; i < octets.length; i++) {
      hex += octets[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  /** SHA-256 hexadécimal d'une chaîne. */
  async function sha256(texte) {
    const empreinte = await crypto.subtle.digest('SHA-256', encodeur.encode(texte));
    return versHex(empreinte);
  }

  /** Sérialisation canonique : l'ordre des clés est fixe. */
  function canonique(objet) {
    if (objet === null || typeof objet !== 'object') return JSON.stringify(objet);
    if (Array.isArray(objet)) return '[' + objet.map(canonique).join(',') + ']';
    const cles = Object.keys(objet).sort();
    return '{' + cles.map((c) => JSON.stringify(c) + ':' + canonique(objet[c])).join(',') + '}';
  }

  /* ---------------------------------------------------------------- */
  /* Portefeuille                                                      */
  /* ---------------------------------------------------------------- */

  class Portefeuille {
    constructor(paire, adresse) {
      this.paire = paire;
      this.adresse = adresse;
    }

    /** Génère une nouvelle paire de clés ECDSA P-256. */
    static async creer() {
      const paire = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
      );
      const publicJwk = await crypto.subtle.exportKey('jwk', paire.publicKey);
      const empreinte = await sha256(canonique(publicJwk));
      return new Portefeuille(paire, '0x' + empreinte.slice(0, 40));
    }

    /** Restaure un portefeuille depuis une clé privée exportée (JWK). */
    static async restaurer(cleJwk) {
      const paire = await crypto.subtle.importKey(
        'jwk',
        cleJwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign']
      );
      const publicJwk = await crypto.subtle.exportKey('jwk', paire.publicKey);
      const empreinte = await sha256(canonique(publicJwk));
      return new Portefeuille(paire, '0x' + empreinte.slice(0, 40));
    }

    async exporterCle() {
      return crypto.subtle.exportKey('jwk', this.paire.privateKey);
    }

    /** Signe un contenu et renvoie la signature en base64. */
    async signer(texte) {
      const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        this.paire.privateKey,
        encodeur.encode(texte)
      );
      let binaire = '';
      const octets = new Uint8Array(signature);
      for (let i = 0; i < octets.length; i++) binaire += String.fromCharCode(octets[i]);
      return btoa(binaire);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Transaction                                                        */
  /* ---------------------------------------------------------------- */

  class Transaction {
    constructor(expediteur, destinataire, montant, libelle) {
      this.expediteur = expediteur;
      this.destinataire = destinataire;
      this.montant = montant;
      this.libelle = libelle || '';
      this.horodatage = Date.now();
      this.signature = null;
      this.hash = null;
    }

    /** Contenu signé : tout sauf la signature et le hash. */
    contenu() {
      return canonique({
        expediteur: this.expediteur,
        destinataire: this.destinataire,
        montant: this.montant,
        libelle: this.libelle,
        horodatage: this.horodatage
      });
    }

    async calculerHash() {
      this.hash = await sha256(this.contenu());
      return this.hash;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Arbre de Merkle                                                   */
  /* ---------------------------------------------------------------- */

  /**
   * Racine de Merkle des transactions. Chaque feuille est le hash d'une
   * transaction ; chaque nœud interne est le hash de ses deux enfants.
   * Une preuve d'inclusion montre alors qu'une transaction est bien dans
   * le bloc, sans avoir à reveal toutes les autres.
   */
  async function racineMerkle(transactions) {
    if (!transactions.length) return '0'.repeat(64);
    let niveau = await Promise.all(transactions.map((t) => t.hash));
    while (niveau.length > 1) {
      const suivant = [];
      for (let i = 0; i < niveau.length; i += 2) {
        const gauche = niveau[i];
        const droite = i + 1 < niveau.length ? niveau[i + 1] : niveau[i];
        suivant.push(await sha256(gauche + droite));
      }
      niveau = suivant;
    }
    return niveau[0];
  }

  /* ---------------------------------------------------------------- */
  /* Bloc                                                              */
  /* ---------------------------------------------------------------- */

  class Bloc {
    constructor(index, transactions, precedentHash, difficulty) {
      this.index = index;
      this.transactions = transactions;
      this.previousHash = precedentHash;
      this.difficulty = difficulty;
      this.timestamp = Date.now();
      this.nonce = 0;
      this.merkleRoot = null;
      this.hash = null;
    }

    async preparer() {
      this.merkleRoot = await racineMerkle(this.transactions);
      await this.calculerHash();
      return this;
    }

    async calculerHash() {
      this.hash = await sha256(canonique({
        index: this.index,
        merkleRoot: this.merkleRoot,
        previousHash: this.previousHash,
        timestamp: this.timestamp,
        nonce: this.nonce,
        difficulty: this.difficulty
      }));
      return this.hash;
    }

    get valide() {
      return this.hash && this.hash.startsWith('0'.repeat(this.difficulty));
    }
  }

  /* ---------------------------------------------------------------- */
  /* La chaîne                                                          */
  /* ---------------------------------------------------------------- */

  class Chaine {
    constructor(difficulte) {
      this.blocs = [];
      this.difficulte = difficulte !== undefined ? difficulte : 2;
      this.compteurEncheres = 0;
    }

    get dernierBloc() {
      return this.blocs[this.blocs.length - 1] || null;
    }

    /**
     * Mine un nouveau bloc.
     * @param {Function} surProgression  appelé régulièrement avec le nonce
     *   courant, pour afficher l'avancement.
     */
    async miner(transactions, surProgression) {
      const precedent = this.dernierBloc;
      const bloc = new Bloc(
        this.blocs.length,
        transactions,
        precedent ? precedent.hash : '0'.repeat(64),
        this.difficulte
      );
      await bloc.preparer();

      const prefixe = '0'.repeat(this.difficulte);
      for (;;) {
        bloc.nonce = this.compteurEncheres++;
        await bloc.calculerHash();
        if (bloc.hash.startsWith(prefixe)) {
          this.blocs.push(bloc);
          return bloc;
        }
        // On rend la main tous les 400 essais : l'interface reste vive.
        if (bloc.nonce % 400 === 0) {
          if (surProgression) surProgression(bloc.nonce, bloc.hash);
          await new Promise((r) => setTimeout(r, 0));
        }
      }
    }

    /** Vérifie toute la chaîne : liens, Merkle, preuve de travail. */
    async verifier() {
      for (let i = 0; i < this.blocs.length; i++) {
        const bloc = this.blocs[i];
        if (i > 0 && bloc.previousHash !== this.blocs[i - 1].hash) {
          return { valide: false, raison: 'Bloc ' + i + ' : lien rompu avec le bloc précédent' };
        }
        if (!bloc.hash.startsWith('0'.repeat(bloc.difficulty))) {
          return { valide: false, raison: 'Bloc ' + i + ' : preuve de travail invalide' };
        }
        const racine = await racineMerkle(bloc.transactions);
        if (racine !== bloc.merkleRoot) {
          return { valide: false, raison: 'Bloc ' + i + ' : transactions modifiées après minage' };
        }
      }
      return { valide: true, raison: 'Chaîne intacte : ' + this.blocs.length + ' bloc(s) vérifié(s)' };
    }

    /** Toutes les transactions de la chaîne. */
    transactions() {
      return this.blocs.flatMap((b) => b.transactions);
    }

    /** Solde d'une adresse. */
    solde(adresse) {
      let total = 0;
      for (const t of this.transactions()) {
        // Une transaction d'expediteur null est une création de jetons
        // (récompense de minage, allocation initiale) : la somme arrive
        // sans qu'aucun compte soit débité.
        if (t.expediteur === adresse) total -= t.montant;
        if (t.destinataire === adresse) total += t.montant;
      }
      return total;
    }
  }

  Chain.sha256 = sha256;
  Chain.canonique = canonique;
  Chain.Portefeuille = Portefeuille;
  Chain.Transaction = Transaction;
  Chain.Bloc = Bloc;
  Chain.Chaine = Chaine;
  Chain.racineMerkle = racineMerkle;
})(window);
