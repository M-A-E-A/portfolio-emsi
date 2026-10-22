'use strict';

/* =========================================================
   Blockchain — serveur full-stack
   Node.js natif (node:http) + base SQLite (node:sqlite).
   Aucune dépendance npm : `node server.js` suffit.
   Lancement : node server.js   puis   http://localhost:3108
   Variables d'environnement : PORT (port d'écoute),
                               BASE (chemin de la base SQLite).

   SÉCURITÉ — le portefeuille (clé privée ECDSA, format JWK) ne
   quitte JAMAIS le navigateur : il n'existe pas de route pour le
   recevoir ni le servir. Le serveur ne stocke que la chaîne de
   blocs (elle est publique par nature) et deux paramètres
   (difficulté, compteur de nonces).

   Validation — un PUT /api/chaine refuse (400) toute chaîne dont
   les liens previousHash sont rompus : la base distante ne peut
   jamais devenir incohérente avec ce que le mineur a produit.
   ========================================================= */

const path = require('node:path');
const { creerServeur } = require('../serveur/commun.js');

const PORT = parseInt(process.env.PORT || '3108', 10);
const BASE = process.env.BASE || path.join(__dirname, '..', 'donnees-chain', 'bdd.sqlite');

/* Paramètres de la chaîne, avec leurs valeurs par défaut (identiques
   à celles de Chain.Chaine côté client). */
const PARAMS_DEFAUT = { difficulte: 2, compteur: 0 };

/* ---------- Schéma de la base ----------
   `blocs` : une ligne par bloc, dans l'ordre de la chaîne. Les
   transactions sont stockées en JSON : leur structure (signatures,
   arbre de Merkle) est l'objet métier du moteur, pas une donnée à
   interroger en SQL.
   `parametres` : difficulté courante et compteur d'enchères (nonce). */

