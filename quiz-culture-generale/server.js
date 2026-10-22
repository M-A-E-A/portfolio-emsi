'use strict';

/* =========================================================
   Quiz de culture générale — serveur full-stack
   Node.js natif (node:http) + base SQLite (node:sqlite).
   Aucune dépendance npm : `node server.js` suffit.
   Lancement : node server.js   puis   http://localhost:3106
   Variables d'environnement : PORT (port d'écoute),
                               BASE (chemin de la base SQLite).
   ========================================================= */

const path = require('node:path');
const { creerServeur } = require('../serveur/commun.js');

const PORT = parseInt(process.env.PORT || '3106', 10);
const BASE = process.env.BASE || path.join(__dirname, '..', 'donnees-quiz', 'bdd.sqlite');

/* ---------- Banque de démonstration (identique au frontend) ---------- */

const BANQUE = [
  {
    theme: 'Maroc',
    question: 'Quelle est la capitale du Maroc ?',
    options: ['Casablanca', 'Rabat', 'Marrakech', 'Fès'],
    bonne: 1,
    explication: 'Rabat est la capitale administrative du Royaume depuis 1912.'
  },
  {
    theme: 'Géographie',
    question: 'Quel détroit sépare le Maroc de l\'Espagne ?',
    options: ['Le Bosphore', 'Le détroit de Malacca', 'Le détroit de Gibraltar', 'Le pas de Calais'],
    bonne: 2,
    explication: 'Le détroit de Gibraltar relie la Méditerranée à l\'océan Atlantique.'
  },
  {
    theme: 'Géographie',
    question: 'Quel est le plus long fleuve d\'Afrique ?',
    options: ['Le Nil', 'Le Congo', 'Le Niger', 'Le Zambèze'],
    bonne: 0,
    explication: 'Le Nil s\'étend sur environ 6 650 km, ce qui en fait le plus long fleuve d\'Afrique.'
  },
  {
    theme: 'Histoire & culture',
    question: 'Qui a peint « La Nuit étoilée » ?',
    options: ['Claude Monet', 'Pablo Picasso', 'Vincent van Gogh', 'Salvador Dalí'],
    bonne: 2,
    explication: 'Vincent van Gogh l\'a peinte en 1889, depuis l\'asile de Saint-Rémy-de-Provence.'
  },
  {
    theme: 'Sciences & nature',
    question: 'Quel est le symbole chimique de l\'or ?',
    options: ['Go', 'Au', 'Ag', 'Or'],
    bonne: 1,
    explication: '« Au » vient du latin aurum, qui signifie « or ».'
  },
  {
    theme: 'Histoire & culture',
    question: 'En quelle année est tombé le mur de Berlin ?',
    options: ['1979', '1985', '1991', '1989'],
    bonne: 3,
    explication: 'Le mur de Berlin est tombé le 9 novembre 1989.'
  },
  {
    theme: 'Sciences & nature',
    question: 'Quel organe du corps humain produit l\'insuline ?',
    options: ['Le foie', 'Le cœur', 'Le pancréas', 'Les reins'],
    bonne: 2,
    explication: 'Ce sont les cellules bêta du pancréas qui sécrètent l\'insuline.'
  },
  {
    theme: 'Maroc',
    question: 'Quelle ville marocaine est surnommée « la ville bleue » ?',
    options: ['Chefchaouen', 'Essaouira', 'Tétouan', 'Agadir'],
    bonne: 0,
    explication: 'Chefchaouen, dans le Rif, est célèbre pour ses ruelles peintes en bleu.'
  },
  {
    theme: 'Géographie',
    question: 'Quel est le plus grand océan du monde ?',
    options: ['L\'océan Atlantique', 'L\'océan Indien', 'L\'océan Arctique', 'L\'océan Pacifique'],
    bonne: 3,
    explication: 'L\'océan Pacifique couvre environ un tiers de la surface du globe.'
  },
  {
    theme: 'Histoire & culture',
    question: 'Qui a écrit « Les Misérables » ?',
    options: ['Émile Zola', 'Victor Hugo', 'Honoré de Balzac', 'Gustave Flaubert'],
    bonne: 1,
    explication: 'Victor Hugo a publié « Les Misérables » en 1862.'
  },
  {
    theme: 'Sciences & nature',
    question: 'Combien de côtés possède un hexagone ?',
    options: ['Six', 'Cinq', 'Huit', 'Sept'],
    bonne: 0,
    explication: 'Le préfixe grec « hexa » signifie six.'
  },
  {
    theme: 'Sciences & nature',
    question: 'Quelle planète est la plus proche du Soleil ?',
    options: ['Vénus', 'La Terre', 'Mercure', 'Mars'],
    bonne: 2,
    explication: 'Mercure orbite à environ 58 millions de kilomètres du Soleil.'
  }
];

/* ---------- Schéma de la base ----------
   questions : la banque permanente (12 questions au premier lancement).
     « options » est stockée en JSON (tableau de 4 propositions) et
     « bonne » est l'index de la bonne réponse (0..3).
   records   : chaque partie terminée ; le meilleur score est calculé
     par le même ratio score/total que le frontend. */

