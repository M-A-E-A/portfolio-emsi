/* =====================================================================
   CRDT — ensemble additif à jetons observés (OR-Set), par élément.
   ---------------------------------------------------------------------
   Le problème : deux personnes dessinent en même temps. Si on se contente
   d'envoyer l'état complet (« le trait est à x=10,y=20 »), l'ordre
   d'arrivée des messages change le résultat final.

   La réponse du CRDT : ne jamais réécrire, seulement ajouter. Chaque
   élément porte un ensemble de jetons d'ajout et un ensemble de jetons
   de suppression. Un élément est visible s'il possède au moins un jeton
   d'ajout qui n'a pas été supprimé.

   Deux propriétés en découlent :
   - COMMUTATIVITÉ : l'ordre d'arrivée des opérations ne change rien.
   - IDEMPOTENCE : recevoir deux fois la même opération ne change rien.

   L'annulation utilise le même mécanisme : elle supprime un jeton d'ajout.
   Elle reste donc, elle aussi, commutative.
   ===================================================================== */
(function (global) {
  'use strict';

  const CRDT = (global.CRDT = global.CRDT || {});

  /* ---------------------------------------------------------------- */
  /* Un élément dessiné                                                */
  /* ---------------------------------------------------------------- */

  class Element {
    constructor(id, auteur, type, props, horodatage) {
      this.id = id;
      this.auteur = auteur;
      this.type = type;
      this.props = props;
      this.horodatage = horodatage;
      // Un jeton d'ajout par ajout de l'élément : « id@auteur@horodatage ».
      this.ajouts = new Set([id + '@' + auteur + '@' + horodatage]);
      this.suppressions = new Set();
    }

    /** Visible s'il reste un jeton d'ajout non supprimé. */
    estVivant() {
      for (const jeton of this.ajouts) {
        if (!this.suppressions.has(jeton)) return true;
      }
      return false;
    }

    /**
     * Fusionne un élément distant. L'union des jetons est commutative ;
     * les propriétés suivent une règle « dernier écrivain gagne », avec
     * l'identifiant d'auteur en départage — donc déterministe.
     */
    fusionner(autre) {
      for (const jeton of autre.ajouts) this.ajouts.add(jeton);
      for (const jeton of autre.suppressions) this.suppressions.add(jeton);
      if (autre.horodatage > this.horodatage) {
        this.horodatage = autre.horodatage;
        this.props = autre.props;
        this.type = autre.type;
      } else if (autre.horodatage === this.horodatage && autre.auteur > this.auteur) {
        this.horodatage = autre.horodatage;
        this.props = autre.props;
        this.type = autre.type;
      }
      return this;
    }

    /** Opération d'annulation : on supprime un jeton d'ajout. */
    annuler() {
      for (const jeton of this.ajouts) {
        if (!this.suppressions.has(jeton)) {
          this.suppressions.add(jeton);
          return jeton;
        }
      }
      return null;
    }

    /** Opération de rétablissement : on retire un jeton de suppression. */
    retablir() {
      for (const jeton of this.suppressions) {
        this.suppressions.delete(jeton);
        return jeton;
      }
      return null;
    }

    serialiser() {
      return {
        id: this.id,
        auteur: this.auteur,
        type: this.type,
        props: this.props,
        horodatage: this.horodatage,
        ajouts: [...this.ajouts],
        suppressions: [...this.suppressions]
      };
    }

    static depuis(objet) {
      const element = new Element(objet.id, objet.auteur, objet.type, objet.props, objet.horodatage);
      element.ajouts = new Set(objet.ajouts || []);
      element.suppressions = new Set(objet.suppressions || []);
      return element;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Le tableau                                                        */
  /* ---------------------------------------------------------------- */

  class Tableau {
    constructor(auteur) {
      this.auteur = auteur;
      this.elements = new Map();
      this.compteur = 0;
      this.pileAnnulation = [];
      this.pileRetablissement = [];
    }

    /** Crée un nouvel élément local. */
    creer(type, props) {
      const id = this.auteur + ':' + (++this.compteur);
      const element = new Element(id, this.auteur, type, props, Date.now());
      this.elements.set(id, element);
      return element;
    }

    /** Applique une opération distante (fusion commutative). */
    fusionner(op) {
      const distant = Element.depuis(op.element);
      const local = this.elements.get(distant.id);
      if (!local) {
        this.elements.set(distant.id, distant);
        return distant;
      }
      local.fusionner(distant);
      return local;
    }

    /** Annule le dernier élément créé localement. */
    annulerDernier() {
      for (let i = this.pileAnnulation.length - 1; i >= 0; i--) {
        const element = this.elements.get(this.pileAnnulation[i]);
        if (element && element.annuler()) {
          this.pileRetablissement.push(this.pileAnnulation[i]);
          this.pileAnnulation.splice(i, 1);
          return element;
        }
      }
      return null;
    }

    /** Rétablit le dernier élément annulé. */
    retablirDernier() {
      for (let i = this.pileRetablissement.length - 1; i >= 0; i--) {
        const element = this.elements.get(this.pileRetablissement[i]);
        if (element && element.retablir()) {
          this.pileAnnulation.push(this.pileRetablissement[i]);
          this.pileRetablissement.splice(i, 1);
          return element;
        }
      }
      return null;
    }

    /** Les éléments visibles, dans l'ordre de création. */
    visibles() {
      return [...this.elements.values()]
        .filter((e) => e.estVivant())
        .sort((a, b) => a.horodatage - b.horodatage);
    }

    /** État complet, pour synchroniser un pair qui arrive. */
    serialiser() {
      return [...this.elements.values()].map((e) => e.serialiser());
    }
  }

  CRDT.Element = Element;
  CRDT.Tableau = Tableau;
})(window);
