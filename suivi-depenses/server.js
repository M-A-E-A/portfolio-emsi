'use strict';

/* =========================================================
   Suivi de dépenses — serveur full-stack
   Node.js natif (node:http) + base SQLite (node:sqlite).
   Aucune dépendance npm : `node server.js` suffit.
   Lancement : node server.js   puis   http://localhost:3102
   Variables d'environnement : PORT (port d'écoute),
                               BASE (chemin de la base SQLite).
   ========================================================= */

const path = require('node:path');
const fs = require('node:fs');
const { creerServeur, normaliser } = require('../serveur/commun.js');

const PORT = parseInt(process.env.PORT || '3102', 10);
const BASE = process.env.BASE || path.join(__dirname, '..', 'donnees-suivi', 'bdd.sqlite');

/* ---------- Constantes (mêmes listes que le frontend) ---------- */

const CATEGORIES = ['Alimentation', 'Transport', 'Logement', 'Loisirs', 'Santé', 'Autre'];

/* ---------- Utilitaires ---------- */

function texte(v) { return typeof v === 'string' ? v.trim() : ''; }

/** "AAAA-MM-JJ" -> Date locale (ou null si invalide). Même règle que le front. */
function dateDepuisISO(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const parties = iso.split('-').map(Number);
  const a = parties[0], m = parties[1], j = parties[2];
  const d = new Date(a, m - 1, j);
  return (d.getFullYear() === a && d.getMonth() === m - 1 && d.getDate() === j) ? d : null;
}

/** Date ISO située il y a « jours » jours (heure locale, midi). */
function ilYA(jours) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - jours);
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/* Validation partagée par POST et PUT : mêmes messages que le formulaire. */
function valider(d) {
  const erreurs = {};
  const libelle = texte(d.libelle);
  const montant = Number(d.montant);
  if (!libelle) erreurs.libelle = 'Indiquez un libellé.';
  if (d.montant === undefined || d.montant === null || d.montant === '' || !isFinite(montant) || montant <= 0) {
    erreurs.montant = 'Saisissez un montant supérieur à 0.';
  }
  if (!dateDepuisISO(d.date)) erreurs.date = 'Choisissez une date valide.';
  return erreurs;
}

/* ---------- Jeu de démonstration (identique au frontend) ---------- */

const DEPENSES_EXEMPLE = [
  { jours: 2,  libelle: 'Courses du marché',    montant: 186.50,  categorie: 'Alimentation' },
  { jours: 3,  libelle: 'Abonnement transport', montant: 250.00,  categorie: 'Transport' },
  { jours: 6,  libelle: 'Pharmacie',            montant: 74.20,   categorie: 'Santé' },
  { jours: 9,  libelle: 'Loyer',                montant: 3200.00, categorie: 'Logement' },
  { jours: 12, libelle: 'Séance de cinéma',     montant: 90.00,   categorie: 'Loisirs' },
  { jours: 16, libelle: "Facture d'électricité", montant: 412.75, categorie: 'Logement' },
  { jours: 22, libelle: 'Carburant',            montant: 520.00,  categorie: 'Transport' },
  { jours: 31, libelle: 'Courses du mois',      montant: 214.90,  categorie: 'Alimentation' },
  { jours: 44, libelle: 'Loyer',                montant: 3200.00, categorie: 'Logement' },
  { jours: 58, libelle: 'Restaurant',           montant: 165.00,  categorie: 'Alimentation' },
  { jours: 71, libelle: 'Loyer',                montant: 3200.00, categorie: 'Logement' },
  { jours: 83, libelle: 'Livres et revues',     montant: 143.60,  categorie: 'Loisirs' }
];

/* ---------- Schéma de la base ----------
   Colonnes normalisées (tri_*) recalculées à chaque écriture : elles
   permettent un tri insensibles aux accents EN SQL. */

