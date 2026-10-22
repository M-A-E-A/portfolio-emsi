'use strict';

/* =========================================================
   Tableau blanc collaboratif — serveur full-stack
   Node.js natif (node:http) + base SQLite (node:sqlite).
   Aucune dépendance npm : `node server.js` suffit.
   Lancement : node server.js   puis   http://localhost:3109
   Variables d'environnement : PORT (port d'écoute),
                               BASE (chemin de la base SQLite).
   Le tableau est un CRDT OR-Set : la base persiste, pour chaque
   élément, ses jetons d'ajout et de suppression (sérialisés en
   JSON). Chaque PUT d'élément diffuse un événement « operation »
   sur le flux SSE (GET /api/flux) ; les clients fusionnent via
   la même fonction CRDT que pour BroadcastChannel.
   L'identité de session (whiteboard-auteur) reste dans
   sessionStorage côté client : elle n'est JAMAIS envoyée ici.
   ========================================================= */

const fs = require('node:fs');
const path = require('node:path');
const { creerServeur } = require('../serveur/commun.js');

const PORT = parseInt(process.env.PORT || '3109', 10);
/* Base posée À LA RACINE du repo (jamais servie en statique). */
const BASE = process.env.BASE || path.join(__dirname, '..', 'donnees-whiteboard', 'bdd.sqlite');

const TYPES_AUTORISES = ['trait', 'ligne', 'rectangle', 'ellipse', 'texte'];

function texte(v) { return typeof v === 'string' ? v.trim() : ''; }

function analyser(valeur, defaut) {
  if (valeur === null || valeur === undefined || valeur === '') return defaut;
  try { return JSON.parse(valeur); } catch (e) { return defaut; }
}

/* ---------- Schéma de la base ----------
   Chaque ligne est un élément CRDT complet : les ensembles de jetons
   sont stockés en JSON (tableaux) — Table → Array à l'écriture,
   Array → Set côté client au rechargement (CRDT.Element.depuis). */

