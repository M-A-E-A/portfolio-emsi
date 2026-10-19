/* =====================================================================
   Pair à pair chiffré — WebRTC + WebCrypto.
   ---------------------------------------------------------------------
   Le principe, en quatre temps :

   1. SIGNALISATION — WebRTC ne trouve pas tout seul son interlocuteur.
      On échange donc une « offre » et une « réponse » manuellement, par
      copié-collé. Aucun serveur ne voit ces codes.

   2. CANAL — le DataChannel s'ouvre : connexion directe entre les deux
      pairs, les messages ne passent par aucun serveur.

   3. CLÉ DE SESSION — chaque pair génère une paire ECDH P-256 et
      transmet sa clé publique sur le canal. La clé secrète est dérivée
      par ECDH : elle ne quitte jamais aucun des deux navigateurs.

   4. CHIFFREMENT — chaque message est chiffré en AES-GCM 256 avant
      d'être envoyé. (Le canal est déjà protégé par DTLS : c'est une
      seconde couche, indépendante du transport.)

   L'empreinte de la clé de session, affichée des deux côtés, permet de
   vérifier qu'on parle bien à la bonne personne.
   ===================================================================== */
(function (global) {
  'use strict';

  const P2P = (global.P2P = global.P2P || {});

  const encodeur = new TextEncoder();
  const decodeur = new TextDecoder();

  function versBase64(buffer) {
    const octets = new Uint8Array(buffer);
    let binaire = '';
    for (let i = 0; i < octets.length; i++) binaire += String.fromCharCode(octets[i]);
    return btoa(binaire);
  }

  function deBase64(texte) {
    const binaire = atob(texte);
    const octets = new Uint8Array(binaire.length);
    for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
    return octets;
  }

  /* ---------------------------------------------------------------- */
  /* Le canal de pair à pair                                           */
  /* ---------------------------------------------------------------- */

  class Pair {
    constructor(options) {
      options = options || {};
      this.utiliserStun = options.utiliserStun !== false;
      this.pc = null;
      this.canal = null;
      this.clePrivee = null;
      this.clePublique = null;
      this.cleSession = null;
      this.empreinte = null;
      this.cleDistante = null;
      this.role = null;

      this.surMessage = options.surMessage || function () {};
      this.surEtat = options.surEtat || function () {};
      this.surJournal = options.surJournal || function () {};
      this.surCle = options.surCle || function () {};
    }

    creerConnexion() {
      const configuration = {};
      if (this.utiliserStun) {
        // Le STUN sert uniquement à découvrir l'adresse publique de la
        // machine. Il ne voit JAMAIS le contenu des messages.
        configuration.iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
      }
      this.pc = new RTCPeerConnection(configuration);
      this.pc.onconnectionstatechange = () => {
        this.surEtat(this.pc.connectionState);
        if (this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed') {
          this.surJournal('Connexion interrompue (' + this.pc.connectionState + ').', 'erreur');
        }
      };
      this.pc.onicecandidate = (e) => {
        if (e.candidate) {
          this.nbCandidats = (this.nbCandidats || 0) + 1;
          this.surJournal('Candidat ICE découvert.', 'info');
        }
      };
    }

    /** Attend que la collecte ICE soit terminée (les codes sont complets). */
    async collecterCandidats() {
      if (this.pc.iceGatheringState === 'complete') return;
      await new Promise((resolve) => {
        const temps = setTimeout(resolve, 2500); // garde-fou
        this.pc.onicegatheringstatechange = () => {
          if (this.pc.iceGatheringState === 'complete') {
            clearTimeout(temps);
            resolve();
          }
        };
      });
      if (!this.nbCandidats) {
        this.surJournal(
          '⚠ Aucun candidat ICE : cette machine n’expose aucune adresse réseau '
          + 'exploitable par WebRTC. Le canal ne pourra pas s’ouvrir ici.',
          'erreur'
        );
      }
    }

    /** Étape 1 : le premier pair produit l'offre. */
    async creerOffre() {
      this.creerConnexion();
      this.role = 'emetteur';
      this.canal = this.pc.createDataChannel('lume', { ordered: true });
      this.brancherCanal();
      const offre = await this.pc.createOffer();
      await this.pc.setLocalDescription(offre);
      await this.collecterCandidats();
      return this.encoderCode({ type: 'offre', sdp: this.pc.localDescription.sdp });
    }

    /** Étape 2 : le second pair accepte l'offre et produit la réponse. */
    async accepterOffre(code) {
      const donnees = this.decoderCode(code);
      if (donnees.type !== 'offre') throw new Error('Ce code n’est pas une offre.');
      this.creerConnexion();
      this.role = 'recepteur';
      this.pc.ondatachannel = (e) => {
        this.canal = e.channel;
        this.brancherCanal();
      };
      await this.pc.setRemoteDescription({ type: 'offer', sdp: donnees.sdp });
      const reponse = await this.pc.createAnswer();
      await this.pc.setLocalDescription(reponse);
      await this.collecterCandidats();
      return this.encoderCode({ type: 'reponse', sdp: this.pc.localDescription.sdp });
    }

    /** Étape 3 : le premier pair accepte la réponse : le canal s'ouvre. */
    async accepterReponse(code) {
      const donnees = this.decoderCode(code);
      if (donnees.type !== 'reponse') throw new Error('Ce code n’est pas une réponse.');
      await this.pc.setRemoteDescription({ type: 'answer', sdp: donnees.sdp });
    }

    brancherCanal() {
      this.canal.onopen = () => {
        this.surEtat('ouvert');
        this.surJournal('Canal direct ouvert.', 'succes');
        this.preparerCle();
      };
      this.canal.onclose = () => {
        this.surEtat('fermé');
        this.surJournal('Canal fermé.', 'info');
      };
      this.canal.onmessage = (e) => this.recevoir(e.data);
    }

    /* ---------------- Chiffrement de bout en bout ---------------- */

    /** Prépare la paire ECDH et publie la clé publique. */
    async preparerCle() {
      if (this.clePrivee) return;
      // generateKey renvoie une PAIRE de clés : il faut garder la clé
      // privée pour deriveBits, et publier la clé publique.
      const paire = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveBits']
      );
      this.clePrivee = paire.privateKey;
      this.clePublique = await crypto.subtle.exportKey('jwk', paire.publicKey);
      this.envoyerBrut({ type: 'cle-publique', cle: this.clePublique });
    }

    /** Reçoit un message (clé publique ou message chiffré). */
    async recevoir(donnees) {
      let paquet;
      try {
        paquet = JSON.parse(donnees);
      } catch (e) {
        return;
      }

      if (paquet.type === 'cle-publique') {
        await this.deriverCle(paquet.cle);
        return;
      }

      if (paquet.type === 'message') {
        try {
          const texte = await this.dechiffrer(paquet.iv, paquet.donnees);
          this.surMessage({ texte, distant: true });
        } catch (e) {
          this.surJournal('✗ Message illisible : ' + e.message, 'erreur');
        }
      }
    }

    /** Dérive la clé de session à partir de la clé publique distante. */
    async deriverCle(clePubliqueDistante) {
      const publique = await crypto.subtle.importKey(
        'jwk',
        clePubliqueDistante,
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        []
      );
      const bits = await crypto.subtle.deriveBits(
        { name: 'ECDH', public: publique },
        this.clePrivee,
        256
      );
      this.cleSession = await crypto.subtle.importKey(
        'raw',
        bits,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );
      // Empreinte : les deux pairs doivent obtenir la même chaîne.
      const empreinte = await crypto.subtle.digest('SHA-256', bits);
      this.empreinte = Array.from(new Uint8Array(empreinte))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 32)
        .replace(/(.{4})(?=.)/g, '$1 ');
      this.surCle(this.empreinte);
      this.surJournal('Clé de session dérivée par ECDH.', 'succes');
    }

    /** Chiffre et envoie un message. */
    async envoyer(texte) {
      if (!this.canal || this.canal.readyState !== 'open') {
        throw new Error('Le canal n’est pas ouvert.');
      }
      if (!this.cleSession) {
        throw new Error('La clé de session n’est pas encore dérivée.');
      }
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const chiffre = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        this.cleSession,
        encodeur.encode(texte)
      );
      this.envoyerBrut({
        type: 'message',
        iv: versBase64(iv),
        donnees: versBase64(chiffre)
      });
      this.surMessage({ texte, distant: false });
    }

    async dechiffrer(ivBase64, donneesBase64) {
      if (!this.cleSession) throw new Error('clé de session absente');
      const clair = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: deBase64(ivBase64) },
        this.cleSession,
        deBase64(donneesBase64)
      );
      return decodeur.decode(clair);
    }

    envoyerBrut(objet) {
      if (this.canal && this.canal.readyState === 'open') {
        this.canal.send(JSON.stringify(objet));
      }
    }

    /* ---------------- Codes de signalisation ---------------- */

    encoderCode(objet) {
      return versBase64(encodeur.encode(JSON.stringify(objet)));
    }

    decoderCode(code) {
      const texte = code.trim().replace(/\s+/g, '');
      return JSON.parse(decodeur.decode(deBase64(texte)));
    }

    fermer() {
      try { if (this.canal) this.canal.close(); } catch (e) { /* déjà fermé */ }
      try { if (this.pc) this.pc.close(); } catch (e) { /* déjà fermé */ }
      this.cleSession = null;
      this.clePrivee = null;
      this.clePublique = null;
    }
  }

  P2P.Pair = Pair;
  P2P.versBase64 = versBase64;
  P2P.deBase64 = deBase64;
})(window);
