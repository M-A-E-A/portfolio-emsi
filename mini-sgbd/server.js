'use strict';

/* =========================================================
   Mini-SGBD — serveur full-stack
   Node.js natif (node:http) + base SQLite (node:sqlite).
   Aucune dépendance npm : `node server.js` suffit.
   Lancement : node server.js   puis   http://localhost:3107
   Variables d'environnement : PORT (port d'écoute),
                               BASE (chemin de la base SQLite).

   PRINCIPE — le moteur SQL lui-même reste côté navigateur : c'est
   la démonstration (analyse lexicale, syntaxique, exécution). Le
   serveur ne fait que PERSISTER l'état du moteur :
     • « sgbd-base »       → table `base`, une seule ligne (id = 1)
                             qui contient le JSON { tables: … }.
       Ce choix est assumé et documenté : l'objet {tables:…} est
       l'état d'un moteur de requêtes arbitrairement riche (tables
       créées à la volée, colonnes typées, lignes hétérogènes) — le
       dénormaliser en colonnes SQL figerait le langage de l'app.
       Le schéma « relationnel réel » s'applique aux DONNÉES de
       l'app, pas à l'objet métier du moteur ;
     • « sgbd-historique » → table `historique` normalisée
                             (position, requete, resultat), 12 lignes max.
   ========================================================= */

const path = require('node:path');
const { creerServeur } = require('../serveur/commun.js');

const PORT = parseInt(process.env.PORT || '3107', 10);
const BASE = process.env.BASE || path.join(__dirname, '..', 'donnees-sgbd', 'bdd.sqlite');

/* Nombre maximal d'entrées d'historique (identique au front). */
const HISTORIQUE_MAX = 12;

/* Types de colonnes acceptés par le moteur côté client. */
const TYPES_COLONNES = ['INTEGER', 'REAL', 'TEXT'];

/* ---------- Jeu de démonstration (identique à baseDemonstration() du front) ---------- */

