/* ======================================================================
   Mini-SGBD
   ----------------------------------------------------------------------
   Un (petit) moteur de base de données écrit à la main, en trois étages :
   analyse lexicale, analyse syntaxique descendante récursive, exécution.
   Rien ne quitte le navigateur : les tables vivent dans localStorage.
   ====================================================================== */
(function () {
  'use strict';

  /* ----------------------------- Stockage ----------------------------- */
  const stockage = {
    lire(cle, defaut) { try { const v = localStorage.getItem(cle); return v === null ? defaut : JSON.parse(v); } catch (e) { return defaut; } },
    ecrire(cle, valeur) { try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch (e) {} }
  };
  const CLE_THEME = 'sgbd-theme';
  const CLE_BASE = 'sgbd-base';
  const CLE_HISTORIQUE = 'sgbd-historique';

  const $ = function (sel) { return document.querySelector(sel); };

  function formaterNombre(n) {
    if (typeof n !== 'number' || !isFinite(n)) { return String(n); }
    /* On rend directement la forme française (« 14,5 ») : repasser par
       Number() sur cette chaîne donnerait NaN à cause de la virgule. */
    return n.toLocaleString('fr-FR', { maximumFractionDigits: 6 });
  }

  /* ------------------------------ Erreurs ------------------------------ */
  function ErreurSql(message, position) {
    this.name = 'ErreurSql';
    this.message = message;
    this.position = (typeof position === 'number' && position >= 0) ? position : null;
  }
  ErreurSql.prototype = Object.create(Error.prototype);
  function erreur(message, position) { throw new ErreurSql(message, position); }

  /* Reconstitue le texte d'origine d'un nœud : c'est ce texte qui sert de
     libellé de colonne quand la requête ne donne pas d'alias. */
  function extrait(texte, d, f) { return String(texte).slice(d, f).replace(/\s+/g, ' ').trim(); }

  /* ======================================================================
     1. Analyse lexicale
     Découpe le texte en jetons. Aucune signification n'est attachée ici :
     on distingue seulement les mots-clés des identifiants, les nombres
     des chaînes, et les opérateurs de la ponctuation.
     ====================================================================== */

  const MOTS_CLES = {};
  ['SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'HAVING', 'ORDER', 'ASC', 'DESC',
   'LIMIT', 'OFFSET', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'LIKE', 'IN', 'BETWEEN',
   'AS', 'DISTINCT', 'JOIN', 'INNER', 'LEFT', 'ON', 'INSERT', 'INTO', 'VALUES',
   'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'PRIMARY', 'KEY', 'DEFAULT',
   'UNIQUE', 'TRUE', 'FALSE'
  ].forEach(function (m) { MOTS_CLES[m] = true; });

  const RE_DEBUT = /[A-Za-z_\u00C0-\u024F]/;
  const RE_CORPS = /[A-Za-z0-9_\u00C0-\u024F]/;
  const RE_ESPACE = /\s/;

  function analyserLexicalement(texte) {
    const jetons = [];
    const n = texte.length;
    let i = 0;

    while (i < n) {
      const c = texte.charAt(i);

      if (RE_ESPACE.test(c)) { i++; continue; }

      /* Commentaires : -- jusqu'à la fin de ligne, et / * … * / */
      if (c === '-' && texte.charAt(i + 1) === '-') {
        while (i < n && texte.charAt(i) !== '\n') { i++; }
        continue;
      }
      if (c === '/' && texte.charAt(i + 1) === '*') {
        const finCommentaire = texte.indexOf('*/', i + 2);
        if (finCommentaire === -1) { erreur('Commentaire « /* » non fermé : il manque « */ ».', i); }
        i = finCommentaire + 2;
        continue;
      }

      /* Chaîne entre apostrophes, '' pour une apostrophe littérale */
      if (c === "'") {
        let j = i + 1, valeur = '', fermee = false;
        while (j < n) {
          if (texte.charAt(j) === "'") {
            if (texte.charAt(j + 1) === "'") { valeur += "'"; j += 2; continue; }
            fermee = true;
            break;
          }
          valeur += texte.charAt(j);
          j++;
        }
        if (!fermee) { erreur("Chaîne non terminée : il manque l'apostrophe de fin.", i); }
        jetons.push({ type: 'chaine', valeur: valeur, pos: i, fin: j + 1, texte: texte.slice(i, j + 1) });
        i = j + 1;
        continue;
      }

      /* Nombre entier ou décimal */
      if ((c >= '0' && c <= '9') ||
          (c === '.' && texte.charAt(i + 1) >= '0' && texte.charAt(i + 1) <= '9')) {
        let j = i;
        while (j < n && texte.charAt(j) >= '0' && texte.charAt(j) <= '9') { j++; }
        if (texte.charAt(j) === '.') {
          j++;
          while (j < n && texte.charAt(j) >= '0' && texte.charAt(j) <= '9') { j++; }
        }
        const brut = texte.slice(i, j);
        jetons.push({ type: 'nombre', valeur: parseFloat(brut), pos: i, fin: j, texte: brut });
        i = j;
        continue;
      }

      /* Mot-clé ou identifiant */
      if (RE_DEBUT.test(c)) {
        let j = i;
        while (j < n && RE_CORPS.test(texte.charAt(j))) { j++; }
        const brut = texte.slice(i, j);
        const maj = brut.toUpperCase();
        const estCle = MOTS_CLES[maj] === true;
        jetons.push({
          type: estCle ? 'mot-cle' : 'ident',
          valeur: estCle ? maj : brut,
          brut: brut,
          pos: i, fin: j, texte: brut
        });
        i = j;
        continue;
      }

      /* Opérateurs à deux caractères. || est la concaténation : on le range
         avec la ponctuation pour qu'il tombe au bon niveau de priorité. */
      const deux = texte.substr(i, 2);
      if (deux === '!=' || deux === '<>' || deux === '<=' || deux === '>=' ) {
        jetons.push({ type: 'operateur', valeur: deux === '<>' ? '!=' : deux, pos: i, fin: i + 2, texte: deux });
        i += 2;
        continue;
      }
      if (deux === '||') {
        jetons.push({ type: 'ponct', valeur: '||', pos: i, fin: i + 2, texte: '||' });
        i += 2;
        continue;
      }

      /* Opérateurs à un caractère */
      if (c === '=' || c === '<' || c === '>') {
        jetons.push({ type: 'operateur', valeur: c, pos: i, fin: i + 1, texte: c });
        i++;
        continue;
      }
      if ('(),;.*+-/%'.indexOf(c) >= 0) {
        jetons.push({ type: 'ponct', valeur: c, pos: i, fin: i + 1, texte: c });
        i++;
        continue;
      }

      erreur('Caract\u00e8re inattendu \u00ab ' + c + ' \u00bb.', i);
    }

    jetons.push({ type: 'fin', valeur: '', brut: '', pos: n, fin: n, texte: '' });
    return jetons;
  }

  /* ======================================================================
     2. Analyse syntaxique descendante récursive
     Chaque fonction analyse un niveau de priorité et délègue au niveau
     inférieur. Les nœuds portent `debut` / `fin` : ce sont les repères qui
     permettent de retrouver le texte d'origine (libellés de colonnes) et de
     situer précisément une erreur de syntaxe.
     ====================================================================== */

  function analyserRequete(texte, jetons) {
    let pos = 0;

    function courant() { return jetons[pos]; }
    function suivant() { const j = jetons[pos]; pos++; return j; }
    function est(type, valeur) {
      const j = jetons[pos];
      if (j.type !== type) { return false; }
      return valeur === undefined || j.valeur === valeur;
    }
    function estMot(v) { return est('mot-cle', v); }
    function optionnel(type, valeur) { if (est(type, valeur)) { suivant(); return true; } return false; }
    function consommer(type, valeur, message) {
      if (est(type, valeur)) { return suivant(); }
      const j = courant();
      const trouve = j.type === 'fin' ? 'fin de requ\u00eate' : '\u00ab ' + (j.texte || j.valeur) + ' \u00bb';
      erreur(message || ('\u00ab ' + valeur + ' \u00bb attendu, mais trouv\u00e9 ' + trouve + '.'), j.pos);
    }
    function poser(noeud, debut) {
      noeud.debut = debut;
      noeud.fin = jetons[pos > 0 ? pos - 1 : 0].fin;
      return noeud;
    }

    /* ------------------------- Expressions ------------------------- */

    function expr() { return exprOu(); }

    function exprOu() {
      const debut = courant().pos;
      let g = exprEt();
      while (estMot('OR')) { suivant(); g = poser({ t: 'bin', op: 'OR', g: g, d: exprEt() }, debut); }
      return g;
    }
    function exprEt() {
      const debut = courant().pos;
      let g = exprNon();
      while (estMot('AND')) { suivant(); g = poser({ t: 'bin', op: 'AND', g: g, d: exprNon() }, debut); }
      return g;
    }
    function exprNon() {
      if (estMot('NOT')) {
        const debut = courant().pos;
        suivant();
        return poser({ t: 'una', op: 'NOT', e: exprNon() }, debut);
      }
      return exprComparaison();
    }
    function exprComparaison() {
      const debut = courant().pos;
      let g = exprAdditive();
      for (;;) {
        const j = courant();
        if (j.type === 'operateur') {
          suivant();
          g = poser({ t: 'bin', op: j.valeur, g: g, d: exprAdditive() }, debut);
          continue;
        }
        if (estMot('LIKE')) { suivant(); g = poser({ t: 'bin', op: 'LIKE', g: g, d: exprAdditive() }, debut); continue; }
        if (estMot('IS')) {
          suivant();
          const negation = optionnel('mot-cle', 'NOT');
          consommer('mot-cle', 'NULL', '« NULL » attendu après IS' + (negation ? ' NOT' : '') + '.');
          g = poser({ t: 'estNul', e: g, negation: negation }, debut);
          continue;
        }
        if (estMot('IN')) {
          suivant();
          consommer('ponct', '(', '« ( » attendu après IN.');
          const items = [expr()];
          while (optionnel('ponct', ',')) { items.push(expr()); }
          consommer('ponct', ')');
          g = poser({ t: 'in', e: g, items: items }, debut);
          continue;
        }
        if (estMot('BETWEEN')) {
          suivant();
          const a = exprAdditive();
          consommer('mot-cle', 'AND', '« AND » attendu entre les bornes de BETWEEN.');
          const b = exprAdditive();
          g = poser({ t: 'entre', e: g, a: a, b: b }, debut);
          continue;
        }
        return g;
      }
    }
    function exprAdditive() {
      const debut = courant().pos;
      let g = exprMultiplicative();
      for (;;) {
        const j = courant();
        if (j.type === 'ponct' && (j.valeur === '+' || j.valeur === '-' || j.valeur === '||')) {
          suivant();
          g = poser({ t: 'bin', op: j.valeur, g: g, d: exprMultiplicative() }, debut);
          continue;
        }
        return g;
      }
    }
    function exprMultiplicative() {
      const debut = courant().pos;
      let g = exprUnaire();
      for (;;) {
        const j = courant();
        if (j.type === 'ponct' && (j.valeur === '*' || j.valeur === '/' || j.valeur === '%')) {
          suivant();
          g = poser({ t: 'bin', op: j.valeur, g: g, d: exprUnaire() }, debut);
          continue;
        }
        return g;
      }
    }
    function exprUnaire() {
      const j = courant();
      if (j.type === 'ponct' && j.valeur === '-') { suivant(); return poser({ t: 'una', op: '-', e: exprUnaire() }, j.pos); }
      if (j.type === 'ponct' && j.valeur === '+') { suivant(); return exprUnaire(); }
      return exprPrimaire();
    }
    function exprPrimaire() {
      const j = courant();
      if (j.type === 'chaine') { suivant(); return poser({ t: 'lit', v: j.valeur }, j.pos); }
      if (j.type === 'nombre') { suivant(); return poser({ t: 'lit', v: j.valeur }, j.pos); }
      if (estMot('NULL')) { suivant(); return poser({ t: 'lit', v: null }, j.pos); }
      if (estMot('TRUE')) { suivant(); return poser({ t: 'lit', v: 1 }, j.pos); }
      if (estMot('FALSE')) { suivant(); return poser({ t: 'lit', v: 0 }, j.pos); }

      if (est('ponct', '(')) {
        suivant();
        const e = expr();
        consommer('ponct', ')');
        return e;
      }

      if (j.type === 'ident') {
        suivant();
        /* Qualificateur : table.colonne ou table.* */
        if (est('ponct', '.')) {
          suivant();
          if (est('ponct', '*')) { suivant(); return poser({ t: 'etoile', table: j.brut }, j.pos); }
          const c = consommer('ident', undefined, 'Nom de colonne attendu après « ' + j.brut + '. ».');
          return poser({ t: 'ref', table: j.brut, colonne: c.brut }, j.pos);
        }
        /* Appel de fonction */
        if (est('ponct', '(')) {
          suivant();
          const args = [];
          let distinct = false;
          if (est('ponct', '*')) {
            suivant();
            args.push({ t: 'etoile', debut: j.pos, fin: courant().pos });
          } else if (!est('ponct', ')')) {
            distinct = optionnel('mot-cle', 'DISTINCT');
            args.push(expr());
            while (optionnel('ponct', ',')) { args.push(expr()); }
          }
          consommer('ponct', ')');
          if (distinct) { args[0] = { t: 'distinction', e: args[0], debut: args[0].debut, fin: args[0].fin }; }
          return poser({ t: 'app', nom: j.brut, args: args }, j.pos);
        }
        return poser({ t: 'ref', table: null, colonne: j.brut }, j.pos);
      }

      erreur(j.type === 'fin'
        ? 'La requête se termine trop t\u00f4t : une expression \u00e9tait attendue.'
        : 'Expression inattendue \u00ab ' + j.texte + ' \u00bb.', j.pos);
    }

    /* --------------------------- Instructions --------------------------- */

    function analyserReferenceTable() {
      const nom = consommer('ident', undefined, 'Nom de table attendu.').brut;
      let alias = null;
      if (estMot('AS')) { suivant(); alias = consommer('ident', undefined, 'Alias attendu après AS.').brut; }
      else if (est('ident')) { alias = suivant().brut; }
      return { table: nom, alias: alias || nom };
    }

    function analyserJoints() {
      const joints = [];
      for (;;) {
        let type = null;
        if (estMot('INNER')) { suivant(); type = 'INNER'; }
        else if (estMot('LEFT')) { suivant(); type = 'LEFT'; }
        if (!estMot('JOIN')) {
          if (type !== null) { erreur('« JOIN » attendu après « ' + type + ' ».', courant().pos); }
          return joints;
        }
        suivant();
        const ref = analyserReferenceTable();
        consommer('mot-cle', 'ON', '« ON » attendu après la table jointe.');
        joints.push({ type: type || 'INNER', table: ref.table, alias: ref.alias, on: expr() });
      }
    }

    function analyserItemSelect() {
      if (est('ponct', '*')) { suivant(); return { expr: { t: 'etoile', debut: 0, fin: 0 }, alias: null }; }
      if (est('ident') &&
          jetons[pos + 1] && jetons[pos + 1].type === 'ponct' && jetons[pos + 1].valeur === '.' &&
          jetons[pos + 2] && jetons[pos + 2].type === 'ponct' && jetons[pos + 2].valeur === '*') {
        const tab = suivant().brut;
        suivant();
        suivant();
        return { expr: { t: 'etoile', table: tab, debut: 0, fin: 0 }, alias: null };
      }
      const e = expr();
      let alias = null;
      if (estMot('AS')) { suivant(); alias = consommer('ident', undefined, 'Alias attendu après AS.').brut; }
      else if (est('ident')) { alias = suivant().brut; }
      return { expr: e, alias: alias };
    }

    function analyserSelect() {
      suivant();
      const distinct = optionnel('mot-cle', 'DISTINCT');
      const colonnes = [];
      do { colonnes.push(analyserItemSelect()); } while (optionnel('ponct', ','));

      let depuis = null;
      const joints = [];
      if (optionnel('mot-cle', 'FROM')) {
        depuis = analyserReferenceTable();
        analyserJoints().forEach(function (j) { joints.push(j); });
      }

      let ou = null;
      if (optionnel('mot-cle', 'WHERE')) { ou = expr(); }

      let groupe = null;
      if (optionnel('mot-cle', 'GROUP')) {
        consommer('mot-cle', 'BY', '« BY » attendu après GROUP.');
        groupe = [];
        do { groupe.push(expr()); } while (optionnel('ponct', ','));
      }

      let avoir = null;
      if (optionnel('mot-cle', 'HAVING')) { avoir = expr(); }

      const tri = [];
      if (optionnel('mot-cle', 'ORDER')) {
        consommer('mot-cle', 'BY', '« BY » attendu après ORDER.');
        do {
          const e = expr();
          let sens = 'ASC';
          if (optionnel('mot-cle', 'DESC')) { sens = 'DESC'; } else { optionnel('mot-cle', 'ASC'); }
          tri.push({ e: e, sens: sens });
        } while (optionnel('ponct', ','));
      }

      let limite = null, decalage = null;
      if (optionnel('mot-cle', 'LIMIT')) {
        limite = consommer('nombre', undefined, 'Nombre attendu après LIMIT.').valeur;
        if (optionnel('mot-cle', 'OFFSET')) {
          decalage = consommer('nombre', undefined, 'Nombre attendu après OFFSET.').valeur;
        } else if (optionnel('ponct', ',')) {
          /* Variante MySQL : LIMIT décalage, nombre */
          decalage = limite;
          limite = consommer('nombre', undefined, 'Nombre attendu après « , » dans LIMIT.').valeur;
        }
      }

      return {
        t: 'select', distinct: distinct, colonnes: colonnes, depuis: depuis, joints: joints,
        ou: ou, groupe: groupe, avoir: avoir, tri: tri, limite: limite, decalage: decalage
      };
    }

    function analyserInsert() {
      suivant();
      consommer('mot-cle', 'INTO', '« INTO » attendu après INSERT.');
      const table = consommer('ident', undefined, 'Nom de table attendu après INTO.').brut;
      let colonnes = null;
      if (est('ponct', '(')) {
        suivant();
        colonnes = [];
        do { colonnes.push(consommer('ident', undefined, 'Nom de colonne attendu.').brut); } while (optionnel('ponct', ','));
        consommer('ponct', ')');
      }
      consommer('mot-cle', 'VALUES', '« VALUES » attendu.');
      const tuples = [];
      do {
        consommer('ponct', '(', '« ( » attendu avant la liste de valeurs.');
        const valeurs = [expr()];
        while (optionnel('ponct', ',')) { valeurs.push(expr()); }
        consommer('ponct', ')');
        tuples.push(valeurs);
      } while (optionnel('ponct', ','));
      return { t: 'insert', table: table, colonnes: colonnes, tuples: tuples };
    }

    function analyserUpdate() {
      suivant();
      const table = consommer('ident', undefined, 'Nom de table attendu après UPDATE.').brut;
      consommer('mot-cle', 'SET', '« SET » attendu.');
      const affectations = [];
      do {
        const colonne = consommer('ident', undefined, 'Nom de colonne attendu dans SET.').brut;
        consommer('operateur', '=', '« = » attendu après le nom de colonne.');
        affectations.push({ colonne: colonne, valeur: expr() });
      } while (optionnel('ponct', ','));
      let ou = null;
      if (optionnel('mot-cle', 'WHERE')) { ou = expr(); }
      return { t: 'update', table: table, affectations: affectations, ou: ou };
    }

    function analyserDelete() {
      suivant();
      consommer('mot-cle', 'FROM', '« FROM » attendu après DELETE.');
      const table = consommer('ident', undefined, 'Nom de table attendu après FROM.').brut;
      let ou = null;
      if (optionnel('mot-cle', 'WHERE')) { ou = expr(); }
      return { t: 'delete', table: table, ou: ou };
    }

    function analyserType() {
      const j = courant();
      if (j.type !== 'mot-cle' && j.type !== 'ident') { erreur('Type de colonne attendu.', j.pos); }
      suivant();
      if (est('ponct', '(')) {
        suivant();
        consommer('nombre', undefined, 'Nombre attendu entre les parenthèses du type.');
        consommer('ponct', ')');
      }
      const m = String(j.brut).toUpperCase();
      if (['INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'BOOLEAN', 'BOOL'].indexOf(m) >= 0) { return 'INTEGER'; }
      if (['REAL', 'FLOAT', 'DOUBLE', 'NUMERIC', 'DECIMAL'].indexOf(m) >= 0) { return 'REAL'; }
      if (['TEXT', 'VARCHAR', 'VARCHAR2', 'CHAR', 'CHARACTER', 'STRING', 'DATE', 'DATETIME'].indexOf(m) >= 0) { return 'TEXT'; }
      erreur('Type « ' + j.brut + ' » inconnu. Types acceptés : TEXT, INTEGER, REAL.', j.pos);
    }

    function analyserCreate() {
      suivant();
      consommer('mot-cle', 'TABLE', '« TABLE » attendu après CREATE.');
      const table = consommer('ident', undefined, 'Nom de table attendu.').brut;
      consommer('ponct', '(', '« ( » attendu avant la liste des colonnes.');
      const colonnes = [];
      do {
        const nom = consommer('ident', undefined, 'Nom de colonne attendu.').brut;
        const type = analyserType();
        let cle = false, nonNul = false, unique = false, defaut;
        for (;;) {
          if (estMot('PRIMARY')) { suivant(); consommer('mot-cle', 'KEY', '« KEY » attendu après PRIMARY.'); cle = true; continue; }
          if (estMot('NOT')) { suivant(); consommer('mot-cle', 'NULL', '« NULL » attendu après NOT.'); nonNul = true; continue; }
          if (estMot('UNIQUE')) { suivant(); unique = true; continue; }
          if (estMot('DEFAULT')) { suivant(); defaut = exprUnaire(); continue; }
          break;
        }
        colonnes.push({ nom: nom, type: type, cle: cle, nonNul: nonNul || cle, unique: unique, defaut: defaut });
      } while (optionnel('ponct', ','));
      consommer('ponct', ')');
      if (!colonnes.length) { erreur('Une table doit comporter au moins une colonne.', courant().pos); }
      return { t: 'create', table: table, colonnes: colonnes };
    }

    /* ------------------------------ Entrée ------------------------------ */

    const premier = courant();
    if (premier.type === 'fin') { erreur('Requête vide : écrivez une instruction SQL.', premier.pos); }

    let arbre;
    if (estMot('SELECT')) { arbre = analyserSelect(); }
    else if (estMot('INSERT')) { arbre = analyserInsert(); }
    else if (estMot('UPDATE')) { arbre = analyserUpdate(); }
    else if (estMot('DELETE')) { arbre = analyserDelete(); }
    else if (estMot('CREATE')) { arbre = analyserCreate(); }
    else {
      erreur('« ' + (premier.brut || premier.texte) + ' » ne commence aucune instruction connue. ' +
             'Ce moteur accepte SELECT, INSERT, UPDATE, DELETE et CREATE TABLE.', premier.pos);
    }

    optionnel('ponct', ';');
    if (courant().type !== 'fin') {
      erreur('Caractères en trop après la requête : « ' + courant().texte + ' ».', courant().pos);
    }
    /* Le texte source accompagne l'arbre : l'exécuteur s'en sert pour
       rebâtir les libellés de colonnes non aliasées. */
    arbre.texte = texte;
    return arbre;
  }

  /* ======================================================================
     3. Exécution
     On parcourt l'arbre contre les tables en mémoire. Deux détails de SQL
     sont respectés parce qu'ils changent le résultat :
       - la logique à trois valeurs : une comparaison avec NULL vaut
         inconnue, donc ne passe pas le WHERE ;
       - les colonnes non qualifiées deviennent ambiguës dès qu'elles
         existent dans deux tables jointes.
     ====================================================================== */

  const AMBIGUE = { ambigue: true };
  const AGREGATS = { COUNT: true, SUM: true, AVG: true, MIN: true, MAX: true };
  const FONCTIONS = { LENGTH: true, UPPER: true, LOWER: true, ABS: true, ROUND: true, COALESCE: true, IFNULL: true };

  function estAgregat(e) { return !!e && e.t === 'app' && AGREGATS[String(e.nom).toUpperCase()] === true; }

  function contientAgregat(e) {
    if (!e) { return false; }
    if (e.t === 'app') { return estAgregat(e) || e.args.some(contientAgregat); }
    if (e.t === 'bin') { return contientAgregat(e.g) || contientAgregat(e.d); }
    if (e.t === 'una' || e.t === 'estNul' || e.t === 'distinction') { return contientAgregat(e.e); }
    if (e.t === 'in') { return contientAgregat(e.e) || e.items.some(contientAgregat); }
    if (e.t === 'entre') { return contientAgregat(e.e) || contientAgregat(e.a) || contientAgregat(e.b); }
    return false;
  }

  function versBooleen(v) {
    if (v === null || v === undefined) { return null; }
    if (typeof v === 'boolean') { return v; }
    if (typeof v === 'number') { return v !== 0; }
    return true;
  }
  function et3(a, b) { if (a === false || b === false) { return false; } if (a === null || b === null) { return null; } return true; }
  function ou3(a, b) { if (a === true || b === true) { return true; } if (a === null || b === null) { return null; } return false; }
  function non3(a) { return a === null ? null : !a; }

  function comparer(a, b) {
    const an = a === null || a === undefined;
    const bn = b === null || b === undefined;
    if (an && bn) { return 0; }
    if (an) { return -1; }           /* NULL en premier, comme SQLite */
    if (bn) { return 1; }
    if (typeof a === 'number' && typeof b === 'number') { return a < b ? -1 : a > b ? 1 : 0; }
    const sa = String(a), sb = String(b);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  }

  function toNumber(v) {
    if (typeof v === 'number') { return isFinite(v) ? v : null; }
    if (typeof v === 'string') { const s = v.trim(); if (!s) { return null; } const x = Number(s); return isNaN(x) ? null : x; }
    if (typeof v === 'boolean') { return v ? 1 : 0; }
    return null;
  }

  function patternVersRegex(p) {
    let r = '';
    for (let i = 0; i < p.length; i++) {
      const c = p.charAt(i);
      if (c === '%') { r += '[\\s\\S]*'; }
      else if (c === '_') { r += '[\\s\\S]'; }
      else { r += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    }
    return new RegExp('^' + r + '$', 'i');
  }

  function appliquerOperateur(op, g, d) {
    if (op === 'LIKE') {
      if (g === null || d === null) { return null; }
      return patternVersRegex(String(d)).test(String(g));
    }
    if (g === null || d === null) { return null; }   /* logique à trois valeurs */
    if (op === '=' || op === '!=') {
      const meme = comparer(g, d) === 0;
      return op === '=' ? meme : !meme;
    }
    const ng = toNumber(g), nd = toNumber(d);
    if (ng === null || nd === null) { return null; }
    switch (op) {
      case '<': return ng < nd;
      case '<=': return ng <= nd;
      case '>': return ng > nd;
      case '>=': return ng >= nd;
      case '+': return ng + nd;
      case '-': return ng - nd;
      case '*': return ng * nd;
      case '/': return nd === 0 ? null : ng / nd;   /* division par zéro : inconnue */
      case '%': return nd === 0 ? null : ng % nd;
    }
    erreur('Opérateur non pris en charge « ' + op + ' ».');
  }

  function appelerFonction(nom, args) {
    const n = String(nom).toUpperCase();
    const premier = args[0];
    switch (n) {
      case 'LENGTH': return (premier === null || premier === undefined) ? null : String(premier).length;
      case 'UPPER': return (premier === null || premier === undefined) ? null : String(premier).toUpperCase();
      case 'LOWER': return (premier === null || premier === undefined) ? null : String(premier).toLowerCase();
      case 'ABS': { const x = toNumber(premier); return x === null ? null : Math.abs(x); }
      case 'ROUND': {
        const x = toNumber(premier);
        if (x === null) { return null; }
        const p = args.length > 1 ? (toNumber(args[1]) || 0) : 0;
        const f = Math.pow(10, p);
        return Math.round(x * f) / f;
      }
      case 'COALESCE':
        for (let i = 0; i < args.length; i++) { if (args[i] !== null && args[i] !== undefined) { return args[i]; } }
        return null;
      case 'IFNULL':
        return (premier === null || premier === undefined) ? (args.length > 1 ? args[1] : null) : premier;
    }
    erreur('Fonction inconnue « ' + nom + ' ». Disponibles : LENGTH, UPPER, LOWER, ABS, ROUND, COALESCE, IFNULL.');
  }

  /* Contexte d'une ligne : les colonnes existent en deux formes, « alias.col »
     toujours, et « col » seule lorsqu'aucune table jointe ne la contient. */
  function contexteDe(alias, ligne, colonnes, doublons) {
    const src = {};
    const plat = {};
    src[alias] = ligne || null;
    for (let i = 0; i < colonnes.length; i++) {
      const c = colonnes[i];
      const v = (ligne && Object.prototype.hasOwnProperty.call(ligne, c)) ? ligne[c] : null;
      plat[alias + '.' + c] = v;
      if (ligne) { plat[c] = doublons && doublons[c] ? AMBIGUE : v; }
    }
    return { src: src, plat: plat };
  }

  function fusionner(a, b) {
    return { src: Object.assign({}, a.src, b.src), plat: Object.assign({}, a.plat, b.plat) };
  }

  function contexteVide() { return { src: {}, plat: {} }; }

  function evaluer(ctx, e) {
    switch (e.t) {
      case 'lit': return e.v;
      case 'etoile': return null;
      case 'ref': {
        const cle = e.table ? e.table + '.' + e.colonne : e.colonne;
        if (!Object.prototype.hasOwnProperty.call(ctx.plat, cle)) {
          const connues = Object.keys(ctx.plat).filter(function (k) { return k.indexOf('.') >= 0; });
          erreur('Colonne inconnue « ' + cle + ' ».' +
                 (connues.length ? ' Colonnes disponibles : ' + connues.join(', ') + '.' : ''), e.debut);
        }
        const v = ctx.plat[cle];
        if (v === AMBIGUE) {
          const alternatives = Object.keys(ctx.plat).filter(function (k) {
            return k.slice(-(e.colonne.length + 1)) === '.' + e.colonne;
          });
          erreur('Colonne ambiguë « ' + e.colonne + ' » : elle existe dans plusieurs tables. ' +
                 'Écrivez « ' + alternatives[0] + ' » (ou une autre table).', e.debut);
        }
        return v;
      }
      case 'una': {
        if (e.op === 'NOT') { return non3(versBooleen(evaluer(ctx, e.e))); }
        const v = evaluer(ctx, e.e);
        if (v === null || v === undefined) { return null; }
        const n = toNumber(v);
        return n === null ? null : -n;
      }
      case 'bin': {
        if (e.op === 'AND') { return et3(versBooleen(evaluer(ctx, e.g)), versBooleen(evaluer(ctx, e.d))); }
        if (e.op === 'OR') { return ou3(versBooleen(evaluer(ctx, e.g)), versBooleen(evaluer(ctx, e.d))); }
        if (e.op === '||') {
          const g = evaluer(ctx, e.g), d = evaluer(ctx, e.d);
          if (g === null || d === null) { return null; }
          return String(g) + String(d);
        }
        return appliquerOperateur(e.op, evaluer(ctx, e.g), evaluer(ctx, e.d));
      }
      case 'estNul': {
        const v = evaluer(ctx, e.e);
        const nul = v === null || v === undefined;
        return e.negation ? !nul : nul;
      }
      case 'in': {
        const v = evaluer(ctx, e.e);
        if (v === null || v === undefined) { return null; }
        let vuNull = false;
        for (let i = 0; i < e.items.length; i++) {
          const x = evaluer(ctx, e.items[i]);
          if (x === null || x === undefined) { vuNull = true; continue; }
          if (comparer(v, x) === 0) { return true; }
        }
        return vuNull ? null : false;
      }
      case 'entre': {
        const v = evaluer(ctx, e.e);
        if (v === null || v === undefined) { return null; }
        const a = evaluer(ctx, e.a), b = evaluer(ctx, e.b);
        if (a === null || b === null) { return null; }
        return comparer(v, a) >= 0 && comparer(v, b) <= 0;
      }
      case 'distinction': return evaluer(ctx, e.e);
      case 'app': {
        if (estAgregat(e)) {
          erreur('L\'agrégat ' + String(e.nom).toUpperCase() +
                 ' n\'est pas autorisé ici : placez-le dans SELECT ou HAVING (avec GROUP BY).', e.debut);
        }
        return appelerFonction(e.nom, e.args.map(function (a) { return evaluer(ctx, a); }));
      }
    }
    erreur('Expression non reconnue.', e.debut);
  }

  /* Évaluation dans un groupe : les agrégats voient toutes les lignes du
     groupe, le reste voit la première ligne (les autres colonnes doivent
     être dans GROUP BY, comme en SQL). On redescend dans TOUS les nœuds et
     pas seulement dans AND/OR : sinon un agrégat placé dans une fonction —
     ROUND(AVG(x), 2) — serait évalué ligne par ligne et refusé à tort. */
  function agreger(nom, e, groupe, premier) {
    if (nom === 'COUNT' && e.args.length === 1 && e.args[0].t === 'etoile') { return groupe.length; }
    if (!e.args.length) { erreur(nom + ' attend au moins un argument.', e.debut); }

    const premierArg = e.args[0];
    const distinction = premierArg.t === 'distinction';
    const cible = distinction ? premierArg.e : premierArg;

    const valeurs = [];
    for (let i = 0; i < groupe.length; i++) {
      /* dansAgregat = true : un agrégat à l'intérieur d'un agrégat est refusé */
      const v = evaluerGroupe(groupe[i], [groupe[i]], cible, true);
      if (v !== null && v !== undefined) { valeurs.push(v); }
    }

    let liste = valeurs;
    if (distinction) {
      const vus = {};
      liste = valeurs.filter(function (v) {
        const k = JSON.stringify(v);
        if (vus[k]) { return false; }
        vus[k] = true;
        return true;
      });
    }

    if (nom === 'COUNT') { return liste.length; }
    if (!liste.length) { return null; }
    if (nom === 'SUM') { return liste.reduce(function (a, b) { return a + (toNumber(b) || 0); }, 0); }
    if (nom === 'AVG') { return liste.reduce(function (a, b) { return a + (toNumber(b) || 0); }, 0) / liste.length; }
    if (nom === 'MIN') { return liste.reduce(function (a, b) { return comparer(b, a) < 0 ? b : a; }); }
    return liste.reduce(function (a, b) { return comparer(b, a) > 0 ? b : a; });  /* MAX */
  }

  function evaluerGroupe(premier, groupe, e, dansAgregat) {
    if (!e) { return null; }

    if (e.t === 'app' && estAgregat(e)) {
      if (dansAgregat) { erreur('Agrégat imbriqué interdit : un agrégat ne peut pas en contenir un autre.', e.debut); }
      return agreger(String(e.nom).toUpperCase(), e, groupe, premier);
    }

    switch (e.t) {
      case 'lit': return e.v;
      case 'etoile': return null;
      case 'ref': return evaluer(premier, e);
      case 'distinction': return evaluerGroupe(premier, groupe, e.e, dansAgregat);
      case 'una': {
        if (e.op === 'NOT') { return non3(versBooleen(evaluerGroupe(premier, groupe, e.e, dansAgregat))); }
        const v = evaluerGroupe(premier, groupe, e.e, dansAgregat);
        if (v === null || v === undefined) { return null; }
        const n = toNumber(v);
        return n === null ? null : -n;
      }
      case 'bin': {
        if (e.op === 'AND' || e.op === 'OR') {
          const g = versBooleen(evaluerGroupe(premier, groupe, e.g, dansAgregat));
          const d = versBooleen(evaluerGroupe(premier, groupe, e.d, dansAgregat));
          return e.op === 'AND' ? et3(g, d) : ou3(g, d);
        }
        if (e.op === '||') {
          const g = evaluerGroupe(premier, groupe, e.g, dansAgregat);
          const d = evaluerGroupe(premier, groupe, e.d, dansAgregat);
          if (g === null || d === null) { return null; }
          return String(g) + String(d);
        }
        return appliquerOperateur(e.op,
          evaluerGroupe(premier, groupe, e.g, dansAgregat),
          evaluerGroupe(premier, groupe, e.d, dansAgregat));
      }
      case 'estNul': {
        const v = evaluerGroupe(premier, groupe, e.e, dansAgregat);
        const nul = v === null || v === undefined;
        return e.negation ? !nul : nul;
      }
      case 'in': {
        const v = evaluerGroupe(premier, groupe, e.e, dansAgregat);
        if (v === null || v === undefined) { return null; }
        let vuNull = false;
        for (let i = 0; i < e.items.length; i++) {
          const x = evaluerGroupe(premier, groupe, e.items[i], dansAgregat);
          if (x === null || x === undefined) { vuNull = true; continue; }
          if (comparer(v, x) === 0) { return true; }
        }
        return vuNull ? null : false;
      }
      case 'entre': {
        const v = evaluerGroupe(premier, groupe, e.e, dansAgregat);
        const a = evaluerGroupe(premier, groupe, e.a, dansAgregat);
        const b = evaluerGroupe(premier, groupe, e.b, dansAgregat);
        if (v === null || v === undefined || a === null || b === null) { return null; }
        return comparer(v, a) >= 0 && comparer(v, b) <= 0;
      }
      case 'app': {
        const args = e.args.map(function (a) { return evaluerGroupe(premier, groupe, a, dansAgregat); });
        return appelerFonction(e.nom, args);
      }
    }
    erreur('Expression non reconnue.', e.debut);
  }

  function colonnesDe(t) { return t.colonnes.map(function (c) { return c.nom; }); }

  function trouverTable(base, nom) {
    const t = base.tables[nom];
    if (!t) {
      const noms = Object.keys(base.tables);
      erreur('Table inexistante « ' + nom + ' ».' + (noms.length ? ' Tables disponibles : ' + noms.join(', ') + '.' : ''));
    }
    return t;
  }

  /* ------------------------ Construction des lignes ------------------------ */

  function combinerSources(sources, trace, compte) {
    const doublons = {};
    const vus = {};
    sources.forEach(function (s) {
      s.colonnes.forEach(function (c) { vus[c] = (vus[c] || 0) + 1; });
    });
    Object.keys(vus).forEach(function (c) { if (vus[c] > 1) { doublons[c] = true; } });

    const prem = sources[0];
    let courant = prem.lignes.map(function (l) {
      compte.lues++;
      return contexteDe(prem.alias, l, prem.colonnes, doublons);
    });
    trace.push({ phase: 'FROM', detail: prem.nom + ' → ' + courant.length + ' ligne(s)' });

    for (let k = 1; k < sources.length; k++) {
      const s = sources[k];
      const suite = [];
      for (let i = 0; i < courant.length; i++) {
        const ctx = courant[i];
        let n = 0;
        for (let r = 0; r < s.lignes.length; r++) {
          compte.lues++;
          const fusion = fusionner(ctx, contexteDe(s.alias, s.lignes[r], s.colonnes, doublons));
          if (versBooleen(evaluer(fusion, s.on)) === true) { suite.push(fusion); n++; }
        }
        if (n === 0 && s.type === 'LEFT') {
          const src = Object.assign({}, ctx.src); src[s.alias] = null;
          const plat = Object.assign({}, ctx.plat);
          for (let c = 0; c < s.colonnes.length; c++) { plat[s.alias + '.' + s.colonnes[c]] = null; }
          suite.push({ src: src, plat: plat });
        }
      }
      courant = suite;
      trace.push({ phase: s.type === 'LEFT' ? 'LEFT JOIN' : 'JOIN', detail: s.nom + ' → ' + courant.length + ' ligne(s)' });
    }
    return { contextes: courant, doublons: doublons };
  }

  /* ------------------------------- SELECT ------------------------------- */

  function executerSelect(arbre, base, trace, compte) {
    let sources = [];
    let contextes = [];

    if (!arbre.depuis) {
      contextes = [contexteVide()];
    } else {
      sources.push((function () {
        const t = trouverTable(base, arbre.depuis.table);
        return { alias: arbre.depuis.alias, nom: arbre.depuis.table, type: 'INNER', on: null, lignes: t.lignes, colonnes: colonnesDe(t) };
      })());
      arbre.joints.forEach(function (j) {
        const t = trouverTable(base, j.table);
        sources.push({ alias: j.alias, nom: j.table, type: j.type, on: j.on, lignes: t.lignes, colonnes: colonnesDe(t) });
      });
      contextes = combinerSources(sources, trace, compte).contextes;
    }

    if (arbre.ou) {
      const avant = contextes.length;
      contextes = contextes.filter(function (c) { return versBooleen(evaluer(c, arbre.ou)) === true; });
      trace.push({ phase: 'WHERE', detail: avant + ' → ' + contextes.length + ' ligne(s)' });
    }

    const agrege = arbre.colonnes.some(function (c) { return contientAgregat(c.expr); }) ||
                   (arbre.avoir !== null && contientAgregat(arbre.avoir));

    let groupes;
    if (arbre.groupe) {
      const paquets = {};
      const ordre = [];
      contextes.forEach(function (c) {
        const cle = JSON.stringify(arbre.groupe.map(function (e) { return evaluer(c, e); }));
        if (!paquets[cle]) { paquets[cle] = []; ordre.push(cle); }
        paquets[cle].push(c);
      });
      groupes = ordre.map(function (k) { return paquets[k]; });
      trace.push({ phase: 'GROUP BY', detail: contextes.length + ' ligne(s) → ' + groupes.length + ' groupe(s)' });
    } else if (agrege) {
      groupes = [contextes];
      trace.push({ phase: 'Agrégats', detail: 'un seul groupe couvrant ' + contextes.length + ' ligne(s)' });
    } else {
      groupes = contextes.map(function (c) { return [c]; });
    }

    if (arbre.avoir) {
      if (!arbre.groupe && !agrege) { erreur('HAVING exige GROUP BY ou un agrégat (COUNT, SUM…) dans SELECT.'); }
      const avant = groupes.length;
      groupes = groupes.filter(function (g) {
        return g.length > 0 && versBooleen(evaluerGroupe(g[0], g, arbre.avoir)) === true;
      });
      trace.push({ phase: 'HAVING', detail: avant + ' → ' + groupes.length + ' groupe(s)' });
    }

    /* En-têtes de sortie : les étoiles sont développées en colonnes réelles */
    const entetes = {};
    const cs = [];
    function ajouterColonne(cle, entete, expr) {
      let e = entete;
      if (entetes[e]) { e = cle || entete + ' (2)'; }
      entetes[e] = true;
      cs.push({ cle: cle, entete: e, expr: expr || null });
    }
    arbre.colonnes.forEach(function (item) {
      const e = item.expr;
      if (e.t === 'etoile') {
        const cibles = e.table
          ? sources.filter(function (s) { return s.alias === e.table || s.nom === e.table; })
          : sources;
        if (e.table && !cibles.length) { erreur('Table inconnue « ' + e.table + ' » dans « ' + e.table + '.* ».'); }
        if (!cibles.length) { erreur('SELECT * exige une clause FROM.'); }
        cibles.forEach(function (s) {
          s.colonnes.forEach(function (c) { ajouterColonne(s.alias + '.' + c, c, null); });
        });
        return;
      }
      if (e.t === 'ref') {
        /* On garde le nœud : c'est evaluer() qui détecte les colonnes
           ambiguës entre deux tables jointes. */
        ajouterColonne(e.table ? e.table + '.' + e.colonne : e.colonne, e.colonne, e);
        return;
      }
      ajouterColonne(null, item.alias || extrait(arbre.texte, e.debut, e.fin), e);
    });

    const paires = [];
    for (let i = 0; i < groupes.length; i++) {
      const g = groupes[i];
      const ctx = g[0] || contexteVide();
      const ligne = {};
      for (let k = 0; k < cs.length; k++) {
        const c = cs[k];
        ligne[c.entete] = c.expr ? evaluerGroupe(ctx, g, c.expr) : ctx.plat[c.cle];
      }
      paires.push({ ligne: ligne, groupe: g });
    }

    let retenues = paires;
    if (arbre.distinct) {
      const vus = {};
      retenues = paires.filter(function (p) {
        const cle = JSON.stringify(cs.map(function (c) { return p.ligne[c.entete]; }));
        if (vus[cle]) { return false; }
        vus[cle] = true;
        return true;
      });
      trace.push({ phase: 'DISTINCT', detail: paires.length + ' → ' + retenues.length + ' ligne(s) distincte(s)' });
    }

    if (arbre.tri.length) {
      const libelles = entetes;
      const tries = retenues.slice().sort(function (a, b) {
        for (let k = 0; k < arbre.tri.length; k++) {
          const tr = arbre.tri[k];
          const c = comparer(valeurDeTri(a, tr.e, libelles), valeurDeTri(b, tr.e, libelles));
          if (c !== 0) { return tr.sens === 'DESC' ? -c : c; }
        }
        return 0;
      });
      retenues = tries;
      trace.push({
        phase: 'ORDER BY',
        detail: 'tri par ' + arbre.tri.map(function (t) {
          return extrait(arbre.texte, t.e.debut, t.e.fin) + ' ' + t.sens.toLowerCase();
        }).join(', ')
      });
    }

    let finales = retenues.map(function (p) { return p.ligne; });
    const total = finales.length;
    if (arbre.decalage) { finales = finales.slice(arbre.decalage); }
    if (arbre.limite !== null) { finales = finales.slice(0, arbre.limite); }
    if (arbre.limite !== null || arbre.decalage) {
      trace.push({ phase: 'LIMIT', detail: total + ' → ' + finales.length + ' ligne(s) gardée(s)' });
    }

    return { entetes: cs.map(function (c) { return c.entete; }), lignes: finales, modifie: false };
  }

  function valeurDeTri(paire, e, libelles) {
    if (e.t === 'ref' && e.table === null && libelles[e.colonne]) { return paire.ligne[e.colonne]; }
    return evaluerGroupe(paire.groupe[0] || contexteVide(), paire.groupe, e);
  }

  /* -------------------- INSERT / UPDATE / DELETE / CREATE -------------------- */

  function executerInsert(arbre, base, trace) {
    const t = trouverTable(base, arbre.table);
    const cibles = arbre.colonnes || colonnesDe(t);
    cibles.forEach(function (c) {
      if (!t.colonnes.some(function (x) { return x.nom === c; })) {
        erreur('Colonne inconnue « ' + c + ' » dans la table « ' + arbre.table + ' ».');
      }
    });
    let n = 0;
    arbre.tuples.forEach(function (tuple) {
      if (tuple.length !== cibles.length) {
        erreur(tuple.length + ' valeur(s) fournie(s) pour ' + cibles.length + ' colonne(s).');
      }
      const ligne = {};
      t.colonnes.forEach(function (col) { ligne[col.nom] = col.aDefaut ? col.defaut : null; });
      tuple.forEach(function (e, i) { ligne[cibles[i]] = evaluer(contexteVide(), e); });

      /* Un PRIMARY KEY de type INTEGER non fourni reçoit max + 1, comme le
         fait SQLite pour une colonne alias rowid. Sans ça, un INSERT qui
         omet la clé se bloquerait sur NOT NULL. */
      t.colonnes.forEach(function (col) {
        if (!col.cle || col.type !== 'INTEGER') { return; }
        const actuel = ligne[col.nom];
        if (actuel !== null && actuel !== undefined) { return; }
        let max = 0;
        t.lignes.forEach(function (r) {
          const v = toNumber(r[col.nom]);
          if (v !== null && v > max) { max = v; }
        });
        ligne[col.nom] = max + 1;
      });

      t.colonnes.forEach(function (col) {
        const v = ligne[col.nom];
        if (col.nonNul && (v === null || v === undefined)) {
          erreur('La colonne « ' + col.nom + ' » n\'accepte pas NULL.');
        }
        if ((col.cle || col.unique) && v !== null && t.lignes.some(function (r) { return r[col.nom] === v; })) {
          erreur((col.cle ? 'Clé primaire' : 'Contrainte UNIQUE') + ' en double : « ' + formaterNombre(v) + ' » existe déjà dans « ' + col.nom + ' ».');
        }
      });

      t.lignes.push(ligne);
      n++;
    });
    trace.push({ phase: 'INSERT', detail: n + ' ligne(s) insérée(s) dans « ' + arbre.table + ' »' });
    return { entetes: [], lignes: [], modifie: true, message: n + ' ligne(s) insérée(s) dans « ' + arbre.table + ' ».' };
  }

  function executerUpdate(arbre, base, trace, compte) {
    const t = trouverTable(base, arbre.table);
    arbre.affectations.forEach(function (a) {
      if (!t.colonnes.some(function (c) { return c.nom === a.colonne; })) {
        erreur('Colonne inconnue « ' + a.colonne + ' » dans la table « ' + arbre.table + ' ».');
      }
    });
    arbre.affectations.forEach(function (a) {
      const col = t.colonnes.filter(function (c) { return c.nom === a.colonne; })[0];
      t.lignes.forEach(function (r) {
        if (arbre.ou) {
          compte.lues++;
          if (versBooleen(evaluer(contexteDe(arbre.table, r, colonnesDe(t), {}), arbre.ou)) !== true) { return; }
        }
        const v = evaluer(contexteDe(arbre.table, r, colonnesDe(t), {}), a.valeur);
        if (col.nonNul && (v === null || v === undefined)) {
          erreur('La colonne « ' + a.colonne + ' » n\'accepte pas NULL.');
        }
        r[a.colonne] = v;
      });
    });
    const touchees = arbre.ou
      ? t.lignes.filter(function (r) {
          return versBooleen(evaluer(contexteDe(arbre.table, r, colonnesDe(t), {}), arbre.ou)) === true;
        }).length
      : t.lignes.length;
    trace.push({ phase: 'UPDATE', detail: touchees + ' ligne(s) modifiée(s) dans « ' + arbre.table + ' »' });
    return { entetes: [], lignes: [], modifie: true, message: touchees + ' ligne(s) modifiée(s) dans « ' + arbre.table + ' ».' };
  }

  function executerDelete(arbre, base, trace, compte) {
    const t = trouverTable(base, arbre.table);
    const avant = t.lignes.length;
    if (arbre.ou) {
      t.lignes = t.lignes.filter(function (r) {
        compte.lues++;
        return versBooleen(evaluer(contexteDe(arbre.table, r, colonnesDe(t), {}), arbre.ou)) !== true;
      });
    } else {
      compte.lues += avant;
      t.lignes = [];
    }
    const n = avant - t.lignes.length;
    trace.push({ phase: 'DELETE', detail: n + ' ligne(s) supprimée(s) de « ' + arbre.table + ' »' });
    return { entetes: [], lignes: [], modifie: true, message: n + ' ligne(s) supprimée(s) de « ' + arbre.table + ' ».' };
  }

  function executerCreate(arbre, base, trace) {
    if (base.tables[arbre.table]) { erreur('La table « ' + arbre.table + ' » existe déjà.'); }
    const vides = {};
    base.tables[arbre.table] = {
      nom: arbre.table,
      colonnes: arbre.colonnes.map(function (c) {
        return {
          nom: c.nom, type: c.type, cle: c.cle, nonNul: c.nonNul, unique: c.unique,
          aDefaut: c.defaut !== undefined,
          defaut: c.defaut !== undefined ? evaluer(contexteVide(), c.defaut) : null
        };
      }),
      lignes: []
    };
    trace.push({ phase: 'CREATE TABLE', detail: 'table « ' + arbre.table + ' » créée (' + arbre.colonnes.length + ' colonne(s))' });
    return { entetes: [], lignes: [], modifie: true,
             message: 'Table « ' + arbre.table + ' » créée avec ' + arbre.colonnes.length + ' colonne(s).' };
  }

  function executerInstruction(arbre, base, trace, compte) {
    switch (arbre.t) {
      case 'select': return executerSelect(arbre, base, trace, compte);
      case 'insert': return executerInsert(arbre, base, trace, compte);
      case 'update': return executerUpdate(arbre, base, trace, compte);
      case 'delete': return executerDelete(arbre, base, trace, compte);
      case 'create': return executerCreate(arbre, base, trace, compte);
    }
    erreur('Instruction non reconnue.');
  }

  /* ======================================================================
     4. Base de démonstration
     Jeu d'exemple écrit pour cette page : des étudiants, des matières et des
     notes, de quoi montrer les jointures et les agrégats sans rien inventer
     sur personne.
     ====================================================================== */

  function col(nom, type, options) {
    const o = options || {};
    return { nom: nom, type: type, cle: !!o.cle, nonNul: !!o.nonNul || !!o.cle,
             unique: !!o.unique, aDefaut: false, defaut: null };
  }

  function baseDemonstration() {
    return {
      tables: {
        etudiants: {
          nom: 'etudiants',
          colonnes: [col('id', 'INTEGER', { cle: true }), col('nom', 'TEXT', { nonNul: true }),
                     col('prenom', 'TEXT', { nonNul: true }), col('ville', 'TEXT'),
                     col('moyenne', 'REAL'), col('promotion', 'TEXT')],
          lignes: [
            { id: 1,  nom: 'Bennani',    prenom: 'Yassine', ville: 'Marrakech',  moyenne: 14.5, promotion: '2026' },
            { id: 2,  nom: 'El Idrissi', prenom: 'Amina',   ville: 'Casablanca', moyenne: 16.2, promotion: '2026' },
            { id: 3,  nom: 'Ouazzani',   prenom: 'Karim',   ville: 'Rabat',      moyenne: 11.8, promotion: '2026' },
            { id: 4,  nom: 'Tazi',       prenom: 'Salma',   ville: 'Marrakech',  moyenne: 17.4, promotion: '2026' },
            { id: 5,  nom: 'Amrani',     prenom: 'Mehdi',   ville: 'Fès',        moyenne: 9.6,  promotion: '2026' },
            { id: 6,  nom: 'Chraibi',    prenom: 'Nadia',   ville: 'Agadir',     moyenne: 13.1, promotion: '2026' },
            { id: 7,  nom: 'Berrada',    prenom: 'Otman',   ville: 'Casablanca', moyenne: 15.8, promotion: '2026' },
            { id: 8,  nom: 'Naciri',     prenom: 'Loubna',  ville: 'Marrakech',  moyenne: 12.3, promotion: '2026' },
            { id: 9,  nom: 'Fassi',      prenom: 'Hamza',   ville: 'Oujda',      moyenne: 8.9,  promotion: '2026' },
            { id: 10, nom: 'Alaoui',     prenom: 'Imane',   ville: 'Rabat',      moyenne: 18.1, promotion: '2026' }
          ]
        },
        matieres: {
          nom: 'matieres',
          colonnes: [col('id', 'INTEGER', { cle: true }), col('nom', 'TEXT', { nonNul: true }),
                     col('coefficient', 'INTEGER')],
          lignes: [
            { id: 1, nom: 'Algorithmique',      coefficient: 4 },
            { id: 2, nom: 'Bases de données',   coefficient: 3 },
            { id: 3, nom: 'Mathématiques',      coefficient: 3 },
            { id: 4, nom: 'Anglais',            coefficient: 1 },
            { id: 5, nom: 'Programmation web',  coefficient: 4 }
          ]
        },
        notes: {
          nom: 'notes',
          colonnes: [col('id', 'INTEGER', { cle: true }), col('etudiant_id', 'INTEGER'),
                     col('matiere_id', 'INTEGER'), col('note', 'REAL')],
          lignes: [
            { id: 1,  etudiant_id: 1,  matiere_id: 1, note: 13.5 },
            { id: 2,  etudiant_id: 1,  matiere_id: 2, note: 15.0 },
            { id: 3,  etudiant_id: 1,  matiere_id: 3, note: 12.0 },
            { id: 4,  etudiant_id: 2,  matiere_id: 1, note: 17.0 },
            { id: 5,  etudiant_id: 2,  matiere_id: 2, note: 16.5 },
            { id: 6,  etudiant_id: 2,  matiere_id: 5, note: 15.5 },
            { id: 7,  etudiant_id: 3,  matiere_id: 1, note: 9.5  },
            { id: 8,  etudiant_id: 3,  matiere_id: 3, note: 14.0 },
            { id: 9,  etudiant_id: 3,  matiere_id: 4, note: 12.0 },
            { id: 10, etudiant_id: 4,  matiere_id: 1, note: 18.5 },
            { id: 11, etudiant_id: 4,  matiere_id: 2, note: 17.0 },
            { id: 12, etudiant_id: 4,  matiere_id: 5, note: 16.5 },
            { id: 13, etudiant_id: 5,  matiere_id: 1, note: 7.5  },
            { id: 14, etudiant_id: 5,  matiere_id: 4, note: 11.5 },
            { id: 15, etudiant_id: 5,  matiere_id: 5, note: 9.5  },
            { id: 16, etudiant_id: 6,  matiere_id: 2, note: 14.0 },
            { id: 17, etudiant_id: 6,  matiere_id: 3, note: 12.5 },
            { id: 18, etudiant_id: 6,  matiere_id: 4, note: 13.0 },
            { id: 19, etudiant_id: 7,  matiere_id: 1, note: 16.0 },
            { id: 20, etudiant_id: 7,  matiere_id: 2, note: 15.5 },
            { id: 21, etudiant_id: 7,  matiere_id: 3, note: 15.0 },
            { id: 22, etudiant_id: 8,  matiere_id: 3, note: 13.5 },
            { id: 23, etudiant_id: 8,  matiere_id: 4, note: 11.0 },
            { id: 24, etudiant_id: 9,  matiere_id: 1, note: 5.5  },
            { id: 25, etudiant_id: 9,  matiere_id: 4, note: 12.5 },
            { id: 26, etudiant_id: 10, matiere_id: 1, note: 19.0 },
            { id: 27, etudiant_id: 10, matiere_id: 2, note: 18.0 },
            { id: 28, etudiant_id: 10, matiere_id: 3, note: 17.5 }
          ]
        }
      }
    };
  }

  const EXEMPLES = [
    'SELECT * FROM etudiants ORDER BY moyenne DESC LIMIT 5;',
    'SELECT ville, COUNT(*) AS effectif, ROUND(AVG(moyenne), 2) AS moyenne\nFROM etudiants\nGROUP BY ville\nORDER BY moyenne DESC;',
    'SELECT e.nom, m.nom AS matiere, n.note\nFROM notes n\nJOIN etudiants e ON n.etudiant_id = e.id\nJOIN matieres m ON n.matiere_id = m.id\nORDER BY n.note DESC\nLIMIT 8;',
    "SELECT * FROM etudiants WHERE ville LIKE 'M%' OR moyenne BETWEEN 15 AND 17;",
    'SELECT matiere_id, COUNT(*) AS nb, MIN(note) AS mini, MAX(note) AS maxi\nFROM notes\nGROUP BY matiere_id\nHAVING COUNT(*) > 4;',
    "UPDATE etudiants SET moyenne = ROUND(moyenne + 0.5, 2) WHERE ville = 'Oujda';"
  ];

  /* ======================================================================
     5. Interface
     ====================================================================== */

  const el = {
    theme: $('#theme'),
    sql: $('#sql'),
    executer: $('#btn-executer'),
    annuler: $('#btn-annuler'),
    effacer: $('#btn-effacer'),
    reset: $('#btn-reset'),
    exemples: $('#exemples'),
    erreur: $('#erreur'),
    erreurTexte: $('#erreur-texte'),
    erreurReperes: $('#erreur-reperes'),
    resultat: $('#resultat'),
    resultatNote: $('#resultat-note'),
    etapes: $('#etapes'),
    jetons: $('#jetons'),
    arbre: $('#arbre'),
    bdTables: $('#bd-tables'),
    bdVue: $('#bd-vue'),
    baseNote: $('#base-note'),
    historique: $('#historique'),
    statut: $('#statut'),
    mLignes: $('#m-lignes'),
    mTemps: $('#m-temps'),
    mLues: $('#m-lues'),
    mNature: $('#m-nature'),
    mNatureNote: $('#m-nature-note')
  };

  let base = null;
  let tableActive = null;
  const annulations = [];

  function annoncer(message) { el.statut.textContent = message; }

  /* ------------------------------- Thème ------------------------------- */
  function appliquerTheme(sombre) {
    document.body.classList.toggle('sombre', sombre);
    el.theme.setAttribute('aria-pressed', String(sombre));
    el.theme.setAttribute('aria-label', sombre ? 'Activer le thème clair' : 'Activer le thème sombre');
  }
  el.theme.addEventListener('click', function () {
    const sombre = !document.body.classList.contains('sombre');
    appliquerTheme(sombre);
    stockage.ecrire(CLE_THEME, sombre ? 'sombre' : 'clair');
  });

  /* ------------------------------ Erreurs ------------------------------ */
  function cacherErreur() {
    el.erreur.hidden = true;
    el.erreurTexte.textContent = '';
    el.erreurReperes.textContent = '';
  }

  function montrerErreur(err, texte) {
    const message = err && err.message ? err.message : String(err);
    el.erreur.hidden = false;
    let complet = 'Erreur : ' + message;

    if (err && typeof err.position === 'number') {
      const avant = texte.slice(0, err.position);
      const numLigne = avant.split('\n').length;
      const debutLigne = avant.lastIndexOf('\n') + 1;
      const finLigne = texte.indexOf('\n', err.position);
      const ligne = texte.slice(debutLigne, finLigne === -1 ? texte.length : finLigne);
      const colonne = err.position - debutLigne + 1;
      complet += ' (ligne ' + numLigne + ', colonne ' + colonne + ')';
      el.erreurReperes.textContent = ligne + '\n' + new Array(colonne + 1).join(' ') + '^';
      el.erreurReperes.hidden = false;
    } else {
      el.erreurReperes.textContent = '';
      el.erreurReperes.hidden = true;
    }

    el.erreurTexte.textContent = complet;
    annoncer(complet);
  }

  /* ------------------------------ Rendu ------------------------------ */

  function rendreVide(cible, texte) {
    cible.textContent = '';
    const p = document.createElement('p');
    p.className = 'vide';
    p.textContent = texte;
    cible.appendChild(p);
  }

  function rendreTableau(entetes, lignes, description) {
    const conteneur = document.createElement('div');
    conteneur.className = 'defilement';

    const table = document.createElement('table');
    table.className = 'tableau';

    const caption = document.createElement('caption');
    caption.className = 'sr-only';
    caption.textContent = description;
    table.appendChild(caption);

    const thead = document.createElement('thead');
    const trEntetes = document.createElement('tr');
    entetes.forEach(function (e) {
      const th = document.createElement('th');
      th.setAttribute('scope', 'col');
      th.textContent = e;
      trEntetes.appendChild(th);
    });
    thead.appendChild(trEntetes);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    lignes.forEach(function (ligne) {
      const tr = document.createElement('tr');
      entetes.forEach(function (e) {
        const td = document.createElement('td');
        const v = ligne[e];
        if (v === null || v === undefined) {
          const s = document.createElement('span');
          s.className = 'nul';
          s.textContent = 'NULL';
          td.appendChild(s);
        } else if (typeof v === 'number') {
          td.className = 'n';
          td.textContent = formaterNombre(v);
        } else {
          td.textContent = String(v);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    conteneur.appendChild(table);
    return conteneur;
  }

  function rendreResultat(res) {
    el.resultat.textContent = '';

    if (!res.entetes.length) {
      const p = document.createElement('p');
      p.className = 'message-ok';
      const pastille = document.createElement('span');
      pastille.className = 'pastille';
      p.appendChild(pastille);
      p.appendChild(document.createTextNode(res.message || 'Instruction exécutée.'));
      el.resultat.appendChild(p);
      return;
    }

    if (!res.lignes.length) {
      const p = document.createElement('p');
      p.className = 'vide';
      p.textContent = 'Aucune ligne ne correspond.';
      el.resultat.appendChild(p);
      const table = rendreTableau(res.entetes, [], 'Résultat de la requête.');
      el.resultat.appendChild(table);
      return;
    }

    const table = rendreTableau(res.entetes, res.lignes, 'Résultat de la requête.');
    el.resultat.appendChild(table);

    const resume = document.createElement('p');
    resume.className = 'resume';
    resume.textContent = res.lignes.length + ' ligne(s) · ' + res.entetes.length + ' colonne(s)';
    el.resultat.appendChild(resume);
  }

  /* ------------------------------ Étapes ------------------------------ */

  function rendreEtapes(trace) {
    el.etapes.textContent = '';
    if (!trace.length) {
      const li = document.createElement('li');
      li.className = 'vide';
      li.textContent = 'Aucune étape.';
      el.etapes.appendChild(li);
      return;
    }
    trace.forEach(function (t) {
      const li = document.createElement('li');
      const phase = document.createElement('span');
      phase.className = 'phase';
      phase.textContent = t.phase;
      li.appendChild(phase);
      li.appendChild(document.createTextNode(' — '));
      const detail = document.createElement('span');
      detail.className = 'detail';
      detail.textContent = t.detail;
      li.appendChild(detail);
      el.etapes.appendChild(li);
    });
  }

  function rendreJetons(jetons) {
    el.jetons.textContent = '';
    let n = 0;
    jetons.forEach(function (j) {
      if (j.type === 'fin') { return; }
      const li = document.createElement('li');
      li.className = j.type === 'mot-cle' ? 'j-cle'
        : j.type === 'ident' ? 'j-nom'
        : j.type === 'nombre' ? 'j-num'
        : j.type === 'chaine' ? 'j-chaine'
        : 'j-op';
      li.textContent = j.texte || String(j.valeur);
      el.jetons.appendChild(li);
      n++;
    });
    if (!n) {
      const li = document.createElement('li');
      li.textContent = 'aucun';
      el.jetons.appendChild(li);
    }
  }

  /* --------------------------- Arbre syntaxique --------------------------- */

  function libelleNoeud(e) {
    switch (e.t) {
      case 'lit': return e.v === null ? 'NULL' : (typeof e.v === 'number' ? String(e.v) : "'" + e.v + "'");
      case 'ref': return e.table ? e.table + '.' + e.colonne : e.colonne;
      case 'etoile': return (e.table ? e.table + '.' : '') + '*';
      case 'bin': return e.op;
      case 'una': return e.op;
      case 'app': return String(e.nom).toUpperCase() + '()';
      case 'estNul': return e.negation ? 'IS NOT NULL' : 'IS NULL';
      case 'in': return 'IN';
      case 'entre': return 'BETWEEN';
      case 'distinction': return 'DISTINCT';
    }
    return e.t;
  }

  function enfantsNoeud(e) {
    switch (e.t) {
      case 'bin': return [e.g, e.d];
      case 'una': case 'estNul': case 'distinction': return [e.e];
      case 'in': return [e.e].concat(e.items);
      case 'entre': return [e.e, e.a, e.b];
      case 'app': return e.args.filter(function (a) { return a.t !== 'etoile'; });
    }
    return [];
  }

  function rendreNoeud(parent, e) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.className = e.t === 'lit' ? 'valeur' : 'noeud';
    span.textContent = libelleNoeud(e);
    li.appendChild(span);
    const enfants = enfantsNoeud(e);
    if (enfants.length) {
      const ul = document.createElement('ul');
      enfants.forEach(function (c) { rendreNoeud(ul, c); });
      li.appendChild(ul);
    }
    parent.appendChild(li);
  }

  function branches(arbre) {
    switch (arbre.t) {
      case 'select': {
        const b = [{ libelle: 'colonnes', liste: arbre.colonnes.map(function (c) { return c.expr; }) }];
        if (arbre.depuis) { b.push({ libelle: 'depuis', texte: arbre.depuis.table + (arbre.depuis.alias !== arbre.depuis.table ? ' AS ' + arbre.depuis.alias : '') }); }
        arbre.joints.forEach(function (j) { b.push({ libelle: j.type + ' JOIN ' + j.table, noeud: j.on }); });
        if (arbre.ou) { b.push({ libelle: 'WHERE', noeud: arbre.ou }); }
        if (arbre.groupe) { b.push({ libelle: 'GROUP BY', liste: arbre.groupe }); }
        if (arbre.avoir) { b.push({ libelle: 'HAVING', noeud: arbre.avoir }); }
        if (arbre.tri.length) { b.push({ libelle: 'ORDER BY', liste: arbre.tri.map(function (t) { return t.e; }) }); }
        if (arbre.limite !== null) { b.push({ libelle: 'LIMIT', texte: String(arbre.limite) + (arbre.decalage ? ' OFFSET ' + arbre.decalage : '') }); }
        if (arbre.distinct) { b.push({ libelle: 'DISTINCT', texte: 'oui' }); }
        return b;
      }
      case 'insert': {
        const b = [{ libelle: 'vers', texte: arbre.table }];
        b.push({ libelle: 'colonnes', texte: (arbre.colonnes || []).join(', ') || '(toutes)' });
        b.push({ libelle: 'valeurs', liste: [].concat.apply([], arbre.tuples) });
        return b;
      }
      case 'update': {
        const b = [{ libelle: 'table', texte: arbre.table }];
        b.push({ libelle: 'SET', liste: arbre.affectations.map(function (a) { return a.valeur; }) });
        if (arbre.ou) { b.push({ libelle: 'WHERE', noeud: arbre.ou }); }
        return b;
      }
      case 'delete': {
        const b = [{ libelle: 'de', texte: arbre.table }];
        if (arbre.ou) { b.push({ libelle: 'WHERE', noeud: arbre.ou }); }
        return b;
      }
      case 'create': {
        const b = [{ libelle: 'table', texte: arbre.table }];
        b.push({ libelle: 'colonnes', texte: arbre.colonnes.map(function (c) { return c.nom + ' ' + c.type; }).join(', ') });
        return b;
      }
    }
    return [];
  }

  function rendreArbre(arbre) {
    el.arbre.textContent = '';
    const ul = document.createElement('ul');
    const racine = document.createElement('li');
    const titre = document.createElement('span');
    titre.className = 'noeud';
    titre.textContent = arbre.t.toUpperCase();
    racine.appendChild(titre);

    const ulEnfants = document.createElement('ul');
    branches(arbre).forEach(function (b) {
      const li = document.createElement('li');
      const lab = document.createElement('span');
      lab.className = 'noeud';
      lab.textContent = b.libelle;
      li.appendChild(lab);

      if (b.texte !== undefined) {
        const val = document.createElement('span');
        val.className = 'valeur';
        val.textContent = ' ' + b.texte;
        li.appendChild(val);
      } else if (b.noeud) {
        const ulN = document.createElement('ul');
        rendreNoeud(ulN, b.noeud);
        li.appendChild(ulN);
      } else if (b.liste && b.liste.length) {
        const ulL = document.createElement('ul');
        b.liste.forEach(function (n) { rendreNoeud(ulL, n); });
        li.appendChild(ulL);
      }
      ulEnfants.appendChild(li);
    });

    racine.appendChild(ulEnfants);
    ul.appendChild(racine);
    el.arbre.appendChild(ul);
  }

  /* --------------------------- Base de données --------------------------- */

  function rendreBase() {
    el.bdTables.textContent = '';
    const noms = Object.keys(base.tables);

    if (!noms.length) {
      rendreVide(el.bdTables, 'Aucune table.');
      rendreVide(el.bdVue, 'La base est vide. Réinitialisez-la pour retrouver les tables de démonstration.');
      el.baseNote.textContent = 'Aucune table en mémoire.';
      return;
    }

    if (!base.tables[tableActive]) { tableActive = noms[0]; }

    noms.forEach(function (n) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'onglet';
      b.setAttribute('aria-pressed', String(n === tableActive));
      b.textContent = n;
      b.addEventListener('click', function () { tableActive = n; rendreBase(); });
      el.bdTables.appendChild(b);
    });

    const t = base.tables[tableActive];
    el.baseNote.textContent = noms.length + ' table(s) · « ' + tableActive + ' » : ' + t.lignes.length + ' ligne(s)';

    el.bdVue.textContent = '';

    const sousTitre = document.createElement('p');
    sousTitre.className = 'sous-titre';
    sousTitre.textContent = 'Structure';
    el.bdVue.appendChild(sousTitre);

    const schema = document.createElement('ul');
    schema.className = 'schema';
    t.colonnes.forEach(function (c) {
      const li = document.createElement('li');
      const nom = document.createElement('span');
      nom.className = 'col-nom';
      nom.textContent = c.nom;
      li.appendChild(nom);

      const type = document.createElement('span');
      type.className = 'col-type';
      type.textContent = c.type;
      li.appendChild(type);

      const contraintes = [];
      if (c.cle) { contraintes.push('PRIMARY KEY'); }
      if (c.nonNul && !c.cle) { contraintes.push('NOT NULL'); }
      if (c.unique) { contraintes.push('UNIQUE'); }
      if (c.aDefaut) { contraintes.push('DEFAULT ' + (c.defaut === null ? 'NULL' : String(c.defaut))); }
      if (contraintes.length) {
        const ct = document.createElement('span');
        ct.className = 'col-contrainte';
        ct.textContent = contraintes.join(' · ');
        li.appendChild(ct);
      }
      schema.appendChild(li);
    });
    el.bdVue.appendChild(schema);

    if (!t.lignes.length) {
      rendreVide(el.bdVue, 'Table vide.');
      return;
    }

    const sousTitre2 = document.createElement('p');
    sousTitre2.className = 'sous-titre';
    sousTitre2.textContent = 'Contenu' + (t.lignes.length > 50 ? ' (50 premières lignes)' : '');
    el.bdVue.appendChild(sousTitre2);

    const entetes = colonnesDe(t);
    el.bdVue.appendChild(rendreTableau(entetes, t.lignes.slice(0, 50),
      'Contenu de la table ' + tableActive + ' : ' + t.lignes.length + ' ligne(s).'));
  }

  /* ----------------------------- Historique ----------------------------- */

  function ajouterHistorique(requete, statut) {
    const h = stockage.lire(CLE_HISTORIQUE, []);
    const liste = Array.isArray(h) ? h : [];
    liste.unshift({ q: requete, s: statut });
    while (liste.length > 12) { liste.pop(); }
    stockage.ecrire(CLE_HISTORIQUE, liste);
    rendreHistorique();
  }

  function rendreHistorique() {
    const h = stockage.lire(CLE_HISTORIQUE, []);
    el.historique.textContent = '';
    if (!Array.isArray(h) || !h.length) {
      const li = document.createElement('li');
      li.className = 'vide';
      li.textContent = "Rien pour l'instant.";
      el.historique.appendChild(li);
      return;
    }
    h.forEach(function (e) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = e.q.replace(/\s+/g, ' ').trim();
      b.title = 'Recharger cette requête dans la console';
      const st = document.createElement('span');
      st.className = 'statut';
      st.textContent = e.s;
      b.appendChild(st);
      b.addEventListener('click', function () {
        el.sql.value = e.q;
        cacherErreur();
        el.sql.focus();
        annoncer('Requête rechargée dans la console.');
      });
      li.appendChild(b);
      el.historique.appendChild(li);
    });
  }

  /* ----------------------------- Exécution ----------------------------- */

  function executer() {
    const texte = el.sql.value;
    cacherErreur();

    if (!texte.trim()) {
      montrerErreur(new ErreurSql('Requête vide : écrivez une instruction SQL.', null), texte);
      rendreEtapes([]);
      return;
    }

    const debut = (window.performance && performance.now) ? performance.now() : Date.now();
    const trace = [];
    const compte = { lues: 0 };

    try {
      const jetons = analyserLexicalement(texte);
      rendreJetons(jetons);
      trace.push({ phase: 'Analyse lexicale', detail: (jetons.length - 1) + ' jeton(s) reconnu(s)' });

      const arbre = analyserRequete(texte, jetons);
      rendreArbre(arbre);
      trace.push({ phase: 'Analyse syntaxique', detail: 'arbre construit, aucune erreur de syntaxe' });

      let res;
      if (arbre.t === 'select') {
        res = executerInstruction(arbre, base, trace, compte);
      } else {
        /* Transaction simplifiée : on n'engage la nouvelle base que si
           l'instruction a entièrement réussi. */
        const precedent = base;
        const copie = JSON.parse(JSON.stringify(base));
        res = executerInstruction(arbre, copie, trace, compte);
        annulations.push(precedent);
        if (annulations.length > 8) { annulations.shift(); }
        base = copie;
        stockage.ecrire(CLE_BASE, base);
        el.annuler.disabled = false;
        if (!base.tables[tableActive]) { tableActive = Object.keys(base.tables)[0] || null; }
        rendreBase();
      }

      const fin = (window.performance && performance.now) ? performance.now() : Date.now();
      const duree = Math.max(0, fin - debut);

      rendreResultat(res);
      rendreEtapes(trace);

      const nature = arbre.t.toUpperCase();
      el.mLignes.textContent = res.lignes.length ? String(res.lignes.length) : (res.modifie ? '—' : '0');
      el.mTemps.textContent = duree < 1 ? duree.toFixed(2) + ' ms' : duree.toFixed(1) + ' ms';
      el.mLues.textContent = compte.lues ? String(compte.lues) : '0';
      el.mNature.textContent = nature;
      el.mNatureNote.textContent = res.modifie ? 'Modification de la base' : 'Lecture seule';

      el.resultatNote.textContent = res.modifie
        ? res.message
        : res.lignes.length + ' ligne(s) en ' + (duree < 1 ? duree.toFixed(2) : duree.toFixed(1)) + ' ms';

      const resume = res.modifie ? res.message : res.lignes.length + ' ligne(s) retournée(s)';
      annoncer('Requête exécutée : ' + resume + '.');
      ajouterHistorique(texte, nature + ' · ' + resume);

    } catch (e) {
      montrerErreur(e, texte);
      rendreEtapes(trace);
      el.resultat.textContent = '';
      const p = document.createElement('p');
      p.className = 'vide';
      p.textContent = 'La requête n’a pas été exécutée.';
      el.resultat.appendChild(p);
      el.resultatNote.textContent = 'Erreur de syntaxe ou d’exécution.';
      el.mLignes.textContent = '—';
      el.mTemps.textContent = '—';
      el.mLues.textContent = '—';
      el.mNature.textContent = '—';
      el.mNatureNote.textContent = 'Exécution interrompue';
      ajouterHistorique(texte, 'Erreur');
    }
  }

  /* ------------------------------ Commandes ------------------------------ */

  function chargerExemples() {
    EXEMPLES.forEach(function (q) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'puce-exemple';
      b.textContent = q.replace(/\s+/g, ' ').trim();
      b.title = 'Charger cette requête dans la console';
      b.addEventListener('click', function () {
        el.sql.value = q;
        cacherErreur();
        executer();
      });
      li.appendChild(b);
      el.exemples.appendChild(li);
    });
  }

  el.executer.addEventListener('click', executer);

  el.sql.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); executer(); }
  });

  el.effacer.addEventListener('click', function () {
    el.sql.value = '';
    cacherErreur();
    el.sql.focus();
    annoncer('Console effacée.');
  });

  el.annuler.addEventListener('click', function () {
    const precedent = annulations.pop();
    if (!precedent) { return; }
    base = precedent;
    stockage.ecrire(CLE_BASE, base);
    el.annuler.disabled = annulations.length === 0;
    if (!base.tables[tableActive]) { tableActive = Object.keys(base.tables)[0] || null; }
    rendreBase();
    annoncer('Dernière modification annulée. Base restaurée.');
    el.resultatNote.textContent = 'Dernière modification annulée.';
  });

  el.reset.addEventListener('click', function () {
    base = baseDemonstration();
    stockage.ecrire(CLE_BASE, base);
    annulations.length = 0;
    el.annuler.disabled = true;
    tableActive = Object.keys(base.tables)[0];
    rendreBase();
    annoncer('Base réinitialisée : trois tables de démonstration restaurées.');
    el.resultatNote.textContent = 'Base réinitialisée.';
  });

  /* Espace : on n'intercepte pas la barre d'espace sur un bouton, sinon le
     libellé ne se lit plus correctement au clavier. */
  document.addEventListener('keydown', function (e) {
    if (e.key === ' ' && e.target && e.target.tagName === 'BUTTON') { e.stopPropagation(); }
  });

  /* ------------------------------ Démarrage ------------------------------ */
  function initialiser() {
    const memorise = stockage.lire(CLE_THEME, null);
    const sombre = memorise === null
      ? !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
      : memorise === 'sombre';
    appliquerTheme(sombre);

    const enregistree = stockage.lire(CLE_BASE, null);
    if (enregistree && typeof enregistree === 'object' && enregistree.tables && Object.keys(enregistree.tables).length) {
      base = enregistree;
    } else {
      base = baseDemonstration();
      stockage.ecrire(CLE_BASE, base);
    }
    tableActive = Object.keys(base.tables)[0] || null;

    $('#annee').textContent = new Date().getFullYear();

    chargerExemples();
    rendreBase();
    rendreHistorique();
    rendreEtapes([]);
  }

  initialiser();
})();