function preparerBase(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS blocs (
      "index"        INTEGER PRIMARY KEY,
      transactions  TEXT    NOT NULL,
      previous_hash TEXT    NOT NULL,
      difficulty    INTEGER NOT NULL,
      timestamp     INTEGER NOT NULL,
      nonce         INTEGER NOT NULL,
      merkle_root   TEXT    NOT NULL,
      hash          TEXT    NOT NULL,
      duree_ms      INTEGER
    );
    CREATE TABLE IF NOT EXISTS parametres (
      cle    TEXT PRIMARY KEY,
      valeur TEXT NOT NULL
    );
  `);
}

/* Valeur d'un paramètre (entier), avec repli sur le défaut. */
function lireParametre(db, cle, defaut) {
  const ligne = db.prepare('SELECT valeur FROM parametres WHERE cle = ?').get(cle);
  if (!ligne) return defaut;
  const n = parseInt(ligne.valeur, 10);
  return isFinite(n) ? n : defaut;
}

/* Écrit un paramètre (upsert). */
function ecrireParametre(db, cle, valeur) {
  db.prepare(
    'INSERT INTO parametres (cle, valeur) VALUES (?, ?) ' +
    'ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur'
  ).run(cle, String(valeur));
}

/* Peuple les paramètres au premier lancement (la chaîne, elle, démarre
   toujours vide : pas de bloc de genèse dans la démonstration). */
function semer(db) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM parametres').get().n;
  if (n > 0) return;
  ecrireParametre(db, 'difficulte', PARAMS_DEFAUT.difficulte);
  ecrireParametre(db, 'compteur', PARAMS_DEFAUT.compteur);
  console.log('  • Paramètres initialisés (difficulté ' + PARAMS_DEFAUT.difficulte + ').');
}

/* Reconstruit la forme exacte de localStorage : { blocs, difficulte, compteur }
   avec des blocs { index, transactions, previousHash, difficulty, timestamp,
   nonce, merkleRoot, hash, dureeMs }. */
function lireChaine(db) {
  const blocs = db.prepare('SELECT * FROM blocs ORDER BY "index" ASC').all().map(function (b) {
    let transactions;
    try { transactions = JSON.parse(b.transactions); } catch (e) { transactions = []; }
    const bloc = {
      index: b.index,
      transactions: Array.isArray(transactions) ? transactions : [],
      previousHash: b.previous_hash,
      difficulty: b.difficulty,
      timestamp: b.timestamp,
      nonce: b.nonce,
      merkleRoot: b.merkle_root,
      hash: b.hash
    };
    if (b.duree_ms !== null && b.duree_ms !== undefined) { bloc.dureeMs = b.duree_ms; }
    return bloc;
  });
  return {
    blocs: blocs,
    difficulte: lireParametre(db, 'difficulte', PARAMS_DEFAUT.difficulte),
    compteur: lireParametre(db, 'compteur', PARAMS_DEFAUT.compteur)
  };
}

/* Remplace intégralement la chaîne et ses paramètres (transaction). */
function ecrireChaine(db, donnees) {
  const difficulte = entier(donnees.difficulte, PARAMS_DEFAUT.difficulte);
  const compteur = entier(donnees.compteur, PARAMS_DEFAUT.compteur);
  const ins = db.prepare(
    'INSERT INTO blocs ("index", transactions, previous_hash, difficulty, timestamp, nonce, merkle_root, hash, duree_ms) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM blocs');
    donnees.blocs.forEach(function (b) {
      ins.run(b.index, JSON.stringify(Array.isArray(b.transactions) ? b.transactions : []),
        b.previousHash, b.difficulty, b.timestamp, b.nonce, b.merkleRoot, b.hash,
        (b.dureeMs === undefined || b.dureeMs === null) ? null : b.dureeMs);
    });
    ecrireParametre(db, 'difficulte', difficulte);
    ecrireParametre(db, 'compteur', compteur);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/* Entier, ou null si la valeur n'en est pas un. */
function entier(valeur, defaut) {
  if (valeur === undefined || valeur === null) return defaut;
  const n = Number(valeur);
  return Number.isInteger(n) ? n : null;
}

/* ---------- Validation ---------- */

/* Renvoie null si la chaîne est recevable, sinon le message d'erreur.
   Contrôles : forme des blocs, index continus, liens previousHash. */
function validerChaine(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) {
    return 'Le corps doit être un objet { blocs, difficulte, compteur }.';
  }
  if (!Array.isArray(d.blocs)) return 'Champ « blocs » manquant ou invalide (tableau attendu).';

  const difficulte = entier(d.difficulte, PARAMS_DEFAUT.difficulte);
  if (difficulte === null || difficulte < 1 || difficulte > 8) {
    return 'Difficulté invalide : un entier entre 1 et 8 est attendu.';
  }
  const compteur = entier(d.compteur, PARAMS_DEFAUT.compteur);
  if (compteur === null || compteur < 0) return 'Compteur invalide : un entier positif est attendu.';

  for (let i = 0; i < d.blocs.length; i++) {
    const b = d.blocs[i];
    const n = 'Bloc n° ' + i + ' : ';
    if (!b || typeof b !== 'object' || Array.isArray(b)) return n + 'objet attendu.';
    if (!Number.isInteger(b.index) || b.index !== i) return n + 'index incohérent (' + b.index + ').';
    if (!Array.isArray(b.transactions)) return n + 'champ « transactions » invalide (tableau attendu).';
    if (typeof b.previousHash !== 'string' || !b.previousHash) return n + 'previousHash manquant.';
    if (typeof b.hash !== 'string' || !b.hash) return n + 'hash manquant.';
    if (typeof b.merkleRoot !== 'string') return n + 'merkleRoot manquant.';
    if (!Number.isInteger(b.difficulty) || b.difficulty < 1) return n + 'difficulté invalide.';
    if (!Number.isInteger(b.timestamp) || !Number.isInteger(b.nonce)) return n + 'timestamp ou nonce invalide.';
    /* Intégrité de la chaîne : le lien cryptographique doit être intact. */
    if (i > 0 && b.previousHash !== d.blocs[i - 1].hash) {
      return n + 'lien rompu avec le bloc précédent (previousHash ≠ hash du bloc ' + (i - 1) + ').';
    }
  }
  return null;
}

/* ---------- Routes ---------- */

const routes = [
  /* Sonde de détection du mode full-stack (utilisée par shared/api-client.js). */
  {
    methode: 'GET', motif: '/api/sante',
    traiter: function () {
      return { statut: 200, corps: { serveur: true, nom: 'Blockchain (Node + SQLite)', version: '1.0.0' } };
    }
  },

  /* GET /api/chaine — la chaîne complète, dans la même forme que
     localStorage : { blocs, difficulte, compteur }. */
  {
    methode: 'GET', motif: '/api/chaine',
    traiter: function (ctx) {
      return { statut: 200, corps: lireChaine(ctx.db) };
    }
  },

  /* PUT /api/chaine — remplacement intégral, après vérification des
     liens cryptographiques. Une chaîne rompue est refusée en 400. */
  {
    methode: 'PUT', motif: '/api/chaine',
    traiter: function (ctx) {
      const erreur = validerChaine(ctx.corps);
      if (erreur) {
        return { statut: 400, corps: { erreur: 'Chaîne invalide', message: erreur } };
      }
      ecrireChaine(ctx.db, ctx.corps);
      return {
        statut: 200,
        corps: {
          message: 'Chaîne enregistrée.',
          blocs: ctx.corps.blocs.length,
          difficulte: entier(ctx.corps.difficulte, PARAMS_DEFAUT.difficulte),
          compteur: entier(ctx.corps.compteur, PARAMS_DEFAUT.compteur)
        }
      };
    }
  },

  /* POST /api/reinit — repart d'une chaîne vide (pas de bloc de genèse
     dans cette démonstration), difficulté par défaut. */
  {
    methode: 'POST', motif: '/api/reinit',
    traiter: function (ctx) {
      ecrireChaine(ctx.db, { blocs: [], difficulte: PARAMS_DEFAUT.difficulte, compteur: PARAMS_DEFAUT.compteur });
      return {
        statut: 200,
        corps: { message: 'Chaîne réinitialisée : aucun bloc.', chaine: lireChaine(ctx.db) }
      };
    }
  }
];

/* ---------- Démarrage ---------- */

const fs = require('node:fs');
fs.mkdirSync(path.dirname(BASE), { recursive: true });

creerServeur({
  nom: 'Blockchain — full-stack',
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
