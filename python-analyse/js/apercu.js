/* =====================================================================
   Aperçu de l'analyse CSV — port JavaScript de analyse.py.
   ---------------------------------------------------------------------
   Le script calcule exactement les mêmes statistiques et produit la même
   mise en forme que le script Python, afin que l'aperçu soit fidèle.
   ===================================================================== */
(function (global) {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const CLE_THEME = 'python-analyse-theme';

  /* ---------------------------------------------------------------- */
  /* Les fichiers d'exemple                                           */
  /* ---------------------------------------------------------------- */

  const ETUDIANTS = [
    'nom,prenom,ville,moyenne,age',
    'El ADNANI,Abderrahmane,Marrakech,15.5,22',
    'Bennani,Youssef,Casablanca,12.3,21',
    'Alaoui,Fatima,Rabat,17.8,23',
    'Chakir,Omar,Marrakech,11.2,20',
    'Idrissi,Sara,Casablanca,16.4,22',
    'Tazi,Karim,Fès,14.0,21',
    'Berrada,Nadia,Marrakech,13.7,23',
    'Amrani,Hassan,Rabat,10.5,20'
  ].join('\n');

  const VENTES = [
    'produit,ville,quantite,prix,ca',
    'Clavier,Marrakech,12,120,1440',
    'Clavier,Casablanca,7,120,840',
    'Souris,Rabat,25,45,1125',
    'Souris,Marrakech,18,45,810',
    'Écran,Fès,4,320,1280',
    'Écran,Casablanca,6,320,1920',
    'Casque,Rabat,9,89,801',
    'Casque,Marrakech,14,89,1246'
  ].join('\n');

  const MODELES = { etudiants: ETUDIANTS, ventes: VENTES };

  /* ---------------------------------------------------------------- */
  /* Lecture du CSV — comme csv.DictReader                            */
  /* ---------------------------------------------------------------- */

  /** Découpe une ligne CSV en tenant compte des guillemets. */
  function decouperLigne(ligne) {
    const champs = [];
    let courant = '';
    let dansGuillemets = false;
    for (let i = 0; i < ligne.length; i++) {
      const c = ligne[i];
      if (dansGuillemets) {
        if (c === '"') {
          if (ligne[i + 1] === '"') { courant += '"'; i++; }
          else dansGuillemets = false;
        } else {
          courant += c;
        }
      } else if (c === '"') {
        dansGuillemets = true;
      } else if (c === ',') {
        champs.push(courant);
        courant = '';
      } else {
        courant += c;
      }
    }
    champs.push(courant);
    return champs;
  }

  function lireCsv(texte) {
    const lignes = texte.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/).filter(function (l) { return l.trim() !== ''; });
    if (!lignes.length) throw new Error('fichier vide ou sans en-tête');
    const entetes = decouperLigne(lignes[0]).map(function (h) { return h.trim(); });
    const lignes_ = lignes.slice(1).map(function (l) {
      const champs = decouperLigne(l);
      const objet = {};
      entetes.forEach(function (h, i) { objet[h] = (champs[i] !== undefined ? champs[i] : '').trim(); });
      return objet;
    });
    return { entetes: entetes, lignes: lignes_ };
  }

  /* ---------------------------------------------------------------- */
  /* Les statistiques — reprise de analyse.py                          */
  /* ---------------------------------------------------------------- */

  function estNombre(valeur) {
    if (valeur === null || valeur === undefined || valeur === '') return false;
    return !Number.isNaN(Number(valeur));
  }

  function mediane(nombres) {
    if (!nombres.length) return 0;
    const tri = nombres.slice().sort(function (a, b) { return a - b; });
    const milieu = Math.floor(tri.length / 2);
    return tri.length % 2 ? tri[milieu] : (tri[milieu - 1] + tri[milieu]) / 2;
  }

  /**
   * Somme de Neumaier : somme compensée, exacte au bit près.
   * statistics.fmean utilise math.fsum, qui se comporte pareil — sans cela,
   * la moyenne affichée peut différer d'un centième de celle du script.
   */
  function sommeExacte(nombres) {
    let somme = 0;
    let compensation = 0;
    for (const n of nombres) {
      const t = somme + n;
      compensation += Math.abs(somme) >= Math.abs(n)
        ? (somme - t) + n
        : (n - t) + somme;
      somme = t;
    }
    return somme + compensation;
  }
  function statsColonne(valeurs) {
    const propres = valeurs.filter(function (v) { return v !== null && v !== undefined && v !== ''; });
    if (!propres.length) return { type: 'vide', nombre: 0 };

    if (propres.every(estNombre)) {
      const nombres = propres.map(Number);
      const moyenne = sommeExacte(nombres) / nombres.length;
      const ecart = nombres.length > 1
        ? Math.sqrt(sommeExacte(nombres.map(function (n) { return (n - moyenne) * (n - moyenne); })) / nombres.length)
        : 0;
      return {
        type: 'numerique',
        nombre: nombres.length,
        min: Math.min.apply(null, nombres),
        max: Math.max.apply(null, nombres),
        moyenne: moyenne,
        mediane: mediane(nombres),
        ecart_type: ecart
      };
    }

    const distincts = Array.from(new Set(propres)).sort();
    return { type: 'texte', nombre: propres.length, distincts: distincts.length, valeurs: distincts.slice(0, 8) };
  }

  function regrouper(lignes, colonneGroupe, colonneValeur) {
    const groupes = new Map();
    for (const ligne of lignes) {
      const cle = ligne[colonneGroupe] || '';
      const valeur = ligne[colonneValeur] || '';
      if (estNombre(valeur)) {
        if (!groupes.has(cle)) groupes.set(cle, []);
        groupes.get(cle).push(Number(valeur));
      }
    }
    const resultat = [];
    for (const cle of Array.from(groupes.keys()).sort()) {
      const valeurs = groupes.get(cle);
      if (valeurs.length) {
        resultat.push({
          cle: cle,
          n: valeurs.length,
          moyenne: valeurs.reduce(function (a, b) { return a + b; }, 0) / valeurs.length
        });
      }
    }
    return resultat;
  }

  /* ---------------------------------------------------------------- */
  /* Mise en forme — identique à celle du script Python                */
  /* ---------------------------------------------------------------- */

  function deux(x) {
    return Number(x).toFixed(2);
  }

  function alignerGauche(texte, largeur) {
    // Aligne comme le format {:20} de Python (remplissage à droite).
    let sortie = texte;
    while (sortie.length < largeur) sortie += ' ';
    return sortie;
  }

  function analyser(entetes, lignes, groupe, colonne) {
    const sortie = [];
    sortie.push('');
    sortie.push(lignes.length + ' ligne(s) lue(s), ' + entetes.length + ' colonne(s).');
    sortie.push('');
    sortie.push('-'.repeat(60));

    for (const entete of entetes) {
      const valeurs = lignes.map(function (l) { return l[entete]; });
      const s = statsColonne(valeurs);
      if (s.type === 'vide') {
        sortie.push(alignerGauche(entete, 20) + '  (vide)');
      } else if (s.type === 'numerique') {
        sortie.push(alignerGauche(entete, 20) + '  numérique   n=' + s.nombre);
        sortie.push(alignerGauche('', 20) + '  min=' + deux(s.min) + '  max=' + deux(s.max) +
          '  moyenne=' + deux(s.moyenne) + '  médiane=' + deux(s.mediane) +
          '  écart-type=' + deux(s.ecart_type));
      } else {
        sortie.push(alignerGauche(entete, 20) + '  texte      n=' + s.nombre + '  distincts=' + s.distincts);
        sortie.push(alignerGauche('', 20) + '  ' + s.valeurs.join(', '));
      }
    }
    sortie.push('-'.repeat(60));

    if (groupe) {
      // Le script choisit automatiquement la première colonne numérique
      // différente de la colonne de regroupement.
      let cible = colonne;
      if (!cible) {
        cible = entetes.find(function (c) {
          if (c === groupe) return false;
          return lignes.every(function (l) {
            const v = l[c];
            return v === '' || v === undefined || v === null || estNombre(v);
          });
        });
      }
      if (!cible) {
        sortie.push('');
        sortie.push('erreur : aucune colonne numérique trouvée pour le regroupement.');
        return sortie.join('\n');
      }
      sortie.push('');
      sortie.push('Moyenne de « ' + cible + ' » par « ' + groupe + ' » :');
      sortie.push('');
      for (const r of regrouper(lignes, groupe, cible)) {
        sortie.push('  ' + alignerGauche(r.cle, 20) + '  n=' + String(r.n).padStart(3) + '  moyenne=' + deux(r.moyenne));
      }
      sortie.push('');
    }
    return sortie.join('\n');
  }

  /* ---------------------------------------------------------------- */
  /* Interface                                                         */
  /* ---------------------------------------------------------------- */

  function optionsColonnes(entetes) {
    const groupe = $('#groupe');
    const colonne = $('#colonne');
    // On mémorise la sélection courante : reconstruire les listes ne
    // doit pas perdre le choix de l'utilisateur.
    const groupeChoisi = groupe.value;
    const colonneChoisie = colonne.value;
    const choixGroupe = ['<option value="">— aucun —</option>'].concat(
      entetes.map(function (e) { return '<option value="' + e + '">' + e + '</option>'; })
    ).join('');
    const choixColonne = ['<option value="">— automatique —</option>'].concat(
      entetes.map(function (e) { return '<option value="' + e + '">' + e + '</option>'; })
    ).join('');
    groupe.innerHTML = choixGroupe;
    colonne.innerHTML = choixColonne;
    if (entetes.indexOf(groupeChoisi) !== -1) groupe.value = groupeChoisi;
    if (entetes.indexOf(colonneChoisie) !== -1) colonne.value = colonneChoisie;
  }

  function charger() {
    const choix = $('#fichier').value;
    $('#zone-coller').hidden = choix !== 'personnalise';
    if (choix === 'personnalise') {
      $('#zone-texte').focus();
      return;
    }
    const texte = MODELES[choix] || ETUDIANTS;
    const donnees = lireCsv(texte);
    optionsColonnes(donnees.entetes);
    $('#terminal').textContent = analyser(donnees.entetes, donnees.lignes, $('#groupe').value, $('#colonne').value);
  }

  function analyserCourant() {
    const choix = $('#fichier').value;
    let texte;
    if (choix === 'personnalise') {
      texte = $('#zone-texte').value;
    } else {
      texte = MODELES[choix] || ETUDIANTS;
    }
    try {
      const donnees = lireCsv(texte);
      optionsColonnes(donnees.entetes);
      $('#terminal').textContent = analyser(donnees.entetes, donnees.lignes, $('#groupe').value, $('#colonne').value);
    } catch (e) {
      $('#terminal').textContent = 'erreur : ' + e.message;
    }
  }

  function brancherUI() {
    $('#fichier').addEventListener('change', charger);
    $('#zone-texte').addEventListener('input', analyserCourant);
    $('#groupe').addEventListener('change', analyserCourant);
    $('#colonne').addEventListener('change', analyserCourant);
    $('#bouton-analyser').addEventListener('click', analyserCourant);
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
      btn.addEventListener('click', function () {
        appliquerTheme(!document.body.classList.contains('sombre'));
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Démarrage                                                         */
  /* ---------------------------------------------------------------- */

  function demarrer() {
    brancherUI();
    initialiserTheme();
    charger();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer);
  } else {
    demarrer();
  }
})(window);
