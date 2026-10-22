/* =========================================================
   Quiz de culture générale — JavaScript vanilla (file://)
   Aucune dépendance, aucun module ES.
   Deux modes de données (dual-mode) :
     • local      : page ouverte en file:// ou servie statiquement
                    → tout reste en localStorage, comme avant ;
     • full-stack : un serveur Node (node:http + node:sqlite)
                    répond sur le même hôte → la banque de questions
                    et le meilleur score vivent dans SQLite.
   La bascule est transparente : shared/api-client.js est chargé
   avant ce script et détecte le serveur au démarrage.
   ========================================================= */
(function () {
  "use strict";

  /* ---------- Stockage sûr (localStorage peut être bloqué) ---------- */
  const stockage = {
    lire(cle, defaut) {
      try {
        const v = localStorage.getItem(cle);
        return v === null ? defaut : JSON.parse(v);
      } catch (e) {
        return defaut;
      }
    },
    ecrire(cle, valeur) {
      try {
        localStorage.setItem(cle, JSON.stringify(valeur));
      } catch (e) {}
    }
  };

  const CLE_THEME = "quiz-theme";
  const CLE_MEILLEUR = "quiz-meilleur";

  /* ---------- Modèle : thèmes & difficulté ---------- */
  // Quatre thèmes de questions. « Tout » n'est pas un thème mais le filtre
  // d'accueil qui réunit l'ensemble de la banque.
  const THEMES = [
    { id: "tout",     lbl: "Tout",               theme: "Tout" },
    { id: "maroc",    lbl: "Maroc",              theme: "Maroc" },
    { id: "geo",      lbl: "Géographie",         theme: "Géographie" },
    { id: "sciences", lbl: "Sciences & nature",  theme: "Sciences & nature" },
    { id: "histoire", lbl: "Histoire & culture", theme: "Histoire & culture" }
  ];

  // La difficulté ne change PAS le nombre de questions : elle fixe le budget de
  // temps par question (chronomètre). Choisir « Difficile » ne retire donc
  // aucune question, ce qui reste honnête et cohérent avec le pool affiché.
  const DIFFICULTES = [
    { id: "facile",    lbl: "Facile",    budget: 30 },
    { id: "normal",    lbl: "Normal",    budget: 20 },
    { id: "difficile", lbl: "Difficile", budget: 12 }
  ];

  // Seuil minimal d'une partie. Un thème qui offre moins de NB_MIN questions est
  // complété par des questions des autres thèmes (voir construirePool) : la
  // partie reste jouable et le contexte annonce le complément.
  const NB_MIN = 4;

  /* ---------- Banque de questions (12) ---------- */
  // Index de la bonne réponse répartis volontairement : 1,2,0,2,1,3,2,0,3,1,0,2
  // En mode full-stack, ce tableau de repli est remplacé par la banque
  // servie par le serveur (GET /api/questions) — voir brancherModeServeur().
  let BANQUE = [
    {
      theme: "Maroc",
      question: "Quelle est la capitale du Maroc ?",
      options: ["Casablanca", "Rabat", "Marrakech", "Fès"],
      bonne: 1,
      explication: "Rabat est la capitale administrative du Royaume depuis 1912."
    },
    {
      theme: "Géographie",
      question: "Quel détroit sépare le Maroc de l'Espagne ?",
      options: ["Le Bosphore", "Le détroit de Malacca", "Le détroit de Gibraltar", "Le pas de Calais"],
      bonne: 2,
      explication: "Le détroit de Gibraltar relie la Méditerranée à l'océan Atlantique."
    },
    {
      theme: "Géographie",
      question: "Quel est le plus long fleuve d'Afrique ?",
      options: ["Le Nil", "Le Congo", "Le Niger", "Le Zambèze"],
      bonne: 0,
      explication: "Le Nil s'étend sur environ 6 650 km, ce qui en fait le plus long fleuve d'Afrique."
    },
    {
      theme: "Histoire & culture",
      question: "Qui a peint « La Nuit étoilée » ?",
      options: ["Claude Monet", "Pablo Picasso", "Vincent van Gogh", "Salvador Dalí"],
      bonne: 2,
      explication: "Vincent van Gogh l'a peinte en 1889, depuis l'asile de Saint-Rémy-de-Provence."
    },
    {
      theme: "Sciences & nature",
      question: "Quel est le symbole chimique de l'or ?",
      options: ["Go", "Au", "Ag", "Or"],
      bonne: 1,
      explication: "« Au » vient du latin aurum, qui signifie « or »."
    },
    {
      theme: "Histoire & culture",
      question: "En quelle année est tombé le mur de Berlin ?",
      options: ["1979", "1985", "1991", "1989"],
      bonne: 3,
      explication: "Le mur de Berlin est tombé le 9 novembre 1989."
    },
    {
      theme: "Sciences & nature",
      question: "Quel organe du corps humain produit l'insuline ?",
      options: ["Le foie", "Le cœur", "Le pancréas", "Les reins"],
      bonne: 2,
      explication: "Ce sont les cellules bêta du pancréas qui sécrètent l'insuline."
    },
    {
      theme: "Maroc",
      question: "Quelle ville marocaine est surnommée « la ville bleue » ?",
      options: ["Chefchaouen", "Essaouira", "Tétouan", "Agadir"],
      bonne: 0,
      explication: "Chefchaouen, dans le Rif, est célèbre pour ses ruelles peintes en bleu."
    },
    {
      theme: "Géographie",
      question: "Quel est le plus grand océan du monde ?",
      options: ["L'océan Atlantique", "L'océan Indien", "L'océan Arctique", "L'océan Pacifique"],
      bonne: 3,
      explication: "L'océan Pacifique couvre environ un tiers de la surface du globe."
    },
    {
      theme: "Histoire & culture",
      question: "Qui a écrit « Les Misérables » ?",
      options: ["Émile Zola", "Victor Hugo", "Honoré de Balzac", "Gustave Flaubert"],
      bonne: 1,
      explication: "Victor Hugo a publié « Les Misérables » en 1862."
    },
    {
      theme: "Sciences & nature",
      question: "Combien de côtés possède un hexagone ?",
      options: ["Six", "Cinq", "Huit", "Sept"],
      bonne: 0,
      explication: "Le préfixe grec « hexa » signifie six."
    },
    {
      theme: "Sciences & nature",
      question: "Quelle planète est la plus proche du Soleil ?",
      options: ["Vénus", "La Terre", "Mercure", "Mars"],
      bonne: 2,
      explication: "Mercure orbite à environ 58 millions de kilomètres du Soleil."
    }
  ];

  const LETTRES = ["A", "B", "C", "D"];

  /* ---------- Sélecteurs ---------- */
  const el = (id) => document.getElementById(id);

  const ecranAccueil = el("ecran-accueil");
  const ecranPartage = el("ecran-partage");
  const ecranPartie = el("ecran-partie");
  const ecranResultat = el("ecran-resultat");

  // Écran de score partagé (lien reçu)
  const partageScore = el("partage-score");
  const partageMessage = el("partage-message");
  const partageContexte = el("partage-contexte");
  const partageTexte = el("partage-texte");
  const partageJouer = el("partage-jouer");

  const choixTheme = el("choix-theme");
  const choixDifficulte = el("choix-difficulte");
  const nbQuestionsAccueil = el("nb-questions-accueil");
  const meilleurAccueil = el("meilleur-accueil");
  const btnCommencer = el("commencer");

  const numQuestion = el("num-question");
  const totalQuestion = el("total-question");
  const contextePartie = el("contexte-partie");
  const chrono = el("chrono");
  const chronoVal = el("chrono-val");
  const annonce = el("annonce");
  const scoreCourant = el("score-courant");
  const progression = el("progression");
  const progressionBarre = el("progression-barre");
  const titreQuestion = el("titre-question");
  const zoneReponses = el("reponses");
  const retour = el("retour");
  const btnSuivant = el("suivant");
  const btnSuivantLbl = el("suivant-lbl");

  const contexteResultat = el("contexte-resultat");
  const scoreFinal = el("score-final");
  const scoreMessage = el("score-message");
  const zoneRecord = el("record");
  const recap = el("recap");
  const btnRevoir = el("revoir");
  const btnRevoirLbl = el("revoir-lbl");
  const btnRecommencer = el("recommencer");
  const btnAccueil = el("accueil");

  const btnTheme = el("theme");
  const annee = el("annee");

  // Partage du score depuis l'écran de résultat
  const btnPartager = el("partager");
  const partageZone = el("partage-zone");
  const lienPartage = el("lien-partage");
  const partageRetour = el("partage-retour");

  /* ---------- État ---------- */
  // Réglages choisis sur l'accueil
  let themeChoisi = "Tout";
  let difficulteChoisie = DIFFICULTES[1]; // Normal (20 s)

  // Partie en cours
  let questions = [];        // questions mélangées (options mélangées)
  let total = 0;             // nombre de questions réellement jouées
  let index = 0;             // question courante
  let score = 0;             // score courant
  let repondu = false;       // la question courante a-t-elle reçu une réponse ?
  let reponsesDonnees = [];  // trace des réponses données (pour le récapitulatif)
  let erronees = [];         // questions ratées de la dernière partie (révision)

  // Partie figée au démarrage (difficulté/chrono stables pendant la manche)
  let themeJoue = "Tout";
  let diffJoue = DIFFICULTES[1];
  let revCourante = false;   // manche de révision ?
  let poolComplete = false;  // pool de thème complété par d'autres thèmes ?

  // Chronomètre
  let chronoId = null;       // identifiant du setInterval en cours
  let tempsRestant = 0;      // secondes restantes pour la question
  let seuilsFaits = {};      // seuils d'annonce déjà prononcés
  let tempsTotal = 0;        // temps cumulé de la manche (secondes)

  /* ---------- Utilitaires ---------- */
  // Mélange de Fisher–Yates (sur une copie, ne modifie pas la source)
  function melanger(tableau) {
    const t = tableau.slice();
    for (let i = t.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = t[i];
      t[i] = t[j];
      t[j] = tmp;
    }
    return t;
  }

  // Mélange des questions ET des options, en suivant la bonne réponse
  // grâce à la valeur d'origine de celle-ci.
  function preparerQuestions(source) {
    return melanger(source).map(function (q) {
      const bonnesTexte = q.options[q.bonne];
      const options = melanger(q.options);
      return {
        question: q.question,
        theme: q.theme,
        options: options,
        bonne: options.indexOf(bonnesTexte),
        explication: q.explication
      };
    });
  }

  // Questions natives d'un thème (« Tout » = banque entière).
  function poolTheme(theme) {
    if (theme === "Tout") return BANQUE.slice();
    return BANQUE.filter(function (q) { return q.theme === theme; });
  }

  // Pool réellement joué. Certains thèmes comptent moins de NB_MIN questions
  // (ex. « Maroc » = 2) : on complète alors avec des questions tirées des
  // autres thèmes afin d'éviter une manche trop courte. Le thème demandé reste
  // prioritaire et le contexte de partie signale le complément
  // (« + tous thèmes ») — rien n'est masqué à l'utilisateur.
  function construirePool(theme) {
    const base = poolTheme(theme);
    if (theme === "Tout" || base.length >= NB_MIN) return base;
    const dejaLa = {};
    base.forEach(function (q) { dejaLa[q.question] = true; });
    const complement = melanger(
      BANQUE.filter(function (q) { return !dejaLa[q.question]; })
    );
    return base.concat(complement.slice(0, NB_MIN - base.length));
  }

  function poolEstComplete(theme) {
    return theme !== "Tout" && poolTheme(theme).length < NB_MIN;
  }

  // Le nombre affiché sur l'accueil est celui du pool réellement joué.
  function majNbQuestions() {
    nbQuestionsAccueil.textContent = String(construirePool(themeChoisi).length);
  }

  function formaterChrono(sec) {
    const s = Math.max(0, sec);
    const m = Math.floor(s / 60);
    return m + ":" + String(s % 60).padStart(2, "0");
  }

  function formaterDuree(sec) {
    const s = Math.max(0, Math.round(sec));
    if (s < 60) return s + " s";
    const r = s % 60;
    return Math.floor(s / 60) + " min " + (r < 10 ? "0" + r : r) + " s";
  }

  /* ---------- Thème (clair / sombre) ---------- */
  function appliquerTheme(sombre) {
    document.body.classList.toggle("sombre", sombre);
    btnTheme.setAttribute("aria-pressed", String(sombre));
    btnTheme.setAttribute(
      "aria-label",
      sombre ? "Activer le thème clair" : "Activer le thème sombre"
    );
    btnTheme.title = sombre ? "Mode clair" : "Mode sombre";
  }

  function initialiserTheme() {
    const enregistre = stockage.lire(CLE_THEME, null);
    if (enregistre === "sombre" || enregistre === "clair") {
      appliquerTheme(enregistre === "sombre");
    } else {
      const prefereSombre =
        window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      appliquerTheme(prefereSombre);
    }
  }

  btnTheme.addEventListener("click", function () {
    const sombre = !document.body.classList.contains("sombre");
    appliquerTheme(sombre);
    stockage.ecrire(CLE_THEME, sombre ? "sombre" : "clair");
  });

  /* ---------- Navigation entre écrans ---------- */
  function afficherEcran(ecran, cibleFocus) {
    [ecranAccueil, ecranPartage, ecranPartie, ecranResultat].forEach(function (e) {
      e.hidden = e !== ecran;
    });
    if (cibleFocus && typeof cibleFocus.focus === "function") {
      cibleFocus.focus();
    }
  }

  /* ---------- Meilleur score ---------- */
  // Format courant : { score, total } (les manches n'ayant pas toutes la même
  // longueur, on mémorise aussi le total pour comparer à juste titre).
  // Un ancien enregistrement numérique est interprété comme un score sur 12.
  function lireMeilleur() {
    const v = stockage.lire(CLE_MEILLEUR, null);
    if (typeof v === "number" && isFinite(v)) return { score: v, total: BANQUE.length };
    if (
      v && typeof v === "object" &&
      typeof v.score === "number" && typeof v.total === "number" && v.total > 0
    ) {
      return { score: v.score, total: v.total };
    }
    return null;
  }

  function majMeilleurAccueil() {
    const m = lireMeilleur();
    meilleurAccueil.textContent = m === null ? "—" : m.score + " / " + m.total;
  }

  /* ---------- Partage du score par l'URL ----------
     Lien produit : index.html?score=9&total=12&theme=Maroc&diff=Normal
     Les paramètres sont strictement validés à la lecture : jamais de NaN,
     jamais de plantage, tout ce qui est hors bornes est ignoré. */
  const P_SCORE = "score";
  const P_TOTAL = "total";
  const P_THEME = "theme";
  const P_DIFF = "diff";

  // Libellés reconnus (on refuse tout autre texte : rien n'est affiché tel quel)
  function themeConnu(lbl) {
    return typeof lbl === "string" && THEMES.some(function (t) {
      return t.theme === lbl;
    });
  }

  function diffConnue(lbl) {
    return typeof lbl === "string" && DIFFICULTES.some(function (d) {
      return d.lbl === lbl;
    });
  }

  // Lecture stricte des paramètres d'URL. Retourne null si rien de valide.
  function lirePartage() {
    let params;
    try {
      params = new URLSearchParams(window.location.search);
    } catch (e) {
      return null;
    }

    const sBrut = params.get(P_SCORE);
    const tBrut = params.get(P_TOTAL);
    if (sBrut === null || tBrut === null) return null;

    // Entiers positifs uniquement (pas de signe, pas de décimale, pas de NaN)
    if (!/^\d+$/.test(sBrut) || !/^\d+$/.test(tBrut)) return null;

    const s = Number(sBrut);
    const t = Number(tBrut);
    if (!Number.isSafeInteger(s) || !Number.isSafeInteger(t)) return null;
    if (t < 1) return null;
    if (s < 0 || s > t) return null;

    const theme = params.get(P_THEME);
    const diff = params.get(P_DIFF);

    return {
      score: s,
      total: t,
      theme: themeConnu(theme) ? theme : null,
      diff: diffConnue(diff) ? diff : null
    };
  }

  // Construit un lien ABSOLU réutilisable (fonctionne aussi depuis file://).
  function construireLien(scoreVal, totalVal, themeLbl, diffLbl) {
    const url = new URL(window.location.href);
    url.hash = "";
    url.search = "";

    const params = new URLSearchParams();
    params.set(P_SCORE, String(scoreVal));
    params.set(P_TOTAL, String(totalVal));
    if (themeLbl) params.set(P_THEME, themeLbl);
    if (diffLbl) params.set(P_DIFF, diffLbl);

    url.search = params.toString();
    return url.href;
  }

  // Retire les paramètres de partage sans recharger la page (file:// toléré).
  function effacerParametres() {
    if (!window.location.search) return;
    try {
      history.replaceState(null, "", window.location.pathname + window.location.hash);
    } catch (e) {
      // Certains navigateurs restreignent l'API History sur file:// :
      // on laisse alors l'URL en l'état, l'application reste utilisable.
    }
  }

  // Affiche l'écran de score partagé reçu par un lien.
  function afficherPartage(p) {
    partageScore.textContent = p.score + " / " + p.total;
    partageMessage.textContent = messageScore(p.score, p.total);

    const lignes = [];
    if (p.theme) lignes.push("Thème : " + p.theme);
    if (p.diff) lignes.push("Difficulté : " + p.diff);
    partageContexte.textContent = lignes.join(" · ");
    partageContexte.hidden = lignes.length === 0;

    partageTexte.textContent =
      "Voici le score obtenu sur ce quiz de culture générale. " +
      "À vous de faire mieux : lancez votre propre partie !";

    afficherEcran(ecranPartage, el("titre-partage"));
  }

  /* ---------- Copie du lien de partage ---------- */
  function retourPartage(msg, ok) {
    partageRetour.textContent = msg;
    partageRetour.className = "partage__retour" + (ok ? " est-ok" : "");
  }

  function reinitialiserPartage() {
    partageZone.hidden = true;
    lienPartage.value = "";
    partageRetour.textContent = "";
    partageRetour.className = "partage__retour";
  }

  // Sélectionne le lien dans l'input (repli manuel garanti).
  function selectionnerLien(lien) {
    partageZone.hidden = false;
    lienPartage.value = lien;
    try {
      lienPartage.focus();
      lienPartage.select();
      lienPartage.setSelectionRange(0, lien.length);
    } catch (e) {
      // sélection indisponible : le lien reste lisible et copiable à la main
    }
  }

  // Repli historique : execCommand('copy') sur l'input sélectionné.
  function copierViaInput(lien) {
    try {
      lienPartage.focus();
      lienPartage.select();
      lienPartage.setSelectionRange(0, lien.length);
      return document.execCommand("copy");
    } catch (e) {
      return false;
    }
  }

  function copierLien(lien) {
    const ok = function () { retourPartage("Lien copié !", true); };
    const ko = function () { retourPartage("Copie impossible — sélectionnez le lien", false); };
    const repli = function () { if (copierViaInput(lien)) ok(); else ko(); };

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        navigator.clipboard.writeText(lien).then(ok, repli);
      } catch (e) {
        // API présente mais refusée de façon synchrone (contexte non sécurisé)
        repli();
      }
    } else {
      repli();
    }
  }

  function partagerScore() {
    const lien = construireLien(score, total, themeJoue, diffJoue.lbl);
    selectionnerLien(lien);
    copierLien(lien);
  }

  /* ---------- Chronomètre ---------- */
  function stopperChrono() {
    if (chronoId !== null) {
      clearInterval(chronoId);
      chronoId = null;
    }
  }

  function tempsUtilise() {
    return Math.max(0, diffJoue.budget - Math.max(0, tempsRestant));
  }

  function majChrono() {
    const s = Math.max(0, tempsRestant);
    chronoVal.textContent = formaterChrono(s);
    chrono.classList.toggle("est-urgent", s > 0 && s <= 5);
    chrono.setAttribute(
      "aria-label",
      "Temps restant : " + s + (s > 1 ? " secondes" : " seconde")
    );
  }

  function annoncer(txt) {
    annonce.textContent = txt;
  }

  // Annonces discrètes : uniquement à 10 s puis 5 s (jamais chaque seconde).
  // Le numéro de question rend le message unique, ce qui garantit sa lecture
  // par les lecteurs d'écran d'une question à l'autre.
  function annoncerSeuils() {
    [10, 5].forEach(function (seuil) {
      if (tempsRestant === seuil && !seuilsFaits[seuil]) {
        seuilsFaits[seuil] = true;
        annoncer("Question " + (index + 1) + " : il reste " + seuil + " secondes.");
      }
    });
  }

  function lancerChrono() {
    stopperChrono();
    tempsRestant = diffJoue.budget;
    seuilsFaits = {};
    majChrono();
    chronoId = setInterval(function () {
      tempsRestant -= 1;
      majChrono();
      annoncerSeuils();
      if (tempsRestant <= 0) {
        stopperChrono();
        tempsEcoule();
      }
    }, 1000);
  }

  /* ---------- Déroulement de la partie ---------- */
  // source       : tableau de questions (banque ou questions déjà préparées)
  // estRevision  : manche de révision ?
  // dejaPrepare  : les options de la source sont déjà mélangées
  function lancer(source, estRevision, dejaPrepare) {
    stopperChrono();

    revCourante = !!estRevision;
    themeJoue = themeChoisi;
    diffJoue = difficulteChoisie;
    poolComplete = !revCourante && poolEstComplete(themeChoisi);

    questions = dejaPrepare ? melanger(source) : preparerQuestions(source);
    total = questions.length;
    index = 0;
    score = 0;
    repondu = false;
    reponsesDonnees = [];
    tempsTotal = 0;
    erronees = [];

    totalQuestion.textContent = String(total);
    progression.setAttribute("aria-valuemax", String(total));
    progresser(0);
    scoreCourant.textContent = "0";
    contextePartie.textContent = libelleContextePartie();

    afficherEcran(ecranPartie, null);
    rendreQuestion();
  }

  function demarrer() {
    // Une partie « normale » ne doit pas conserver le lien de partage en URL.
    effacerParametres();
    reinitialiserPartage();
    lancer(construirePool(themeChoisi), false, false);
  }

  function demarrerRevision() {
    if (erronees.length > 0) lancer(erronees, true, true);
  }

  function libelleContextePartie() {
    let t = "Thème : " + themeJoue;
    if (poolComplete) t += " (+ tous thèmes)";
    if (revCourante) t = "Révision · " + t;
    return t + " · Difficulté : " + diffJoue.lbl;
  }

  function progresser(val) {
    const pourcent = total > 0 ? (val / total) * 100 : 0;
    progressionBarre.style.setProperty("--p", pourcent + "%");
    progression.setAttribute("aria-valuenow", String(val));
    progression.setAttribute(
      "aria-valuetext",
      val >= total ? "Quiz terminé" : "Question " + (val + 1) + " sur " + total
    );
  }

  function rendreQuestion() {
    const q = questions[index];
    repondu = false;
    annonce.textContent = "";

    // En-tête
    numQuestion.textContent = String(index + 1);
    scoreCourant.textContent = String(score);
    progresser(index);

    // Énoncé
    titreQuestion.textContent = q.question;

    // Réponses
    zoneReponses.textContent = "";
    q.options.forEach(function (texte, i) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "reponse";
      b.dataset.index = String(i);
      b.setAttribute("aria-pressed", "false");

      const cle = document.createElement("span");
      cle.className = "reponse__cle";
      cle.textContent = LETTRES[i];

      const txt = document.createElement("span");
      txt.className = "reponse__txt";
      txt.textContent = texte;

      b.appendChild(cle);
      b.appendChild(txt);
      b.addEventListener("click", function () {
        repondre(i, b);
      });
      zoneReponses.appendChild(b);
    });

    // Pied de carte remis à zéro
    retour.textContent = "";
    retour.classList.remove("est-faux");
    btnSuivant.hidden = true;
    btnSuivantLbl.textContent = index === total - 1 ? "Voir le résultat" : "Question suivante";

    // Focus sur le titre de la question (changement d'état accessible)
    titreQuestion.focus();

    // Le chronomètre démarre (et redémarre) pour chaque question
    lancerChrono();
  }

  // Fige les boutons et révèle la bonne réponse
  function revelerBonne(q) {
    const boutons = zoneReponses.querySelectorAll(".reponse");
    boutons.forEach(function (b) {
      b.disabled = true;
      if (Number(b.dataset.index) === q.bonne) {
        b.classList.add("est-bonne");
        b.setAttribute("aria-pressed", "true");
      }
    });
  }

  function apresReponse() {
    btnSuivant.hidden = false;
    btnSuivant.focus();
  }

  function repondre(choix, btnClique) {
    if (repondu) return; // évite tout double comptage
    repondu = true;
    stopperChrono();
    tempsTotal += tempsUtilise();
    chrono.classList.remove("est-urgent");
    reponsesDonnees[index] = choix;

    const q = questions[index];
    const juste = choix === q.bonne;

    revelerBonne(q);

    if (juste) {
      score += 1;
      scoreCourant.textContent = String(score);
      retour.textContent = "Correct. " + q.explication;
    } else {
      btnClique.classList.add("est-mauvaise");
      btnClique.setAttribute("aria-pressed", "true");
      retour.classList.add("est-faux");
      retour.textContent =
        "Incorrect. La bonne réponse était « " + q.options[q.bonne] + " ». " + q.explication;
    }

    apresReponse();
  }

  // Temps écoulé : question comptée comme sans réponse, bonne réponse révélée.
  // On ne passe PAS automatiquement à la suite : l'utilisateur garde la main.
  function tempsEcoule() {
    if (repondu) return;
    repondu = true;
    stopperChrono();
    tempsTotal += tempsUtilise();
    chrono.classList.remove("est-urgent");

    const q = questions[index];
    revelerBonne(q);

    retour.classList.add("est-faux");
    retour.textContent =
      "Temps écoulé. La bonne réponse était « " + q.options[q.bonne] + " ». " + q.explication;
    annoncer("Temps écoulé pour la question " + (index + 1) + ".");

    apresReponse();
  }

  function suivant() {
    if (!repondu) return;
    stopperChrono();
    if (index < total - 1) {
      index += 1;
      rendreQuestion();
    } else {
      terminer();
    }
  }

  /* ---------- Résultat ---------- */
  function messageScore(s, n) {
    const r = n > 0 ? s / n : 0;
    if (r >= 0.85) return "Excellent !";
    if (r >= 0.6) return "Bien joué";
    if (r >= 0.35) return "Pas mal";
    return "À revoir";
  }

  function terminer() {
    stopperChrono();

    // Le bloc de partage repart à zéro pour chaque nouveau résultat
    reinitialiserPartage();

    // Barre de progression pleine
    progresser(total);

    // Score et message
    scoreFinal.textContent = score + " / " + total;
    scoreMessage.textContent = messageScore(score, total);

    // Contexte du résultat : thème, difficulté, temps total
    contexteResultat.textContent =
      (revCourante ? "Révision · " : "") +
      "Thème : " + themeJoue +
      " · Difficulté : " + diffJoue.lbl +
      " · Temps total : " + formaterDuree(tempsTotal);

    // Meilleur score : mémorisé uniquement hors révision (une manche de
    // révision porte sur un sous-ensemble déjà raté, elle n'est pas comparable).
    let nouveau = false;
    if (!revCourante) {
      const ancien = lireMeilleur();
      if (ancien === null || score * ancien.total > ancien.score * total) {
        stockage.ecrire(CLE_MEILLEUR, { score: score, total: total });
        nouveau = true;
      }
    }
    zoneRecord.hidden = !nouveau;
    zoneRecord.innerHTML = nouveau ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Nouveau record !' : '';

    // Récapitulatif question par question
    recap.textContent = "";
    questions.forEach(function (q, i) {
      const donnee = reponsesDonnees[i];
      const juste = donnee === q.bonne;

      const li = document.createElement("li");
      li.className = "recap__item " + (juste ? "est-juste" : "est-faux");

      const tete = document.createElement("div");
      tete.className = "recap__tete";

      const num = document.createElement("span");
      num.className = "recap__num";
      num.textContent = String(i + 1).padStart(2, "0");

      const qTxt = document.createElement("p");
      qTxt.className = "recap__q";
      qTxt.textContent = q.question;

      const badge = document.createElement("span");
      badge.className = "recap__badge " + (juste ? "est-juste" : "est-faux");
      badge.textContent = juste ? "Juste" : "Faux";

      tete.appendChild(num);
      tete.appendChild(qTxt);
      tete.appendChild(badge);

      const lignes = document.createElement("div");
      lignes.className = "recap__lignes";

      const l1 = document.createElement("p");
      l1.className = "recap__ligne";
      const b1 = document.createElement("b");
      b1.textContent = "Votre réponse : ";
      l1.appendChild(b1);
      l1.appendChild(
        document.createTextNode(typeof donnee === "number" ? q.options[donnee] : "Aucune réponse")
      );

      const l2 = document.createElement("p");
      l2.className = "recap__ligne";
      const b2 = document.createElement("b");
      b2.textContent = "Bonne réponse : ";
      l2.appendChild(b2);
      l2.appendChild(document.createTextNode(q.options[q.bonne]));

      lignes.appendChild(l1);
      lignes.appendChild(l2);
      li.appendChild(tete);
      li.appendChild(lignes);
      recap.appendChild(li);
    });

    // Révision : proposée seulement s'il y a eu au moins une erreur
    erronees = questions.filter(function (q, i) {
      return reponsesDonnees[i] !== q.bonne;
    });
    if (erronees.length > 0) {
      btnRevoirLbl.textContent = "Revoir mes erreurs (" + erronees.length + ")";
      btnRevoir.hidden = false;
    } else {
      btnRevoir.hidden = true;
    }

    afficherEcran(ecranResultat, el("titre-resultat"));
  }

  /* ---------- Choix de l'accueil (vrais groupes de radios) ---------- */
  function construireChoix(conteneur, groupe, entrees, selectionId, surChoix, note) {
    conteneur.textContent = "";
    entrees.forEach(function (entree) {
      const id = groupe + "-" + entree.id;

      const input = document.createElement("input");
      input.type = "radio";
      input.name = groupe;
      input.id = id;
      input.value = entree.id;
      input.className = "choix__radio";
      input.checked = entree.id === selectionId;

      const label = document.createElement("label");
      label.className = "choix__opt";
      label.setAttribute("for", id);
      label.appendChild(document.createTextNode(entree.lbl));

      const texteNote = note ? note(entree) : "";
      if (texteNote) {
        const span = document.createElement("span");
        span.className = "choix__note";
        span.textContent = texteNote;
        label.appendChild(span);
        label.title = entree.lbl + " — " + texteNote;
      }

      input.addEventListener("change", function () {
        if (input.checked) surChoix(entree);
      });

      conteneur.appendChild(input);
      conteneur.appendChild(label);
    });
  }

  function choisirTheme(entree) {
    themeChoisi = entree.theme;
    majNbQuestions();
  }

  function choisirDifficulte(entree) {
    difficulteChoisie = entree;
    // La difficulté ne modifie pas la taille du pool : l'affichage reste juste.
    majNbQuestions();
  }

  function initialiserChoix() {
    construireChoix(
      choixTheme, "reglage-theme", THEMES, "tout", choisirTheme, null
    );
    construireChoix(
      choixDifficulte, "reglage-difficulte", DIFFICULTES, "normal", choisirDifficulte,
      function (d) { return d.budget + " s"; }
    );
  }

  /* ---------- Câblage des boutons ---------- */
  btnCommencer.addEventListener("click", demarrer);
  btnRecommencer.addEventListener("click", demarrer);
  btnSuivant.addEventListener("click", suivant);
  btnRevoir.addEventListener("click", demarrerRevision);
  btnPartager.addEventListener("click", partagerScore);

  // Depuis un score partagé : on nettoie l'URL puis on revient à l'accueil.
  partageJouer.addEventListener("click", function () {
    effacerParametres();
    majMeilleurAccueil();
    afficherEcran(ecranAccueil, el("titre-accueil"));
  });

  btnAccueil.addEventListener("click", function () {
    stopperChrono();
    majMeilleurAccueil();
    afficherEcran(ecranAccueil, el("titre-accueil"));
  });

  /* ---------- Mode full-stack (dual-mode) ----------
     Quand un serveur Node (node:http + node:sqlite) répond à la sonde,
     la banque de questions est lue dans SQLite et chaque nouveau record
     est envoyé au serveur en écriture-transit. La partie reste jouée en
     mémoire côté client : sans serveur (file:// ou hébergement
     statique), tout fonctionne exactement comme avant en localStorage.
     --------------------------------------------------------- */

  // Clés localStorage confiées au serveur (le thème reste local).
  const SERVEUR = {};
  SERVEUR[CLE_MEILLEUR] = 'api/records';

  // Copie de la fonction d'origine : elle continuera d'écrire le cache
  // local même après installation de l'adaptateur.
  const ecrireLocal = stockage.ecrire;

  // Une question serveur n'est acceptée que si elle respecte le modèle
  // du front (4 propositions, index de bonne réponse, explication).
  function questionValide(q) {
    return q && typeof q === 'object'
      && typeof q.theme === 'string' && q.theme !== ''
      && typeof q.question === 'string' && q.question !== ''
      && Array.isArray(q.options) && q.options.length === 4
      && q.options.every(function (o) { return typeof o === 'string' && o !== ''; })
      && Number.isInteger(q.bonne) && q.bonne >= 0 && q.bonne <= 3
      && typeof q.explication === 'string';
  }

  // Appel REST tolérant : une panne réseau ne doit jamais faire échouer
  // le démarrage ni polluer la console (on renvoie un statut « 0 »).
  function appelerSansCrash(methode, chemin, corps) {
    return window.LumeAPI.appeler(methode, chemin, corps)
      .catch(function () { return { statut: 0, corps: null }; });
  }

  async function brancherModeServeur() {
    // 1) La banque de questions vient de la base (source de vérité).
    const rq = await appelerSansCrash('GET', 'api/questions');
    if (rq.statut === 200 && rq.corps && Array.isArray(rq.corps.donnees)) {
      const valides = rq.corps.donnees.filter(questionValide);
      if (valides.length) BANQUE = valides;
    }

    // 2) Meilleur score courant : peuplé AVANT l'adaptateur, pour ne pas
    //    rejouer un POST inutile au chargement.
    const rr = await appelerSansCrash('GET', 'api/records');
    if (rr.statut === 200 && rr.corps) {
      const m = rr.corps.meilleur;
      ecrireLocal(CLE_MEILLEUR, m ? { score: m.score, total: m.total } : null);
    }

    // 3) Écriture-transit : chaque record mémorisé part au serveur
    //    (feu-oublie — la UI reste juste même si l'envoi échoue).
    stockage.ecrire = function (cle, valeur) {
      ecrireLocal(cle, valeur);
      if (SERVEUR[cle]) {
        const corps = (cle === CLE_MEILLEUR && valeur && typeof valeur === 'object')
          ? { score: valeur.score, total: valeur.total, theme: themeJoue }
          : valeur;
        window.LumeAPI.appeler('POST', SERVEUR[cle], corps)
          .catch(function () { /* la UI reste correcte même si le POST échoue */ });
      }
    };
  }

  /* ---------- Initialisation ---------- */
  async function init() {
    // Détection du moteur : serveur Node → mode full-stack (SQLite),
    // sinon on reste en localStorage (file:// ou serveur statique).
    try { await window.LumeAPI.detecter(); } catch (e) { /* mode local */ }
    if (window.LumeAPI.actif) await brancherModeServeur();

    annee.textContent = String(new Date().getFullYear());
    initialiserTheme();
    initialiserChoix();
    majNbQuestions();
    majMeilleurAccueil();

    // Un lien de partage valide ouvre directement l'écran du score reçu.
    const partageInitial = lirePartage();
    if (partageInitial !== null) afficherPartage(partageInitial);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
