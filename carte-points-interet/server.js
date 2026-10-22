'use strict';

/* =========================================================
   Carte des points d'intérêt — serveur full-stack
   Node.js natif (node:http) + base SQLite (node:sqlite).
   Aucune dépendance npm : `node server.js` suffit.
   Lancement : node server.js   puis   http://localhost:3105
   Variables d'environnement : PORT (port d'écoute),
                               BASE (chemin de la base SQLite).
   ========================================================= */

const path = require('node:path');
const fs = require('node:fs');
const { creerServeur, normaliser } = require('../serveur/commun.js');

const PORT = parseInt(process.env.PORT || '3105', 10);
const BASE = process.env.BASE || path.join(__dirname, '..', 'donnees-carte', 'bdd.sqlite');

/* ---------- Constantes (mêmes listes que le frontend) ---------- */

const CATEGORIES = ['Monuments', 'Jardins', 'Restaurants', 'Shopping'];

/* ---------- Utilitaires ---------- */

function texte(v) { return typeof v === 'string' ? v.trim() : ''; }

/* Bornes la position sur le plan (le plan fait 100 % × 100 %). */
function borner(valeur) {
  const n = Number(valeur);
  if (!isFinite(n)) return 50;
  return Math.min(100, Math.max(0, Math.round(n * 10) / 10));
}

/* Validation partagée par POST, PUT et l'import : mêmes règles que le front. */
function valider(d) {
  const erreurs = {};
  if (!texte(d.nom)) erreurs.nom = 'Le nom est obligatoire.';
  return erreurs;
}

/* ---------- Jeu de démonstration (identique au frontend) ---------- */

const LIEUX_DEFAUT = [
  { nom: 'Koutoubia', categorie: 'Monuments', x: 41, y: 38,
    description: "Le minaret almohade de 77 m qui sert de repère à toute la médina." },
  { nom: 'Jemaa el-Fna', categorie: 'Monuments', x: 52, y: 30,
    description: "La grande place, ses conteurs, ses musiciens et ses étals le soir venu." },
  { nom: 'Palais Bahia', categorie: 'Monuments', x: 30, y: 62,
    description: "Un palais du XIXe siècle, ses patios à zelliges et ses plafonds de cèdre." },
  { nom: 'Jardin Majorelle', categorie: 'Jardins', x: 78, y: 22,
    description: "Neuf hectares de bambous, de cactus et le bleu intense de l'atelier." },
  { nom: 'Café Clock', categorie: 'Restaurants', x: 63, y: 55,
    description: "Une maison restaurée : cuisine marocaine, concerts et cours de derbouka." },
  { nom: 'Souk Semmarine', categorie: 'Shopping', x: 46, y: 70,
    description: "L'allée couverte des artisans : cuir, lanternes, tapis et épices." }
];

/* ---------- Schéma de la base ----------
   Colonne normalisée (tri_nom) recalculée à chaque écriture : elle
   permet un tri insensibles aux accents EN SQL (même ordre que le front). */