function preparerBase(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      theme       TEXT    NOT NULL,
      question    TEXT    NOT NULL,
      options     TEXT    NOT NULL,
      bonne       INTEGER NOT NULL CHECK (bonne BETWEEN 0 AND 3),
      explication TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_questions_theme ON questions(theme);
    CREATE TABLE IF NOT EXISTS records (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      score  INTEGER NOT NULL CHECK (score >= 0),
      total  INTEGER NOT NULL CHECK (total >= 1),
      theme  TEXT    NOT NULL DEFAULT '',
      date   TEXT    NOT NULL
    );
  `);
}

/* Insère les 12 questions de démonstration (premier lancement uniquement). */
function semer(db) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM questions').get().n;
  if (n > 0) return;
  const ins = db.prepare(
    'INSERT INTO questions (theme, question, options, bonne, explication) VALUES (?, ?, ?, ?, ?)');
  db.prepare('BEGIN').run();
  try {
    BANQUE.forEach(function (q) {
      ins.run(q.theme, q.question, JSON.stringify(q.options), q.bonne, q.explication);
    });
    db.prepare('COMMIT').run();
    console.log('  • 12 questions de démonstration insérées.');
  } catch (e) {
    db.prepare('ROLLBACK').run();
    throw e;
  }
}

/* Public : décompacte le JSON des options avant d'envoyer la réponse. */
function publique(q) {
  let options = [];
  try { options = JSON.parse(q.options); } catch (e) { options = []; }
  return { id: q.id, theme: q.theme, question: q.question, options: options, bonne: q.bonne, explication: q.explication };
}

/* ---------- Routes ---------- */

const routes = [
  /* Sonde de détection du mode full-stack (utilisée par shared/api-client.js). */
  {
    methode: 'GET', motif: '/api/sante',
    traiter: function () {
      return { statut: 200, corps: { serveur: true, nom: 'Quiz culture générale (Node + SQLite)', version: '1.0.0' } };
    }
  },

  /* GET /api/questions — la banque entière, servie à chaque partie. */
  {
    methode: 'GET', motif: '/api/questions',
    traiter: function (ctx) {
      const lignes = ctx.db.prepare('SELECT * FROM questions ORDER BY id ASC').all();
      return {
        statut: 200,
        corps: { donnees: lignes.map(publique), meta: { total: lignes.length } }
      };
    }
  },

  /* GET /api/records — le meilleur score (ratio score/total, comme le front). */
  {
    methode: 'GET', motif: '/api/records',
    traiter: function (ctx) {
      const parties = ctx.db.prepare('SELECT COUNT(*) AS n FROM records').get().n;
      const ligne = ctx.db.prepare(
        'SELECT id, score, total, theme, date FROM records ' +
        'ORDER BY (CAST(score AS REAL) / total) DESC, id ASC LIMIT 1').get();
      return { statut: 200, corps: { meilleur: ligne || null, meta: { parties: parties } } };
    }
  },

  /* POST /api/records — enregistre une partie (écriture-transit du front). */
  {
    methode: 'POST', motif: '/api/records',
    traiter: function (ctx) {
      const d = ctx.corps && typeof ctx.corps === 'object' ? ctx.corps : {};
      const details = {};
      if (!Number.isInteger(d.score) || d.score < 0) {
        details.score = 'Le score doit être un entier supérieur ou égal à 0.';
      }
      if (!Number.isInteger(d.total) || d.total < 1) {
        details.total = 'Le total doit être un entier supérieur ou égal à 1.';
      }
      if (!details.score && !details.total && d.score > d.total) {
        details.score = 'Le score ne peut pas dépasser le total.';
      }
      if (Object.keys(details).length) {
        return { statut: 400, corps: { erreur: 'Données invalides', details: details } };
      }
      const theme = typeof d.theme === 'string' ? d.theme.trim().slice(0, 60) : '';
      const date = new Date().toISOString();
      const r = ctx.db.prepare('INSERT INTO records (score, total, theme, date) VALUES (?, ?, ?, ?)')
        .run(d.score, d.total, theme, date);
      return {
        statut: 201,
        corps: { id: Number(r.lastInsertRowid), score: d.score, total: d.total, theme: theme, date: date }
      };
    }
  },

  /* POST /api/reinit — efface les records ; la banque de questions est
     recréée si la base avait été vidée. */
  {
    methode: 'POST', motif: '/api/reinit',
    traiter: function (ctx) {
      ctx.db.exec('DELETE FROM records');
      ctx.db.exec("DELETE FROM sqlite_sequence WHERE name = 'records'");
      semer(ctx.db);
      const n = ctx.db.prepare('SELECT COUNT(*) AS n FROM questions').get().n;
      return { statut: 200, corps: { message: 'Base réinitialisée : records effacés, ' + n + ' questions en place.' } };
    }
  }
];

/* ---------- Démarrage ---------- */

const fs = require('node:fs');
fs.mkdirSync(path.dirname(BASE), { recursive: true });

creerServeur({
  nom: 'Quiz culture générale — full-stack',
  port: PORT,
  base: BASE,
  racine: __dirname,
  /* Le frontend charge ../shared/… : on sert le dossier partagé en alias. */
  alias: [{ prefixe: '/shared', dossier: path.join(__dirname, '..', 'shared') }],
  routes: routes,
  surDemarrage: function (db) {
    preparerBase(db);
    semer(db);
  }
}).catch(function (err) {
  console.error('Démarrage impossible :', err);
  process.exit(1);
});