function preparerBase(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS elements (
      id           TEXT    PRIMARY KEY,
      auteur       TEXT    NOT NULL,
      type         TEXT    NOT NULL,
      props        TEXT    NOT NULL,
      horodatage   INTEGER NOT NULL,
      ajouts       TEXT    NOT NULL,
      suppressions TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_elements_horodatage ON elements(horodatage);
  `);
}

/* L'élément sérialisé tel que le front le connaît (CRDT Element.serialiser()). */
function elementPublic(e) {
  return {
    id: e.id,
    auteur: e.auteur,
    type: e.type,
    props: analyser(e.props, {}),
    horodatage: e.horodatage,
    ajouts: analyser(e.ajouts, []),
    suppressions: analyser(e.suppressions, [])
  };
}

function lireElements(db) {
  return db.prepare('SELECT * FROM elements ORDER BY horodatage ASC, rowid ASC').all().map(elementPublic);
}

/* Upsert : la fusion CRDT côté client peut renvoyer un élément déjà connu. */
function enregistrerElement(db, e) {
  db.prepare(`
    INSERT INTO elements (id, auteur, type, props, horodatage, ajouts, suppressions)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      auteur = excluded.auteur,
      type = excluded.type,
      props = excluded.props,
      horodatage = excluded.horodatage,
      ajouts = excluded.ajouts,
      suppressions = excluded.suppressions
  `).run(e.id, e.auteur, e.type, JSON.stringify(e.props), e.horodatage,
         JSON.stringify(e.ajouts), JSON.stringify(e.suppressions));
}

/* ---------- Validation (mêmes règles que le front) ---------- */

function validerElement(d, id) {
  const details = {};
  if (!texte(d.id)) details.id = "L'identifiant est obligatoire.";
  else if (texte(d.id) !== id) details.id = "L'identifiant du corps ne correspond pas à l'URL.";
  if (!texte(d.auteur)) details.auteur = "L'auteur est obligatoire.";
  if (TYPES_AUTORISES.indexOf(d.type) === -1) {
    details.type = 'Type inconnu (attendu : ' + TYPES_AUTORISES.join(', ') + ').';
  }
  if (!d.props || typeof d.props !== 'object' || Array.isArray(d.props)) {
    details.props = 'Les propriétés de la forme sont obligatoires.';
  }
  if (d.ajouts !== undefined && !Array.isArray(d.ajouts)) details.ajouts = 'Les jetons d\'ajout forment un tableau.';
  if (d.suppressions !== undefined && !Array.isArray(d.suppressions)) details.suppressions = 'Les jetons de suppression forment un tableau.';
  return details;
}

/* Reconstruit l'élément normalisé à persister. */
function normaliserElement(d) {
  const id = texte(d.id);
  const auteur = texte(d.auteur);
  const horodatage = Number.isFinite(d.horodatage) ? d.horodatage : Date.now();
  return {
    id: id,
    auteur: auteur,
    type: d.type,
    props: d.props,
    horodatage: horodatage,
    /* À défaut de jetons, on reproduit la règle du CRDT : un jeton d'ajout. */
    ajouts: Array.isArray(d.ajouts) && d.ajouts.length ? d.ajouts : [id + '@' + auteur + '@' + horodatage],
    suppressions: Array.isArray(d.suppressions) ? d.suppressions : []
  };
}

/* ---------- Routes ---------- */

const routes = [
  /* GET /api/flux — flux SSE (la réponse est écrite par le hub lui-même). */
  {
    methode: 'GET', motif: '/api/flux',
    traiter: function (ctx) {
      ctx.flux.ouvrir(ctx.req, ctx.res);
      return undefined; // la réponse est déjà ouverte
    }
  },

  /* GET /api/etat — état complet du tableau, pour hydrater un client qui arrive. */
  {
    methode: 'GET', motif: '/api/etat',
    traiter: function (ctx) {
      return { statut: 200, corps: { donnees: lireElements(ctx.db) } };
    }
  },

  /* PUT /api/elements/:id — création ou mise à jour (upsert) d'un élément CRDT.
     La fusion reste commutative côté client ; le serveur stocke le dernier
     état connu et retransmet l'opération à tous les autres clients. */
  {
    methode: 'PUT', motif: '/api/elements/:id',
    traiter: function (ctx) {
      const d = ctx.corps && typeof ctx.corps === 'object' ? ctx.corps : {};
      const details = validerElement(d, ctx.params.id);
      if (Object.keys(details).length) {
        return { statut: 400, corps: { erreur: 'Données invalides', details: details } };
      }
      const element = normaliserElement(d);
      enregistrerElement(ctx.db, element);
      /* Les autres clients appliquent l'opération via leur chemin existant. */
      ctx.flux.publier('operation', { type: 'operation', auteur: element.auteur, element: element });
      return { statut: 200, corps: element };
    }
  },

  /* DELETE /api/elements/:id — suppression franche (usage API / réinitialisation). */
  {
    methode: 'DELETE', motif: '/api/elements/:id',
    traiter: function (ctx) {
      const r = ctx.db.prepare('DELETE FROM elements WHERE id = ?').run(ctx.params.id);
      if (!r.changes) return { statut: 404, corps: { erreur: 'Élément introuvable', id: ctx.params.id } };
      ctx.flux.publier('etat', { type: 'etat', auteur: 'serveur', elements: lireElements(ctx.db) });
      return { statut: 204, corps: null };
    }
  },

  /* POST /api/reinit — vide le tableau partagé. */
  {
    methode: 'POST', motif: '/api/reinit',
    traiter: function (ctx) {
      ctx.db.exec('DELETE FROM elements');
      ctx.flux.publier('etat', { type: 'etat', auteur: 'serveur', elements: [] });
      return { statut: 200, corps: { message: 'Tableau réinitialisé : aucun élément.' } };
    }
  }
];

/* ---------- Démarrage ---------- */

fs.mkdirSync(path.dirname(BASE), { recursive: true });

creerServeur({
  nom: 'Tableau blanc — full-stack',
  port: PORT,
  base: BASE,
  racine: __dirname,
  /* Le frontend charge ../shared/… : on sert le dossier partagé en alias. */
  alias: [{ prefixe: '/shared', dossier: path.join(__dirname, '..', 'shared') }],
  routes: routes,
  surDemarrage: function (db) {
    preparerBase(db);
  }
}).catch(function (err) {
  console.error('Démarrage impossible :', err);
  process.exit(1);
});
