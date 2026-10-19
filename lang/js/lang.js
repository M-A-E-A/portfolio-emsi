/* =====================================================================
   Front end du langage « Lume » — lexer et analyseur.
   ---------------------------------------------------------------------
   Le langage est volontairement simple, mais complet : types, opérateurs,
   fonctions, conditions, boucles et listes. Ce qui compte ici, c'est la
   structure de l'arbre syntaxique produit : c'est elle que le débogueur
   affiche et que l'interpréteur parcourt.

   L'analyse est une descente récursive pour les instructions et une
   analyse par priorité (« precedence climbing ») pour les expressions.
   ===================================================================== */
(function (global) {
  'use strict';

  const Lume = (global.Lume = global.Lume || {});

  /* ---------------------------------------------------------------- */
  /* Lexer                                                            */
  /* ---------------------------------------------------------------- */

  const MOTS_CLES = new Set(['if', 'else', 'while', 'fn', 'return', 'true', 'false', 'null', 'let', 'const']);

  // Les opérateurs de deux caractères sont testés avant ceux d'un seul.
  const PONCTUATION = [
    '==', '!=', '<=', '>=', '&&', '||',
    '+', '-', '*', '/', '%', '<', '>', '=',
    '(', ')', '{', '}', '[', ']', ',', ';', '!'
  ];

  class ErreurSyntaxe extends Error {
    constructor(message, ligne, colonne) {
      super(message + ' (ligne ' + ligne + ', colonne ' + colonne + ')');
      this.ligne = ligne;
      this.colonne = colonne;
    }
  }

  /**
   * Transforme le texte source en suite de jetons.
   */
  function analyser(source) {
    const jetons = [];
    let i = 0;
    let ligne = 1;
    let colonne = 1;

    const avancer = (n) => {
      for (let k = 0; k < n; k++) {
        if (source[i] === '\n') {
          ligne++;
          colonne = 1;
        } else {
          colonne++;
        }
        i++;
      }
    };

    while (i < source.length) {
      const c = source[i];

      // Espaces et retours à la ligne
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
        avancer(1);
        continue;
      }

      // Commentaire de fin de ligne
      if (c === '/' && source[i + 1] === '/') {
        while (i < source.length && source[i] !== '\n') avancer(1);
        continue;
      }

      // Nombre
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(source[i + 1] || ''))) {
        const debut = i;
        while (i < source.length && /[0-9.]/.test(source[i])) avancer(1);
        const texte = source.slice(debut, i);
        const valeur = Number(texte);
        if (Number.isNaN(valeur)) {
          throw new ErreurSyntaxe('Nombre invalide « ' + texte + ' »', ligne, colonne);
        }
        jetons.push({ type: 'nombre', valeur, ligne, colonne });
        continue;
      }

      // Chaîne
      if (c === '"' || c === "'") {
        const guillemet = c;
        const ligneDebut = ligne;
        const colonneDebut = colonne;
        avancer(1);
        let texte = '';
        while (i < source.length && source[i] !== guillemet) {
          if (source[i] === '\\' && i + 1 < source.length) {
            avancer(1);
            const ech = source[i];
            texte += ech === 'n' ? '\n' : ech === 't' ? '\t' : ech;
          } else {
            texte += source[i];
          }
          avancer(1);
        }
        if (i >= source.length) {
          throw new ErreurSyntaxe('Chaîne non fermée', ligneDebut, colonneDebut);
        }
        avancer(1); // guillemet fermant
        jetons.push({ type: 'chaine', valeur: texte, ligne: ligneDebut, colonne: colonneDebut });
        continue;
      }

      // Identifiant ou mot clé
      if (/[A-Za-z_]/.test(c)) {
        const debut = i;
        const ligneDebut = ligne;
        const colonneDebut = colonne;
        while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) avancer(1);
        const nom = source.slice(debut, i);
        jetons.push({
          type: MOTS_CLES.has(nom) ? 'motcle' : 'ident',
          valeur: nom,
          ligne: ligneDebut,
          colonne: colonneDebut
        });
        continue;
      }

      // Ponctuation
      const trouve = PONCTUATION.find((p) => source.startsWith(p, i));
      if (trouve) {
        const ligneDebut = ligne;
        const colonneDebut = colonne;
        avancer(trouve.length);
        jetons.push({ type: 'ponctuation', valeur: trouve, ligne: ligneDebut, colonne: colonneDebut });
        continue;
      }

      throw new ErreurSyntaxe('Caractère inattendu « ' + c + ' »', ligne, colonne);
    }

    jetons.push({ type: 'fin', valeur: '<fin>', ligne, colonne });
    return jetons;
  }

  /* ---------------------------------------------------------------- */
  /* Analyseur                                                         */
  /* ---------------------------------------------------------------- */

  // Priorités des opérateurs binaires : plus le nombre est élevé, plus
  // l'opérateur lie fort.
  const PRIORITES = {
    '||': 1,
    '&&': 2,
    '==': 3, '!=': 3,
    '<': 4, '<=': 4, '>': 4, '>=': 4,
    '+': 5, '-': 5,
    '*': 6, '/': 6, '%': 6
  };

  class Analyseur {
    constructor(jetons) {
      this.jetons = jetons;
      this.position = 0;
    }

    jetonCourant() {
      return this.jetons[this.position];
    }

    jetonPrecedent() {
      return this.jetons[this.position - 1];
    }

    estPunctuation(valeur) {
      const j = this.jetonCourant();
      return j.type === 'ponctuation' && j.valeur === valeur;
    }

    estMotCle(valeur) {
      const j = this.jetonCourant();
      return j.type === 'motcle' && j.valeur === valeur;
    }

    mangerPunctuation(valeur) {
      if (!this.estPunctuation(valeur)) {
        const j = this.jetonCourant();
        throw new ErreurSyntaxe(
          '« ' + valeur + ' » attendu mais « ' + j.valeur + ' » trouvé',
          j.ligne, j.colonne
        );
      }
      this.position++;
    }

    mangerMotCle(valeur) {
      if (!this.estMotCle(valeur)) {
        const j = this.jetonCourant();
        throw new ErreurSyntaxe(
          '« ' + valeur + ' » attendu mais « ' + j.valeur + ' » trouvé',
          j.ligne, j.colonne
        );
      }
      this.position++;
    }

    attendreIdent() {
      const j = this.jetonCourant();
      if (j.type !== 'ident') {
        throw new ErreurSyntaxe('Identifiant attendu', j.ligne, j.colonne);
      }
      this.position++;
      return j.valeur;
    }

    /* ---------------- Instructions ---------------- */

    parseProgramme() {
      const corps = [];
      while (this.jetonCourant().type !== 'fin') {
        corps.push(this.parseInstruction());
      }
      return { type: 'Programme', corps };
    }

    parseInstruction() {
      const j = this.jetonCourant();

      if (j.type === 'ponctuation' && j.valeur === '{') return this.parseBloc();
      if (j.type === 'ponctuation' && j.valeur === ';') {
        this.position++;
        return { type: 'InstructionVide' };
      }

      if (this.estMotCle('if')) return this.parseSi();
      if (this.estMotCle('while')) return this.parseTantQue();
      if (this.estMotCle('fn')) return this.parseFonction();
      if (this.estMotCle('return')) return this.parseRetour();

      // Expression seule : affectation ou appel.
      // « let » et « const » sont acceptés comme modificateurs : ils
      // rendent la lecture plus familière sans changer la sémantique.
      if (this.estMotCle('let') || this.estMotCle('const')) {
        this.position++;
      }
      const expression = this.parseExpression();
      this.mangerPunctuation(';');
      return { type: 'InstructionExpression', expression };
    }

    parseBloc() {
      this.mangerPunctuation('{');
      const corps = [];
      while (!this.estPunctuation('}')) {
        if (this.jetonCourant().type === 'fin') {
          throw new ErreurSyntaxe('Accroche « } » manquante', this.jetonCourant().ligne, this.jetonCourant().colonne);
        }
        corps.push(this.parseInstruction());
      }
      this.mangerPunctuation('}');
      return { type: 'Bloc', corps };
    }

    parseSi() {
      this.mangerMotCle('if');
      const test = this.parseExpression();
      const consequent = this.parseBloc();
      let alternate = null;
      if (this.estMotCle('else')) {
        this.mangerMotCle('else');
        alternate = this.estMotCle('if') ? this.parseSi() : this.parseBloc();
      }
      return { type: 'InstructionSi', test, consequent, alternate };
    }

    /**
     * Fonction anonyme, utilisée comme expression : c'est ce qui permet
     * d'écrire une fermeture (« fn() { … } »).
     */
    parseSiExpression() {
      this.mangerMotCle('fn');
      this.mangerPunctuation('(');
      const parametres = [];
      while (!this.estPunctuation(')')) {
        parametres.push(this.attendreIdent());
        if (this.estPunctuation(',')) this.position++;
      }
      this.mangerPunctuation(')');
      const corps = this.parseBloc();
      return { type: 'ExpressionFonction', parametres, corps };
    }

    parseTantQue() {
      this.mangerMotCle('while');
      const test = this.parseExpression();
      const corps = this.parseBloc();
      return { type: 'InstructionTantQue', test, corps };
    }

    parseFonction() {
      this.mangerMotCle('fn');
      const nom = this.attendreIdent();
      this.mangerPunctuation('(');
      const parametres = [];
      while (!this.estPunctuation(')')) {
        parametres.push(this.attendreIdent());
        if (this.estPunctuation(',')) this.position++;
      }
      this.mangerPunctuation(')');
      const corps = this.parseBloc();
      return { type: 'DeclarationFonction', nom, parametres, corps };
    }

    parseRetour() {
      this.mangerMotCle('return');
      let argument = null;
      if (!this.estPunctuation(';')) argument = this.parseExpression();
      this.mangerPunctuation(';');
      return { type: 'InstructionRetour', argument };
    }

    /* ---------------- Expressions ---------------- */

    parseExpression() {
      return this.parseAffectation();
    }

    parseAffectation() {
      // « nom = expression » — on reconnaît le motif avant de parser.
      if (this.jetonCourant().type === 'ident' && this.jetons[this.position + 1]
          && this.jetons[this.position + 1].type === 'ponctuation'
          && this.jetons[this.position + 1].valeur === '=') {
        const nom = this.attendreIdent();
        this.mangerPunctuation('=');
        const valeur = this.parseExpression();
        return { type: 'Affectation', nom, valeur };
      }
      return this.parseBinaire(1);
    }

    parseBinaire(prioriteMin) {
      let gauche = this.parseUnaire();

      for (;;) {
        const j = this.jetonCourant();
        if (j.type !== 'ponctuation') break;
        const priorite = PRIORITES[j.valeur];
        if (!priorite || priorite < prioriteMin) break;

        this.position++;
        const droite = this.parseBinaire(priorite + 1);
        const estLogique = j.valeur === '&&' || j.valeur === '||';
        gauche = {
          type: estLogique ? 'ExpressionLogique' : 'ExpressionBinaire',
          operateur: j.valeur,
          gauche,
          droite
        };
      }
      return gauche;
    }

    parseUnaire() {
      const j = this.jetonCourant();
      if (j.type === 'ponctuation' && (j.valeur === '!' || j.valeur === '-')) {
        this.position++;
        return { type: 'ExpressionUnaire', operateur: j.valeur, argument: this.parseUnaire() };
      }
      return this.parsePostfixe();
    }

    parsePostfixe() {
      let expression = this.parsePrimaire();

      for (;;) {
        if (this.estPunctuation('(')) {
          this.position++;
          const arguments_ = [];
          while (!this.estPunctuation(')')) {
            arguments_.push(this.parseExpression());
            if (this.estPunctuation(',')) this.position++;
          }
          this.mangerPunctuation(')');
          expression = { type: 'AppelFonction', callee: expression, arguments: arguments_ };
        } else if (this.estPunctuation('[')) {
          this.position++;
          const index = this.parseExpression();
          this.mangerPunctuation(']');
          expression = { type: 'AccesIndex', objet: expression, index };
        } else {
          break;
        }
      }
      return expression;
    }

    parsePrimaire() {
      const j = this.jetonCourant();

      if (this.estMotCle('fn')) return this.parseSiExpression();
      if (j.type === 'nombre') {
        this.position++;
        return { type: 'Nombre', valeur: j.valeur };
      }
      if (j.type === 'chaine') {
        this.position++;
        return { type: 'Chaine', valeur: j.valeur };
      }
      if (j.type === 'motcle') {
        if (j.valeur === 'true' || j.valeur === 'false') {
          this.position++;
          return { type: 'Booleen', valeur: j.valeur === 'true' };
        }
        if (j.valeur === 'null') {
          this.position++;
          return { type: 'Null' };
        }
        throw new ErreurSyntaxe('Mot clé « ' + j.valeur + ' » inattendu', j.ligne, j.colonne);
      }
      if (j.type === 'ident') {
        this.position++;
        return { type: 'Identifiant', nom: j.valeur };
      }
      if (j.type === 'ponctuation' && j.valeur === '(') {
        this.position++;
        const expression = this.parseExpression();
        this.mangerPunctuation(')');
        return expression;
      }
      if (j.type === 'ponctuation' && j.valeur === '[') {
        this.position++;
        const elements = [];
        while (!this.estPunctuation(']')) {
          elements.push(this.parseExpression());
          if (this.estPunctuation(',')) this.position++;
        }
        this.mangerPunctuation(']');
        return { type: 'Liste', elements };
      }

      throw new ErreurSyntaxe('Expression inattendue « ' + j.valeur + ' »', j.ligne, j.colonne);
    }
  }

  /** Point d'entrée : source → arbre syntaxique. */
  function analyserSource(source) {
    const analyseur = new Analyseur(analyser(source));
    return analyseur.parseProgramme();
  }

  Lume.analyserSource = analyserSource;
  Lume.ErreurSyntaxe = ErreurSyntaxe;
  Lume.jetons = analyser;
})(window);
