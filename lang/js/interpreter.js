/* =====================================================================
   Interpréteur de « Lume » — évaluation par parcours d'arbre.
   ---------------------------------------------------------------------
   L'évaluateur est un GÉNÉRATEUR : à chaque nœud de l'arbre, il «
   s'arrête » et rend la main. C'est ce qui permet au débogueur d'avancer
   pas à pas, de mettre en surbrillance le nœud courant, et d'afficher les
   variables telles qu'elles sont à cet instant précis.

   Un évaluateur classique (fonction récursive qui retourne une valeur)
   serait bien plus court — mais impossible à interrompre au bon endroit.
   ===================================================================== */
(function (global) {
  'use strict';

  const Lume = (global.Lume = global.Lume || {});

  /* ---------------------------------------------------------------- */
  /* Valeurs et environnement                                           */
  /* ---------------------------------------------------------------- */

  class ErreurExecution extends Error {
    constructor(message, noeud) {
      super(message);
      this.noeud = noeud || null;
    }
  }

  class Fermeture {
    constructor(parametres, corps, environnement) {
      this.parametres = parametres;
      this.corps = corps;
      this.environnement = environnement;
    }
  }

  class Environnement {
    constructor(parent) {
      this.valeurs = new Map();
      this.parent = parent || null;
    }

    definir(nom, valeur) {
      this.valeurs.set(nom, valeur);
    }

    obtenir(nom) {
      if (this.valeurs.has(nom)) return this.valeurs.get(nom);
      if (this.parent) return this.parent.obtenir(nom);
      throw new ErreurExecution('« ' + nom + ' » n’est pas défini');
    }

    a(nom) {
      return this.valeurs.has(nom) || (this.parent ? this.parent.a(nom) : false);
    }

    affecter(nom, valeur) {
      if (this.valeurs.has(nom)) {
        this.valeurs.set(nom, valeur);
        return;
      }
      if (this.parent) {
        this.parent.affecter(nom, valeur);
        return;
      }
      this.valeurs.set(nom, valeur);
    }

    /** Copie plate de l'environnement courant, pour l'affichage. */
    instantane() {
      const resultat = [];
      let env = this;
      while (env) {
        for (const [nom, valeur] of env.valeurs) {
          // Les fonctions natives ne font pas partie du programme de
          // l'utilisateur : on ne les affiche pas.
          if (valeur && valeur.natif) continue;
          if (!resultat.some((e) => e.nom === nom)) {
            resultat.push({ nom, valeur: formatValeur(valeur) });
          }
        }
        env = env.parent;
      }
      return resultat;
    }
  }

  function formatValeur(valeur) {
    if (valeur === null || valeur === undefined) return 'null';
    if (typeof valeur === 'string') return '"' + valeur + '"';
    if (valeur instanceof Fermeture) return 'fn ' + (valeur.nom || 'anonyme');
    if (typeof valeur === 'function') return 'fn ' + (valeur.nom || 'anonyme');
    if (Array.isArray(valeur)) return '[' + valeur.map(formatValeur).join(', ') + ']';
    return String(valeur);
  }

  /* ---------------------------------------------------------------- */
  /* Évaluateur                                                        */
  /* ---------------------------------------------------------------- */

  /**
   * @param {object} noeud   nœud de l'arbre syntaxique
   * @param {Environnement} env
   * @returns {Generator} produit la valeur du nœud ; chaque `yield` rend
   *   un évènement décrivant l'état courant (pour le débogueur).
   */
  function* evaluer(noeud, env) {
    switch (noeud.type) {
      /* ---------------- Littéraux ---------------- */
      case 'Programme': {
        yield { evenement: 'entree', noeud };
        let resultat = null;
        for (const instruction of noeud.corps) {
          resultat = yield* evaluer(instruction, env);
        }
        yield { evenement: 'sortie', noeud, valeur: resultat };
        return resultat;
      }

      case 'Nombre':
      case 'Chaine':
      case 'Booleen':
        yield { evenement: 'entree', noeud };
        yield { evenement: 'sortie', noeud, valeur: noeud.valeur };
        return noeud.valeur;

      case 'Null':
        yield { evenement: 'entree', noeud };
        yield { evenement: 'sortie', noeud, valeur: null };
        return null;

      /* ---------------- Instructions ---------------- */
      case 'InstructionVide':
        yield { evenement: 'entree', noeud };
        yield { evenement: 'sortie', noeud, valeur: null };
        return null;

      case 'InstructionExpression': {
        yield { evenement: 'entree', noeud };
        const valeur = yield* evaluer(noeud.expression, env);
        yield { evenement: 'sortie', noeud, valeur };
        return valeur;
      }

      case 'Bloc': {
        yield { evenement: 'entree', noeud };
        // Un bloc crée un environnement fils : les variables déclarées
        // dedans ne fuient pas vers l'extérieur.
        const local = new Environnement(env);
        let resultat = null;
        for (const instruction of noeud.corps) {
          resultat = yield* evaluer(instruction, local);
        }
        yield { evenement: 'sortie', noeud, valeur: resultat };
        return resultat;
      }

      case 'InstructionSi': {
        yield { evenement: 'entree', noeud };
        const test = yield* evaluer(noeud.test, env);
        yield { evenement: 'test', noeud, valeur: test };
        let resultat = null;
        if (truthy(test)) {
          resultat = yield* evaluer(noeud.consequent, env);
        } else if (noeud.alternate) {
          resultat = yield* evaluer(noeud.alternate, env);
        }
        yield { evenement: 'sortie', noeud, valeur: resultat };
        return resultat;
      }

      case 'InstructionTantQue': {
        yield { evenement: 'entree', noeud };
        let resultat = null;
        let tours = 0;
        for (;;) {
          const test = yield* evaluer(noeud.test, env);
          yield { evenement: 'test', noeud, valeur: test };
          if (!truthy(test)) break;
          resultat = yield* evaluer(noeud.corps, env);
          tours++;
          // Garde-fou : une boucle infinie ne doit pas bloquer l'onglet.
          if (tours > 100000) {
            throw new ErreurExecution('Boucle trop longue (plus de 100 000 tours)', noeud);
          }
        }
        yield { evenement: 'sortie', noeud, valeur: resultat };
        return resultat;
      }

      case 'DeclarationFonction': {
        yield { evenement: 'entree', noeud };
        const fermeture = new Fermeture(noeud.parametres, noeud.corps, env);
        fermeture.nom = noeud.nom;
        env.definir(noeud.nom, fermeture);
        yield { evenement: 'sortie', noeud, valeur: noeud.nom };
        return fermeture;
      }

      case 'ExpressionFonction': {
        yield { evenement: 'entree', noeud };
        const fermeture = new Fermeture(noeud.parametres, noeud.corps, env);
        fermeture.nom = 'anonyme';
        yield { evenement: 'sortie', noeud, valeur: fermeture };
        return fermeture;
      }

      case 'InstructionRetour': {
        yield { evenement: 'entree', noeud };
        const valeur = noeud.argument ? yield* evaluer(noeud.argument, env) : null;
        yield { evenement: 'sortie', noeud, valeur };
        // Un « return » est une exception dédiée : elle remonte jusqu'à
        // l'appel de fonction, qui la rattrape.
        const signal = new ErreurExecution('return');
        signal.valeur = valeur;
        signal.estRetour = true;
        throw signal;
      }

      /* ---------------- Expressions ---------------- */
      case 'Identifiant': {
        yield { evenement: 'entree', noeud };
        if (!env.a(noeud.nom)) {
          throw new ErreurExecution('« ' + noeud.nom + ' » n’est pas défini', noeud);
        }
        const valeur = env.obtenir(noeud.nom);
        yield { evenement: 'sortie', noeud, valeur };
        return valeur;
      }

      case 'Affectation': {
        yield { evenement: 'entree', noeud };
        const valeur = yield* evaluer(noeud.valeur, env);
        env.affecter(noeud.nom, valeur);
        yield { evenement: 'sortie', noeud, valeur };
        return valeur;
      }

      case 'Liste': {
        yield { evenement: 'entree', noeud };
        const elements = [];
        for (const element of noeud.elements) {
          elements.push(yield* evaluer(element, env));
        }
        yield { evenement: 'sortie', noeud, valeur: elements };
        return elements;
      }

      case 'ExpressionBinaire': {
        yield { evenement: 'entree', noeud };
        const gauche = yield* evaluer(noeud.gauche, env);
        const droite = yield* evaluer(noeud.droite, env);
        const valeur = operation(noeud.operateur, gauche, droite, noeud);
        yield { evenement: 'sortie', noeud, valeur };
        return valeur;
      }

      case 'ExpressionLogique': {
        yield { evenement: 'entree', noeud };
        const gauche = yield* evaluer(noeud.gauche, env);
        // Court-circuit : && s'arrête à gauche si elle est fausse.
        if (noeud.operateur === '&&' && !truthy(gauche)) {
          yield { evenement: 'court-circuit', noeud, valeur: gauche };
          return gauche;
        }
        if (noeud.operateur === '||' && truthy(gauche)) {
          yield { evenement: 'court-circuit', noeud, valeur: gauche };
          return gauche;
        }
        const droite = yield* evaluer(noeud.droite, env);
        const valeur = droite;
        yield { evenement: 'sortie', noeud, valeur };
        return valeur;
      }

      case 'ExpressionUnaire': {
        yield { evenement: 'entree', noeud };
        const argument = yield* evaluer(noeud.argument, env);
        const valeur = noeud.operateur === '!' ? !truthy(argument) : -argument;
        yield { evenement: 'sortie', noeud, valeur };
        return valeur;
      }

      case 'AppelFonction': {
        yield { evenement: 'entree', noeud };
        const callee = yield* evaluer(noeud.callee, env);
        const arguments_ = [];
        for (const argument of noeud.arguments) {
          arguments_.push(yield* evaluer(argument, env));
        }

        // Fonction native (print, len…) : appel direct.
        if (!(callee instanceof Fermeture) && typeof callee === 'function') {
          const valeur = callee.apply(null, arguments_);
          yield { evenement: 'sortie', noeud, valeur };
          return valeur;
        }
        if (!(callee instanceof Fermeture)) {
          throw new ErreurExecution('Ce n’est pas une fonction', noeud);
        }

        const local = new Environnement(callee.environnement);
        callee.parametres.forEach((nom, i) => local.definir(nom, arguments_[i]));

        // Le « return » de la fonction est intercepté ici : il donne la
        // valeur de l'appel, sans interrompre le programme appelant.
        let valeur;
        try {
          valeur = yield* evaluer(callee.corps, local);
        } catch (e) {
          if (e instanceof ErreurExecution && e.estRetour) {
            valeur = e.valeur;
          } else {
            throw e;
          }
        }
        yield { evenement: 'sortie', noeud, valeur };
        return valeur;
      }

      case 'AccesIndex': {
        yield { evenement: 'entree', noeud };
        const objet = yield* evaluer(noeud.objet, env);
        const index = yield* evaluer(noeud.index, env);
        if (!Array.isArray(objet)) {
          throw new ErreurExecution('Seules les listes acceptent l’indexation', noeud);
        }
        const valeur = objet[index];
        yield { evenement: 'sortie', noeud, valeur };
        return valeur;
      }

      default:
        throw new ErreurExecution('Nœud inconnu : ' + noeud.type, noeud);
    }
  }

  function truthy(valeur) {
    if (valeur === null || valeur === undefined) return false;
    if (typeof valeur === 'number') return valeur !== 0;
    if (typeof valeur === 'string') return valeur.length > 0;
    if (typeof valeur === 'boolean') return valeur;
    return true;
  }

  function operation(operateur, gauche, droite, noeud) {
    if (operateur === '+') {
      if (typeof gauche === 'string' || typeof droite === 'string') {
        return String(gauche) + String(droite);
      }
      if (Array.isArray(gauche) && Array.isArray(droite)) return gauche.concat(droite);
      return gauche + droite;
    }
    if (operateur === '-') return gauche - droite;
    if (operateur === '*') return gauche * droite;
    if (operateur === '/') {
      if (droite === 0) throw new ErreurExecution('Division par zéro', noeud);
      return gauche / droite;
    }
    if (operateur === '%') {
      if (droite === 0) throw new ErreurExecution('Reste par zéro', noeud);
      return gauche % droite;
    }
    if (operateur === '==') return egalite(gauche, droite);
    if (operateur === '!=') return !egalite(gauche, droite);
    if (operateur === '<') return gauche < droite;
    if (operateur === '<=') return gauche <= droite;
    if (operateur === '>') return gauche > droite;
    if (operateur === '>=') return gauche >= droite;
    throw new ErreurExecution('Opérateur inconnu : ' + operateur, noeud);
  }

  function egalite(a, b) {
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && a.every((v, i) => egalite(v, b[i]));
    }
    return a === b;
  }

  /* ---------------------------------------------------------------- */
  /* Pilote : exécution pas à pas                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Encapsule l'évaluation et permet de l'avancer événement par événement.
   */
  class Execution {
    /**
     * @param {object} programme     arbre syntaxique
     * @param {Function} preparation  rappelée au démarrage pour installer
     *        les fonctions natives dans l'environnement global.
     */
    constructor(programme, preparation) {
      this.programme = programme;
      this.preparation = preparation || null;
      this.environnement = new Environnement(null);
      this.evenements = [];
      this.enCours = false;
      this.termine = false;
      this.erreur = null;
      this.valeur = null;
      this.generateur = null;
      this.ligneCourante = 1;
    }

    /** Démarre (ou redémarre) l'exécution. */
    demarrer() {
      this.environnement = new Environnement(null);
      if (this.preparation) this.preparation(this.environnement);
      this.evenements = [];
      this.termine = false;
      this.erreur = null;
      this.valeur = null;
      this.generateur = evaluer(this.programme, this.environnement);
      this.enCours = true;
    }

    /**
     * Avance d'un événement.
     * @returns {object|null} l'événement traité, ou null si c'est fini.
     */
    pas() {
      if (this.termine) return null;
      let etape;
      try {
        etape = this.generateur.next();
      } catch (e) {
        if (e instanceof ErreurExecution && e.estRetour) {
          // Un « return » remonte jusqu'à l'appel de fonction.
          this.termine = true;
          this.enCours = false;
          return { evenement: 'retour', noeud: e.noeud, valeur: e.valeur };
        }
        this.erreur = e;
        this.termine = true;
        this.enCours = false;
        return { evenement: 'erreur', noeud: e.noeud, message: e.message };
      }

      if (etape.done) {
        this.termine = true;
        this.enCours = false;
        this.valeur = etape.value;
        return { evenement: 'fin', noeud: null, valeur: etape.value };
      }
      return etape.value;
    }

    /** Exécute jusqu'au bout en accumulant tous les événements. */
    toutExecuter() {
      const evenements = [];
      let e;
      while ((e = this.pas()) !== null) {
        evenements.push(e);
        if (e.evenement === 'erreur' || e.evenement === 'fin') break;
      }
      this.evenements = evenements;
      return evenements;
    }
  }

  /**
   * Format d'affichage : contrairement à formatValeur (qui représente
   * une valeur), les chaînes sont montrées sans guillemets — comme le
   * fait `print` dans la plupart des langages.
   */
  function formatAffiche(valeur) {
    if (typeof valeur === 'string') return valeur;
    return formatValeur(valeur);
  }

  Lume.ErreurExecution = ErreurExecution;
  Lume.Environnement = Environnement;
  Lume.Fermeture = Fermeture;
  Lume.evaluer = evaluer;
  Lume.Execution = Execution;
  Lume.formatValeur = formatValeur;
  Lume.formatAffiche = formatAffiche;
})(window);
