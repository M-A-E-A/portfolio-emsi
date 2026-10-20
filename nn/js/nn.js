/* =====================================================================
   Réseau de neurones — forward, rétropropagation, Adam.
   ---------------------------------------------------------------------
   Tout est écrit à la main, en tableaux typés (Float32Array) pour que
   l'entraînement reste rapide même en JavaScript.

   Choix d'implémentation :
   - poids rangés en W[l * neurones + n] : l'entrée l, le neurone n ;
   - une couche dense fully-connected, avec ReLU en caché et softmax
     en sortie ;
   - Adam pour l'optimisation (momentum, correction du biais) ;
   - la rétropropagation est écrite explicitement, en appliquant la règle
     de la chaîne couche par couche.
   ===================================================================== */
(function (global) {
  'use strict';

  const NN = (global.NN = global.NN || {});

  /* ---------------------------------------------------------------- */
  /* Générateur pseudo-aléatoire reproductible                          */
  /* ---------------------------------------------------------------- */

  /** Générateur congruentiel simple : même graine, même réseau. */
  function generateur(graine) {
    let etat = graine >>> 0;
    return function () {
      etat = (etat * 1664525 + 1013904223) >>> 0;
      return etat / 4294967296;
    };
  }

  /** Initialisation de He : adaptée à ReLU. */
  function initialiserHe(taille, alea) {
    const valeurs = new Float32Array(taille);
    const ecart = Math.sqrt(2 / taille);
    for (let i = 0; i < taille; i++) {
      valeurs[i] = (alea() * 2 - 1) * ecart;
    }
    return valeurs;
  }

  /* ---------------------------------------------------------------- */
  /* Couche dense                                                      */
  /* ---------------------------------------------------------------- */

  class CoucheDense {
    constructor(entrees, neurones, activation, alea) {
      this.entrees = entrees;
      this.neurones = neurones;
      this.activation = activation || 'none';
      this.W = initialiserHe(entrees * neurones, alea);
      this.b = new Float32Array(neurones);

      // Moments d'Adam
      this.mW = new Float32Array(this.W.length);
      this.vW = new Float32Array(this.W.length);
      this.mb = new Float32Array(this.b.length);
      this.vb = new Float32Array(this.b.length);

      this.temps = 0;
      this.cacheEntree = null;
      this.cacheZ = null;
      this.cacheSortie = null;

      // Accumulateurs de gradient (remis à zéro après chaque mise à jour)
      this.dW = new Float32Array(this.W.length);
      this.db = new Float32Array(this.b.length);
    }

    forward(x) {
      const z = new Float32Array(this.neurones);
      for (let n = 0; n < this.neurones; n++) {
        let somme = this.b[n];
        for (let l = 0; l < this.entrees; l++) {
          somme += x[l] * this.W[l * this.neurones + n];
        }
        z[n] = somme;
      }

      const a = new Float32Array(this.neurones);
      if (this.activation === 'relu') {
        for (let n = 0; n < this.neurones; n++) a[n] = z[n] > 0 ? z[n] : 0;
      } else if (this.activation === 'softmax') {
        // softmax stable : on retranche le maximum avant l'exponentielle
        let max = -Infinity;
        for (let n = 0; n < this.neurones; n++) if (z[n] > max) max = z[n];
        let somme = 0;
        for (let n = 0; n < this.neurones; n++) {
          a[n] = Math.exp(z[n] - max);
          somme += a[n];
        }
        for (let n = 0; n < this.neurones; n++) a[n] /= somme;
      } else {
        a.set(z);
      }

      this.cacheEntree = x;
      this.cacheZ = z;
      this.cacheSortie = a;
      return a;
    }

    /**
     * Rétropropagation : reçoit le gradient de la sortie et renvoie le
     * gradient de l'entrée. Les accumulateurs dW et db sont conservés
     * pour l'étape d'optimisation.
     */
    backward(gradSortie) {
      const x = this.cacheEntree;
      const z = this.cacheZ;
      const dz = new Float32Array(this.neurones);

      // Dérivée de l'activation
      for (let n = 0; n < this.neurones; n++) {
        if (this.activation === 'relu') {
          dz[n] = z[n] > 0 ? gradSortie[n] : 0;
        } else if (this.activation === 'softmax') {
          // softmax + entropie croisée : le gradient se simplifie en
          // (p - y). C'est le grand avantage du couple softmax/CE.
          dz[n] = gradSortie[n];
        } else {
          dz[n] = gradSortie[n];
        }
      }

      const gradEntree = new Float32Array(this.entrees);
      for (let n = 0; n < this.neurones; n++) {
        const g = dz[n];
        if (g === 0) continue;
        this.db[n] += g;
        for (let l = 0; l < this.entrees; l++) {
          const w = this.W[l * this.neurones + n];
          this.dW[l * this.neurones + n] += x[l] * g;
          gradEntree[l] += w * g;
        }
      }
      return gradEntree;
    }

    /** Mise à jour des poids par Adam. */
    actualiser(lr, beta1, beta2, epsilon) {
      this.temps++;
      const correction1 = 1 - Math.pow(beta1, this.temps);
      const correction2 = 1 - Math.pow(beta2, this.temps);

      for (let i = 0; i < this.W.length; i++) {
        const g = this.dW[i];
        this.mW[i] = beta1 * this.mW[i] + (1 - beta1) * g;
        this.vW[i] = beta2 * this.vW[i] + (1 - beta2) * g * g;
        const m = this.mW[i] / correction1;
        const v = this.vW[i] / correction2;
        this.W[i] -= lr * m / (Math.sqrt(v) + epsilon);
        this.dW[i] = 0;
      }
      for (let i = 0; i < this.b.length; i++) {
        const g = this.db[i];
        this.mb[i] = beta1 * this.mb[i] + (1 - beta1) * g;
        this.vb[i] = beta2 * this.vb[i] + (1 - beta2) * g * g;
        const m = this.mb[i] / correction1;
        const v = this.vb[i] / correction2;
        this.b[i] -= lr * m / (Math.sqrt(v) + epsilon);
        this.db[i] = 0;
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Le réseau                                                         */
  /* ---------------------------------------------------------------- */

  class Reseau {
    constructor(forme, graine) {
      const alea = generateur(graine === undefined ? 42 : graine);
      this.couches = [];
      let entrees = forme[0];
      for (let i = 1; i < forme.length; i++) {
        const activation = i === forme.length - 1 ? 'softmax' : 'relu';
        this.couches.push(new CoucheDense(entrees, forme[i], activation, alea));
        entrees = forme[i];
      }
    }

    /** Passe avant : renvoie la distribution de probabilités. */
    forward(x) {
      let courant = x;
      for (const couche of this.couches) {
        courant = couche.forward(courant);
      }
      return courant;
    }

    /** Passe arrière : renvoie le gradient de l'entrée. */
    backward(gradSortie) {
      let grad = gradSortie;
      for (let i = this.couches.length - 1; i >= 0; i--) {
        grad = this.couches[i].backward(grad);
      }
      return grad;
    }

    actualiser(lr, beta1, beta2, epsilon) {
      for (const couche of this.couches) {
        couche.actualiser(lr, beta1, beta2, epsilon);
      }
    }

    /** Nombre de paramètres entraînables. */
    get nbParametres() {
      let total = 0;
      for (const couche of this.couches) {
        total += couche.W.length + couche.b.length;
      }
      return total;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Entraînement                                                       */
  /* ---------------------------------------------------------------- */

  /**
   * Entraîne le réseau sur un jeu de données.
   * @param {Reseau} reseau
   * @param {Array} echantillons  [{x: Float32Array, y: number}]
   * @param {Object} options      {epochs, lr, beta1, beta2, epsilon,
   *                               tailleLot, melange, surProgression}
   */
  function entrainer(reseau, echantillons, options) {
    options = Object.assign({
      epochs: 3, lr: 0.01, beta1: 0.9, beta2: 0.999, epsilon: 1e-8,
      tailleLot: 16, melange: true, surProgression: null
    }, options || {});

    const alea = generateur(7);
    const ordre = echantillons.map((_, i) => i);
    const historique = [];
    let etape = 0;

    for (let epoque = 0; epoque < options.epochs; epoque++) {
      if (options.melange) {
        for (let i = ordre.length - 1; i > 0; i--) {
          const j = Math.floor(alea() * (i + 1));
          const t = ordre[i];
          ordre[i] = ordre[j];
          ordre[j] = t;
        }
      }

      let perteTotale = 0;
      let corrects = 0;
      let dansLot = 0;

      for (const index of ordre) {
        const echantillon = echantillons[index];
        const sortie = reseau.forward(echantillon.x);

        // Entropie croisée : -log(p[classe])
        const p = Math.max(sortie[echantillon.y], 1e-9);
        perteTotale += -Math.log(p);
        if (argmax(sortie) === echantillon.y) corrects++;

        // Gradient de la perte par rapport à la sortie (softmax + CE)
        const grad = new Float32Array(sortie.length);
        for (let k = 0; k < sortie.length; k++) {
          grad[k] = sortie[k] - (k === echantillon.y ? 1 : 0);
        }

        // Le gradient s'accumule : la mise à jour a lieu une fois par lot.
        // Sans cela, chaque exemple provoque un pas bruité, et le réseau
        // oscille au lieu de converger.
        reseau.backward(grad);
        dansLot++;
        etape++;

        if (dansLot >= options.tailleLot) {
          reseau.actualiser(options.lr, options.beta1, options.beta2, options.epsilon);
          dansLot = 0;
        }

        if (options.surProgression && etape % 50 === 0) {
          options.surProgression({
            etape,
            epoque,
            perte: perteTotale / (etape || 1),
            exactitude: corrects / (etape || 1)
          });
        }
      }

      // Un lot incomplet est tout de même appliqué.
      if (dansLot > 0) {
        reseau.actualiser(options.lr, options.beta1, options.beta2, options.epsilon);
      }

      const entree = {
        epoque: epoque + 1,
        perte: perteTotale / echantillons.length,
        exactitude: corrects / echantillons.length
      };
      historique.push(entree);
      if (options.surProgression) options.surProgression(entree);
    }
    return historique;
  }

  function argmax(tableau) {
    let meilleur = 0;
    for (let i = 1; i < tableau.length; i++) {
      if (tableau[i] > tableau[meilleur]) meilleur = i;
    }
    return meilleur;
  }

  NN.CoucheDense = CoucheDense;
  NN.Reseau = Reseau;
  NN.entrainer = entrainer;
  NN.argmax = argmax;
  NN.generateur = generateur;
})(window);