function col(nom, type, options) {
  const o = options || {};
  return {
    nom: nom, type: type, cle: !!o.cle, nonNul: !!o.nonNul || !!o.cle,
    unique: !!o.unique, aDefaut: false, defaut: null
  };
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

/* ---------- Schéma de la base ----------
   `base` : table « mono-ligne » (id = 1 contraint par CHECK) qui
   sérialise l'état du moteur { tables: … } — voir l'en-tête.
   `historique` : vraie table normalisée, la plus récente en tête
   (position croissante = ordre d'affichage). */

function preparerBase(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS base (
      id     INTEGER PRIMARY KEY CHECK (id = 1),
      donnees TEXT   NOT NULL
    );
    CREATE TABLE IF NOT EXISTS historique (
      position INTEGER PRIMARY KEY,
      requete  TEXT    NOT NULL,
      resultat TEXT    NOT NULL
    );
  `);
}

/* Insère la base de démonstration (premier lancement uniquement). */
function semer(db) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM base').get().n;
  if (n > 0) return;
  db.prepare('INSERT INTO base (id, donnees) VALUES (1, ?)')
    .run(JSON.stringify(baseDemonstration()));
  console.log('  • Base de démonstration initialisée (étudiants, matieres, notes).');
}

/* Lit la base sérialisée, ou null si la table est vide. */
function lireBase(db) {
  const ligne = db.prepare('SELECT donnees FROM base WHERE id = 1').get();
  if (!ligne) return null;
  try { return JSON.parse(ligne.donnees); } catch (e) { return null; }
}

/* Écrit (remplace) la base sérialisée. */
function ecrireBase(db, donnees) {
  db.prepare(
    "INSERT INTO base (id, donnees) VALUES (1, ?) " +
    "ON CONFLICT(id) DO UPDATE SET donnees = excluded.donnees"
  ).run(JSON.stringify(donnees));
}

/* Lit l'historique, du plus récent au plus ancien. */
function lireHistorique(db) {
  return db.prepare('SELECT requete, resultat FROM historique ORDER BY position ASC')
    .all()
    .map(function (l) { return { q: l.requete, s: l.resultat }; });
}

/* Remplace intégralement l'historique (12 entrées maximum, comme au front). */
function ecrireHistorique(db, liste) {
  db.exec('DELETE FROM historique');
  const ins = db.prepare('INSERT INTO historique (position, requete, resultat) VALUES (?, ?, ?)');
  liste.slice(0, HISTORIQUE_MAX).forEach(function (e, i) { ins.run(i, e.q, e.s); });
}

/* ---------- Validation ---------- */

/* Renvoie null si l'objet est une base valide, sinon le message d'erreur.
   On valide la FORME attendue par le moteur côté client : tables nommées,
   colonnes typées (INTEGER / REAL / TEXT), lignes = objets plats. */
function validerBase(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) {
    return 'Le corps doit être un objet { tables: … }.';
  }
  const tables = d.tables;
  if (!tables || typeof tables !== 'object' || Array.isArray(tables)) {
    return 'Champ « tables » manquant ou invalide (objet attendu).';
  }
  const noms = Object.keys(tables);
  if (!noms.length) return 'La base doit contenir au moins une table.';
  for (let i = 0; i < noms.length; i++) {
    const nom = noms[i];
    const t = tables[nom];
    if (!t || typeof t !== 'object' || Array.isArray(t)) return 'Table « ' + nom + ' » invalide.';
    if (!Array.isArray(t.colonnes) || !t.colonnes.length) {
      return 'La table « ' + nom + ' » doit déclarer au moins une colonne.';
    }
    for (let j = 0; j < t.colonnes.length; j++) {
      const c = t.colonnes[j];
      if (!c || typeof c !== 'object' || typeof c.nom !== 'string' || !c.nom.trim()) {
        return 'Colonne sans nom dans la table « ' + nom + ' ».';
      }
      if (TYPES_COLONNES.indexOf(c.type) === -1) {
        return 'Type inconnu « ' + c.type + ' » pour la colonne « ' + c.nom +
               ' » (attendu : INTEGER, REAL ou TEXT).';
      }
    }
    if (!Array.isArray(t.lignes)) return 'La table « ' + nom + ' » doit fournir une liste « lignes ».';
    for (let k = 0; k < t.lignes.length; k++) {
      const l = t.lignes[k];
      if (!l || typeof l !== 'object' || Array.isArray(l)) {
        return 'Ligne n° ' + k + ' invalide dans la table « ' + nom + ' » (objet attendu).';
      }
    }
  }
  return null;
}

/* Renvoie null si l'historique est valide, sinon le message d'erreur. */
function validerHistorique(d) {
  if (!Array.isArray(d)) return 'Le corps doit être un tableau [{ q, s }].';
  for (let i = 0; i < d.length; i++) {
    const e = d[i];
    if (!e || typeof e !== 'object' || Array.isArray(e)) return 'Entrée n° ' + i + ' invalide (objet { q, s } attendu).';
    if (typeof e.q !== 'string' || !e.q.trim()) return 'Entrée n° ' + i + ' : champ « q » (requête) manquant.';
    if (typeof e.s !== 'string') return 'Entrée n° ' + i + ' : champ « s » (statut) manquant.';
  }
  return null;
}

/* ---------- Routes ---------- */

const routes = [
  /* Sonde de détection du mode full-stack (utilisée par shared/api-client.js). */
  {
    methode: 'GET', motif: '/api/sante',
    traiter: function () {
      return { statut: 200, corps: { serveur: true, nom: 'Mini-SGBD (Node + SQLite)', version: '1.0.0' } };
    }
  },

  /* GET /api/base — l'état courant du moteur { tables: … }. */
  {
    methode: 'GET', motif: '/api/base',
    traiter: function (ctx) {
      const base = lireBase(ctx.db);
      if (!base) {
        return { statut: 404, corps: { erreur: 'Base introuvable', message: 'Aucune base enregistrée. Relancez le serveur pour réinitialiser.' } };
      }
      return { statut: 200, corps: base };
    }
  },

  /* PUT /api/base — remplacement intégral de l'état du moteur. */
  {
    methode: 'PUT', motif: '/api/base',
    traiter: function (ctx) {
      const erreur = validerBase(ctx.corps);
      if (erreur) {
        return { statut: 400, corps: { erreur: 'Base invalide', message: erreur, types: TYPES_COLONNES } };
      }
      ecrireBase(ctx.db, ctx.corps);
      const total = Object.keys(ctx.corps.tables).length;
      const lignes = Object.keys(ctx.corps.tables).reduce(function (n, t) {
        return n + (Array.isArray(ctx.corps.tables[t].lignes) ? ctx.corps.tables[t].lignes.length : 0);
      }, 0);
      return { statut: 200, corps: { message: 'Base enregistrée.', tables: total, lignes: lignes } };
    }
  },

  /* GET /api/historique — les 12 dernières requêtes, la plus récente en tête. */
  {
    methode: 'GET', motif: '/api/historique',
    traiter: function (ctx) {
      return { statut: 200, corps: lireHistorique(ctx.db) };
    }
  },

  /* PUT /api/historique — remplacement intégral de l'historique. */
  {
    methode: 'PUT', motif: '/api/historique',
    traiter: function (ctx) {
      const erreur = validerHistorique(ctx.corps);
      if (erreur) {
        return { statut: 400, corps: { erreur: 'Historique invalide', message: erreur } };
      }
      ecrireHistorique(ctx.db, ctx.corps);
      const total = Math.min(ctx.corps.length, HISTORIQUE_MAX);
      return { statut: 200, corps: { message: 'Historique enregistré.', total: total } };
    }
  },

  /* POST /api/reinit — vide l'historique et restaure la base de démonstration.
     Renvoie l'état restauré pour que le front puisse se resynchroniser. */
  {
    methode: 'POST', motif: '/api/reinit',
    traiter: function (ctx) {
      ecrireHistorique(ctx.db, []);
      ecrireBase(ctx.db, baseDemonstration());
      return {
        statut: 200,
        corps: { message: 'Base réinitialisée : étudiants, matieres, notes (démonstration).', base: lireBase(ctx.db), historique: [] }
      };
    }
  }
];

/* ---------- Démarrage ---------- */

const fs = require('node:fs');
fs.mkdirSync(path.dirname(BASE), { recursive: true });

creerServeur({
  nom: 'Mini-SGBD — full-stack',
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