function preparerBase(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS depenses (
      id        INTEGER PRIMARY KEY,
      libelle   TEXT    NOT NULL,
      montant   REAL    NOT NULL,
      categorie TEXT    NOT NULL DEFAULT 'Autre'
                CHECK (categorie IN ('Alimentation','Transport','Logement','Loisirs','Santé','Autre')),
      date      TEXT    NOT NULL,
      tri_libelle TEXT  NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_depenses_date      ON depenses(date);
    CREATE INDEX IF NOT EXISTS idx_depenses_categorie ON depenses(categorie);
    CREATE INDEX IF NOT EXISTS idx_depenses_tri       ON depenses(tri_libelle);

    CREATE TABLE IF NOT EXISTS budgets (
      categorie TEXT PRIMARY KEY
                CHECK (categorie IN ('Alimentation','Transport','Logement','Loisirs','Santé','Autre')),
      montant   REAL NOT NULL CHECK (montant > 0)
    );
  `);
}

/* Insère les 12 dépenses d'exemple (premier lancement uniquement). */
function semer(db) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM depenses').get().n;
  if (n > 0) return;
  const ins = db.prepare('INSERT INTO depenses (libelle, montant, categorie, date, tri_libelle) VALUES (?, ?, ?, ?, ?)');
  const transaction = db.prepare('BEGIN');
  transaction.run();
  try {
    DEPENSES_EXEMPLE.forEach(function (m) {
      ins.run(m.libelle, m.montant, m.categorie, ilYA(m.jours), normaliser(m.libelle));
    });
    db.prepare('COMMIT').run();
    console.log('  • 12 dépenses de démonstration insérées.');
  } catch (e) {
    db.prepare('ROLLBACK').run();
    throw e;
  }
}

/* Public : les identifiants sont renvoyés en chaîne, comme les identifiants
   générés côté client (« d3f2k… »), pour rester interchangeables. */
function publique(d) {
  return { id: String(d.id), libelle: d.libelle, montant: d.montant, categorie: d.categorie, date: d.date };
}

/* Recalcule la colonne normalisée d'une ligne. */
function lignePrete(d) {
  return { libelle: texte(d.libelle), montant: Math.round(Number(d.montant) * 100) / 100, categorie: d.categorie, date: d.date };
}

/* Catégorie inconnue -> « Autre » (le select du frontend n'offre que les 6). */
function categorieOuAutre(v) {
  return CATEGORIES.indexOf(v) !== -1 ? v : 'Autre';
}

/* Identifiant numérique exploitable en clé primaire ; sinon null
   (le client peut avoir généré « d3f2k… » : SQLite assigne alors une ligne). */
function idNumerique(v) {
  const s = String(v === undefined || v === null ? '' : v).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/* Liste complète, triée comme le front : date décroissante puis id décroissant. */
function listerDepenses(db) {
  const lignes = db.prepare('SELECT * FROM depenses ORDER BY date DESC, id DESC').all();
  return lignes.map(publique);
}

function listerBudgets(db) {
  const obj = {};
  db.prepare('SELECT categorie, montant FROM budgets ORDER BY rowid').all().forEach(function (l) {
    obj[l.categorie] = l.montant;
  });
  return obj;
}

/* Remplacement intégral (write-through du frontend : tableau complet).
   Les identifiants numériques sont conservés ; les autres reçoivent
   une nouvelle ligne. Transaction : tout ou rien. */
function remplacerDepenses(db, brut) {
  const donnees = Array.isArray(brut) ? brut : [];
  const transaction = db.prepare('BEGIN');
  transaction.run();
  try {
    db.prepare('DELETE FROM depenses').run();
    const ins = db.prepare('INSERT INTO depenses (id, libelle, montant, categorie, date, tri_libelle) VALUES (?, ?, ?, ?, ?, ?)');
    donnees.forEach(function (d) {
      if (!d || typeof d !== 'object') return;
      const montant = Number(d.montant);
      if (!texte(d.libelle) || !isFinite(montant) || !dateDepuisISO(d.date)) return; // ligne abîmée : ignorée
      const id = idNumerique(d.id);
      const cat = categorieOuAutre(d.categorie);
      if (id === null) ins.run(null, texte(d.libelle), Math.round(montant * 100) / 100, cat, d.date, normaliser(d.libelle));
      else ins.run(id, texte(d.libelle), Math.round(montant * 100) / 100, cat, d.date, normaliser(d.libelle));
    });
    db.prepare('COMMIT').run();
  } catch (e) {
    db.prepare('ROLLBACK').run();
    throw e;
  }
  return listerDepenses(db);
}

/* Remplacement intégral des budgets : { catégorie: montant }. */
function remplacerBudgets(db, brut) {
  const donnees = brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {};
  const transaction = db.prepare('BEGIN');
  transaction.run();
  try {
    db.prepare('DELETE FROM budgets').run();
    const ins = db.prepare('INSERT INTO budgets (categorie, montant) VALUES (?, ?)');
    Object.keys(donnees).forEach(function (cat) {
      const montant = Number(donnees[cat]);
      if (CATEGORIES.indexOf(cat) === -1) return;
      if (isFinite(montant) && montant > 0) ins.run(cat, Math.round(montant * 100) / 100);
    });
    db.prepare('COMMIT').run();
  } catch (e) {
    db.prepare('ROLLBACK').run();
    throw e;
  }
  return listerBudgets(db);
}

/* ---------- Routes ---------- */

const routes = [
  /* Sonde de détection du mode full-stack (shared/api-client.js). */
  {
    methode: 'GET', motif: '/api/sante',
    traiter: function () {
      return { statut: 200, corps: { serveur: true, nom: 'Suivi de dépenses (Node + SQLite)', version: '1.0.0' } };
    }
  },

  /* GET /api/depenses — toutes les dépenses, triées date décroissante. */
  {
    methode: 'GET', motif: '/api/depenses',
    traiter: function (ctx) {
      const donnees = listerDepenses(ctx.db);
      return { statut: 200, corps: { donnees: donnees, meta: { total: donnees.length } } };
    }
  },

  /* PUT /api/depenses — remplacement intégral (écriture-transit du frontend). */
  {
    methode: 'PUT', motif: '/api/depenses',
    traiter: function (ctx) {
      if (!Array.isArray(ctx.corps)) {
        return { statut: 400, corps: { erreur: 'Données invalides', message: 'Un tableau de dépenses est attendu.' } };
      }
      const donnees = remplacerDepenses(ctx.db, ctx.corps);
      return { statut: 200, corps: { donnees: donnees, meta: { total: donnees.length } } };
    }
  },

  /* GET /api/depenses/:id */
  {
    methode: 'GET', motif: '/api/depenses/:id',
    traiter: function (ctx) {
      const id = idNumerique(ctx.params.id);
      const ligne = id === null ? undefined : ctx.db.prepare('SELECT * FROM depenses WHERE id = ?').get(id);
      if (!ligne) return { statut: 404, corps: { erreur: 'Dépense introuvable', id: ctx.params.id } };
      return { statut: 200, corps: publique(ligne) };
    }
  },

  /* POST /api/depenses */
  {
    methode: 'POST', motif: '/api/depenses',
    traiter: function (ctx) {
      const d = ctx.corps && typeof ctx.corps === 'object' ? ctx.corps : {};
      const erreurs = valider(d);
      if (Object.keys(erreurs).length) {
        return { statut: 400, corps: { erreur: 'Données invalides', details: erreurs } };
      }
      const prete = lignePrete(d);
      prete.categorie = categorieOuAutre(d.categorie);
      const r = ctx.db.prepare(
        'INSERT INTO depenses (libelle, montant, categorie, date, tri_libelle) VALUES (?, ?, ?, ?, ?)'
      ).run(prete.libelle, prete.montant, prete.categorie, prete.date, normaliser(prete.libelle));
      return { statut: 201, corps: Object.assign({ id: String(r.lastInsertRowid) }, prete) };
    }
  },

  /* PUT /api/depenses/:id — remplacement intégral d'une dépense. */
  {
    methode: 'PUT', motif: '/api/depenses/:id',
    traiter: function (ctx) {
      const id = idNumerique(ctx.params.id);
      const existant = id === null ? undefined : ctx.db.prepare('SELECT * FROM depenses WHERE id = ?').get(id);
      if (!existant) return { statut: 404, corps: { erreur: 'Dépense introuvable', id: ctx.params.id } };
      const d = ctx.corps && typeof ctx.corps === 'object' ? ctx.corps : {};
      const erreurs = valider(d);
      if (Object.keys(erreurs).length) {
        return { statut: 400, corps: { erreur: 'Données invalides', details: erreurs } };
      }
      const prete = lignePrete(d);
      prete.categorie = categorieOuAutre(d.categorie);
      ctx.db.prepare(
        'UPDATE depenses SET libelle = ?, montant = ?, categorie = ?, date = ?, tri_libelle = ? WHERE id = ?'
      ).run(prete.libelle, prete.montant, prete.categorie, prete.date, normaliser(prete.libelle), id);
      return { statut: 200, corps: Object.assign({ id: String(id) }, prete) };
    }
  },

  /* DELETE /api/depenses/:id */
  {
    methode: 'DELETE', motif: '/api/depenses/:id',
    traiter: function (ctx) {
      const id = idNumerique(ctx.params.id);
      const r = id === null ? { changes: 0 } : ctx.db.prepare('DELETE FROM depenses WHERE id = ?').run(id);
      if (!r.changes) return { statut: 404, corps: { erreur: 'Dépense introuvable', id: ctx.params.id } };
      return { statut: 204, corps: null };
    }
  },

  /* GET /api/budgets — { catégorie: montant mensuel }. */
  {
    methode: 'GET', motif: '/api/budgets',
    traiter: function (ctx) {
      const donnees = listerBudgets(ctx.db);
      return { statut: 200, corps: { donnees: donnees, meta: { total: Object.keys(donnees).length } } };
    }
  },

  /* PUT /api/budgets — remplacement intégral (objet { catégorie: montant }).
     Un objet vide retire tous les enveloppes, comme stockage.supprimer. */
  {
    methode: 'PUT', motif: '/api/budgets',
    traiter: function (ctx) {
      const d = ctx.corps;
      if (!d || typeof d !== 'object' || Array.isArray(d)) {
        return { statut: 400, corps: { erreur: 'Données invalides', message: 'Un objet { catégorie: montant } est attendu.' } };
      }
      const erreurs = {};
      Object.keys(d).forEach(function (cat) {
        const montant = Number(d[cat]);
        if (CATEGORIES.indexOf(cat) === -1) erreurs[cat] = 'Catégorie inconnue.';
        else if (!isFinite(montant)) erreurs[cat] = 'Le budget doit être un nombre supérieur à 0.';
        else if (montant < 0) erreurs[cat] = 'Le budget ne peut pas être négatif.';
        else if (montant === 0) erreurs[cat] = 'Le budget doit être supérieur à 0.';
      });
      if (Object.keys(erreurs).length) {
        return { statut: 400, corps: { erreur: 'Données invalides', details: erreurs } };
      }
      const donnees = remplacerBudgets(ctx.db, d);
      return { statut: 200, corps: { donnees: donnees, meta: { total: Object.keys(donnees).length } } };
    }
  },

  /* DELETE /api/budgets — retire toutes les enveloppes (204, sans corps). */
  {
    methode: 'DELETE', motif: '/api/budgets',
    traiter: function (ctx) {
      ctx.db.prepare('DELETE FROM budgets').run();
      return { statut: 204, corps: null };
    }
  },

  /* POST /api/reinit — vide les tables puis réinsère les exemples. */
  {
    methode: 'POST', motif: '/api/reinit',
    traiter: function (ctx) {
      ctx.db.prepare('DELETE FROM depenses').run();
      ctx.db.prepare('DELETE FROM budgets').run();
      semer(ctx.db);
      const total = ctx.db.prepare('SELECT COUNT(*) AS n FROM depenses').get().n;
      return {
        statut: 200,
        corps: { message: 'Base réinitialisée : ' + total + ' dépenses de démonstration.', meta: { depenses: total, budgets: 0 } }
      };
    }
  }
];

/* ---------- Démarrage ---------- */

fs.mkdirSync(path.dirname(BASE), { recursive: true });

creerServeur({
  nom: 'Suivi de dépenses — full-stack',
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