function preparerBase(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lieux (
      id          INTEGER PRIMARY KEY,
      nom         TEXT    NOT NULL,
      categorie   TEXT    NOT NULL DEFAULT 'Monuments'
                  CHECK (categorie IN ('Monuments','Jardins','Restaurants','Shopping')),
      x           REAL    NOT NULL DEFAULT 50,
      y           REAL    NOT NULL DEFAULT 50,
      description TEXT    NOT NULL DEFAULT '',
      tri_nom     TEXT    NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_lieux_tri_nom   ON lieux(tri_nom);
    CREATE INDEX IF NOT EXISTS idx_lieux_categorie ON lieux(categorie);
  `);
}

/* Insère les 6 lieux de démonstration (premier lancement uniquement). */
function semer(db) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM lieux').get().n;
  if (n > 0) return;
  const ins = db.prepare('INSERT INTO lieux (nom, categorie, x, y, description, tri_nom) VALUES (?, ?, ?, ?, ?, ?)');
  const transaction = db.prepare('BEGIN');
  transaction.run();
  try {
    LIEUX_DEFAUT.forEach(function (l) {
      ins.run(l.nom, l.categorie, l.x, l.y, l.description, normaliser(l.nom));
    });
    db.prepare('COMMIT').run();
    console.log('  • 6 lieux de démonstration insérés.');
  } catch (e) {
    db.prepare('ROLLBACK').run();
    throw e;
  }
}

/* Public : les identifiants sont renvoyés en chaîne, comme les identifiants
   générés côté client (« lieu-3f2k… »), pour rester interchangeables. */
function publique(l) {
  return { id: String(l.id), nom: l.nom, categorie: l.categorie, x: l.x, y: l.y, description: l.description };
}

/* Applique les règles du formulaire d'ajout : longueurs bornées,
   catégorie inconnue ramenée à « Monuments », description par défaut. */
function preparerLieu(d) {
  const description = texte(d.description).slice(0, 180) || 'Aucune description.';
  return {
    nom: texte(d.nom).slice(0, 60),
    categorie: CATEGORIES.indexOf(d.categorie) !== -1 ? d.categorie : CATEGORIES[0],
    x: borner(d.x),
    y: borner(d.y),
    description: description
  };
}

/* Identifiant numérique exploitable en clé primaire ; sinon null
   (le client peut avoir généré « lieu-3f2k… » : SQLite assigne alors une ligne). */
function idNumerique(v) {
  const s = String(v === undefined || v === null ? '' : v).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/* Liste complète, triée par nom (ordre alphabétique français, comme le front). */
function listerLieux(db) {
  const lignes = db.prepare('SELECT * FROM lieux ORDER BY tri_nom ASC, id ASC').all();
  return lignes.map(publique);
}

/* Remplacement intégral (write-through du frontend, import JSON).
   Les identifiants numériques sont conservés ; les autres reçoivent
   une nouvelle ligne. Transaction : tout ou rien. */
function remplacerLieux(db, brut) {
  const donnees = Array.isArray(brut) ? brut
    : (brut && typeof brut === 'object' && Array.isArray(brut.lieux) ? brut.lieux : null);
  if (!donnees) return null;

  const transaction = db.prepare('BEGIN');
  transaction.run();
  try {
    db.prepare('DELETE FROM lieux').run();
    const ins = db.prepare('INSERT INTO lieux (id, nom, categorie, x, y, description, tri_nom) VALUES (?, ?, ?, ?, ?, ?, ?)');
    donnees.forEach(function (l) {
      if (!l || typeof l !== 'object' || !texte(l.nom)) return; // ligne sans nom : ignorée (comme validerLieux)
      const p = preparerLieu(l);
      const id = idNumerique(l.id);
      ins.run(id, p.nom, p.categorie, p.x, p.y, p.description, normaliser(p.nom));
    });
    db.prepare('COMMIT').run();
  } catch (e) {
    db.prepare('ROLLBACK').run();
    throw e;
  }
  return listerLieux(db);
}

/* ---------- Routes ---------- */

const routes = [
  /* Sonde de détection du mode full-stack (shared/api-client.js). */
  {
    methode: 'GET', motif: '/api/sante',
    traiter: function () {
      return { statut: 200, corps: { serveur: true, nom: 'Carte des points d\'intérêt (Node + SQLite)', version: '1.0.0' } };
    }
  },

  /* GET /api/lieux — tous les lieux, triés par nom. */
  {
    methode: 'GET', motif: '/api/lieux',
    traiter: function (ctx) {
      const donnees = listerLieux(ctx.db);
      return { statut: 200, corps: { donnees: donnees, meta: { total: donnees.length } } };
    }
  },

  /* PUT /api/lieux — remplacement intégral (écriture-transit du frontend). */
  {
    methode: 'PUT', motif: '/api/lieux',
    traiter: function (ctx) {
      const donnees = remplacerLieux(ctx.db, ctx.corps);
      if (donnees === null) {
        return { statut: 400, corps: { erreur: 'Données invalides', message: 'Un tableau de lieux est attendu.' } };
      }
      return { statut: 200, corps: { donnees: donnees, meta: { total: donnees.length } } };
    }
  },

  /* POST /api/lieux/import — même remplacement, enveloppe acceptée :
     un tableau nu ou { "lieux": [ … ] } (tolérance identique au front). */
  {
    methode: 'POST', motif: '/api/lieux/import',
    traiter: function (ctx) {
      const donnees = remplacerLieux(ctx.db, ctx.corps);
      if (donnees === null) {
        return {
          statut: 400,
          corps: {
            erreur: 'Format inattendu',
            message: 'Un tableau de lieux ou un objet { "lieux": [ … ] } est attendu.'
          }
        };
      }
      return { statut: 200, corps: { donnees: donnees, meta: { total: donnees.length, importes: donnees.length } } };
    }
  },

  /* GET /api/lieux/:id */
  {
    methode: 'GET', motif: '/api/lieux/:id',
    traiter: function (ctx) {
      const id = idNumerique(ctx.params.id);
      const ligne = id === null ? undefined : ctx.db.prepare('SELECT * FROM lieux WHERE id = ?').get(id);
      if (!ligne) return { statut: 404, corps: { erreur: 'Lieu introuvable', id: ctx.params.id } };
      return { statut: 200, corps: publique(ligne) };
    }
  },

  /* POST /api/lieux */
  {
    methode: 'POST', motif: '/api/lieux',
    traiter: function (ctx) {
      const d = ctx.corps && typeof ctx.corps === 'object' ? ctx.corps : {};
      const erreurs = valider(d);
      if (Object.keys(erreurs).length) {
        return { statut: 400, corps: { erreur: 'Données invalides', details: erreurs } };
      }
      const p = preparerLieu(d);
      const r = ctx.db.prepare(
        'INSERT INTO lieux (nom, categorie, x, y, description, tri_nom) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(p.nom, p.categorie, p.x, p.y, p.description, normaliser(p.nom));
      return { statut: 201, corps: Object.assign({ id: String(r.lastInsertRowid) }, p) };
    }
  },

  /* PUT /api/lieux/:id — remplacement intégral d'un lieu. */
  {
    methode: 'PUT', motif: '/api/lieux/:id',
    traiter: function (ctx) {
      const id = idNumerique(ctx.params.id);
      const existant = id === null ? undefined : ctx.db.prepare('SELECT * FROM lieux WHERE id = ?').get(id);
      if (!existant) return { statut: 404, corps: { erreur: 'Lieu introuvable', id: ctx.params.id } };
      const d = ctx.corps && typeof ctx.corps === 'object' ? ctx.corps : {};
      const erreurs = valider(d);
      if (Object.keys(erreurs).length) {
        return { statut: 400, corps: { erreur: 'Données invalides', details: erreurs } };
      }
      const p = preparerLieu(d);
      ctx.db.prepare(
        'UPDATE lieux SET nom = ?, categorie = ?, x = ?, y = ?, description = ?, tri_nom = ? WHERE id = ?'
      ).run(p.nom, p.categorie, p.x, p.y, p.description, normaliser(p.nom), id);
      return { statut: 200, corps: Object.assign({ id: String(id) }, p) };
    }
  },

  /* DELETE /api/lieux/:id */
  {
    methode: 'DELETE', motif: '/api/lieux/:id',
    traiter: function (ctx) {
      const id = idNumerique(ctx.params.id);
      const r = id === null ? { changes: 0 } : ctx.db.prepare('DELETE FROM lieux WHERE id = ?').run(id);
      if (!r.changes) return { statut: 404, corps: { erreur: 'Lieu introuvable', id: ctx.params.id } };
      return { statut: 204, corps: null };
    }
  },

  /* POST /api/reinit — vide la table puis réinsère les lieux d'exemple. */
  {
    methode: 'POST', motif: '/api/reinit',
    traiter: function (ctx) {
      ctx.db.prepare('DELETE FROM lieux').run();
      semer(ctx.db);
      const total = ctx.db.prepare('SELECT COUNT(*) AS n FROM lieux').get().n;
      return {
        statut: 200,
        corps: { message: 'Base réinitialisée : ' + total + ' lieux de démonstration.', meta: { total: total } }
      };
    }
  }
];

/* ---------- Démarrage ---------- */

fs.mkdirSync(path.dirname(BASE), { recursive: true });

creerServeur({
  nom: 'Carte des points d\'intérêt — full-stack',
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
