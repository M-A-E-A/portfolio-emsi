'use strict';

/* =========================================================
   Messagerie en temps réel — serveur full-stack
   Node.js natif (node:http) + base SQLite (node:sqlite).
   Aucune dépendance npm : `node server.js` suffit.
   Lancement : node server.js   puis   http://localhost:3104
   Variables d'environnement : PORT (port d'écoute),
                               BASE (chemin de la base SQLite).
   Temps réel : hub SSE (flux de serveur/commun.js) — route
   GET /api/flux. Chaque mutation persistée diffuse un événement
   « message » que les clients traduisent par un rechargement
   complet (synchroniser() côté front).
   ========================================================= */

const fs = require('node:fs');
const path = require('node:path');
const { creerServeur } = require('../serveur/commun.js');

const PORT = parseInt(process.env.PORT || '3104', 10);
/* Base posée À LA RACINE du repo (jamais servie en statique). */
const BASE = process.env.BASE || path.join(__dirname, '..', 'donnees-messagerie', 'bdd.sqlite');

/* ---------- Petits utilitaires ---------- */

function texte(v) { return typeof v === 'string' ? v.trim() : ''; }

/* Analyse un champ JSON stocké en TEXT ; renvoie la valeur par défaut si absent/illisible. */
function analyser(valeur, defaut) {
  if (valeur === null || valeur === undefined || valeur === '') return defaut;
  try { return JSON.parse(valeur); } catch (e) { return defaut; }
}

/* ---------- Jeu de démonstration (identique au frontend) ---------- */

/* Date d'hier à `h`:`m` (heure locale) : toujours dans le passé. */
function hierA(h, m) {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/* Date d'il y a quelques minutes, sans jamais franchir minuit vers hier. */
function ilYA(minutes) {
  const d = new Date();
  const minutesDuJour = d.getHours() * 60 + d.getMinutes();
  d.setMinutes(d.getMinutes() - Math.min(minutes, Math.max(0, minutesDuJour - 1)));
  d.setSeconds(0, 0);
  return d.toISOString();
}

const SALONS_EXEMPLE = [
  { id: 'general', nom: 'général' },
  { id: 'projet', nom: 'projet' },
  { id: 'aide', nom: 'aide' }
];

const MESSAGES_EXEMPLE = [
  { id: 'exemple-1', salonId: 'general', auteur: 'Amina',   texte: 'Bonjour tout le monde ! Le dépôt est prêt, on peut commencer.', date: hierA(9, 12) },
  { id: 'exemple-2', salonId: 'general', auteur: 'Yassine', texte: 'Parfait. Je m’occupe de la mise en page ce matin.',               date: hierA(9, 31) },
  { id: 'exemple-3', salonId: 'projet',  auteur: 'Sofia',   texte: 'J’ai poussé la structure HTML, il reste à habiller.',             date: hierA(16, 5) },
  { id: 'exemple-4', salonId: 'aide',    auteur: 'Karim',   texte: 'Quelqu’un sait comment on ouvre un second onglet pour tester ?', date: hierA(18, 44) },
  { id: 'exemple-5', salonId: 'general', auteur: 'Sofia',   texte: 'Petit rappel : le point de suivi est à 14 h.',                    date: ilYA(14) },
  { id: 'exemple-6', salonId: 'projet',  auteur: 'Yassine', texte: 'La feuille de style est terminée, je passe aux tests.',           date: ilYA(9) },
  { id: 'exemple-7', salonId: 'aide',    auteur: 'Amina',   texte: 'Oui : ouvrez cette page dans un second onglet et écrivez, tout apparaît en direct.', date: ilYA(4) }
];

/* ---------- Schéma de la base ----------
   salons : la colonne « epingle » référence (logiquement) l'id du message
   épinglé du salon ; on ne pose pas de clé étrangère dessus car
   l'épingle peut être retirée dans n'importe quel ordre.
   messages.salon_id : vraie clé étrangère, suppression en cascade
   (vider/supprimer un salon emporte ses messages). */

function preparerBase(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS salons (
      id      TEXT PRIMARY KEY,
      nom     TEXT NOT NULL,
      epingle TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
      id        TEXT PRIMARY KEY,
      salon_id  TEXT NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
      auteur    TEXT NOT NULL,
      texte     TEXT NOT NULL,
      date      TEXT NOT NULL,
      repond_a  TEXT,
      modifie   INTEGER NOT NULL DEFAULT 0,
      reactions TEXT,
      vu        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_messages_salon ON messages(salon_id);
    CREATE INDEX IF NOT EXISTS idx_messages_date  ON messages(date);
  `);
}

/* Insère les 3 salons et 7 messages d'exemple (premier lancement seulement). */
function semer(db) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM salons').get().n;
  if (n > 0) return;
  const insSalon = db.prepare('INSERT INTO salons (id, nom, epingle) VALUES (?, ?, ?)');
  const insMessage = db.prepare(
    'INSERT INTO messages (id, salon_id, auteur, texte, date, repond_a, modifie, reactions, vu) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  db.prepare('BEGIN').run();
  try {
    SALONS_EXEMPLE.forEach(function (s) { insSalon.run(s.id, s.nom, null); });
    MESSAGES_EXEMPLE.forEach(function (m) {
      insMessage.run(m.id, m.salonId, m.auteur, m.texte, m.date, null, 0, null, null);
    });
    db.prepare('COMMIT').run();
    console.log('  • 3 salons et 7 messages de démonstration insérés.');
  } catch (e) {
    db.prepare('ROLLBACK').run();
    throw e;
  }
}

/* ---------- Formes publiques (identiques au front) ---------- */

function salonPublic(s) {
  const d = { id: s.id, nom: s.nom };
  if (s.epingle) d.epingle = s.epingle;
  return d;
}

function messagePublic(m) {
  const d = { id: m.id, salonId: m.salon_id, auteur: m.auteur, texte: m.texte, date: m.date };
  const repondA = analyser(m.repond_a, null);
  if (repondA) d.repondA = repondA;
  if (m.modifie) d.modifie = true;
  const reactions = analyser(m.reactions, null);
  if (reactions) d.reactions = reactions;
  const vu = analyser(m.vu, null);
  if (vu) d.vu = vu;
  return d;
}

function lireSalons(db) {
  return db.prepare('SELECT * FROM salons ORDER BY rowid ASC').all().map(salonPublic);
}

function lireMessages(db, salonId) {
  if (salonId) {
    return db.prepare('SELECT * FROM messages WHERE salon_id = ? ORDER BY date ASC, rowid ASC')
      .all(salonId).map(messagePublic);
  }
  return db.prepare('SELECT * FROM messages ORDER BY date ASC, rowid ASC').all().map(messagePublic);
}

/* ---------- Diffusion temps réel ---------- */

/* Signale à tous les clients qu'un rafraîchissement complet s'impose.
   Le front réutilise sa fonction traiterSignal() : type « message ». */
function prevenir(ctx, salonId) {
  ctx.flux.publier('message', { type: 'message', salonId: salonId || null });
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

  /* GET /api/salons */
  {
    methode: 'GET', motif: '/api/salons',
    traiter: function (ctx) {
      return { statut: 200, corps: { donnees: lireSalons(ctx.db) } };
    }
  },

  /* POST /api/salons — mêmes règles de validation que le formulaire du front. */
  {
    methode: 'POST', motif: '/api/salons',
    traiter: function (ctx) {
      const d = ctx.corps && typeof ctx.corps === 'object' ? ctx.corps : {};
      const nom = texte(d.nom);
      const details = {};
      if (!nom) details.nom = 'Le nom du salon ne peut pas être vide.';
      if (nom) {
        const doublon = ctx.db.prepare('SELECT 1 FROM salons WHERE lower(nom) = lower(?)').get(nom);
        if (doublon) details.nom = 'Un salon porte déjà ce nom.';
      }
      if (Object.keys(details).length) {
        return { statut: 400, corps: { erreur: 'Données invalides', details: details } };
      }

      const id = texte(d.id) || ('salon-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7));
      const epingle = texte(d.epingle) || null;
      ctx.db.prepare('INSERT INTO salons (id, nom, epingle) VALUES (?, ?, ?)').run(id, nom, epingle);
      prevenir(ctx, id);
      return { statut: 201, corps: { id: id, nom: nom, epingle: epingle || undefined } };
    }
  },

  /* GET /api/salons/:id */
  {
    methode: 'GET', motif: '/api/salons/:id',
    traiter: function (ctx) {
      const s = ctx.db.prepare('SELECT * FROM salons WHERE id = ?').get(ctx.params.id);
      if (!s) return { statut: 404, corps: { erreur: 'Salon introuvable', id: ctx.params.id } };
      return { statut: 200, corps: salonPublic(s) };
    }
  },

  /* PUT /api/salons/:id — nom et/ou épingle (le front envoie le salon complet). */
  {
    methode: 'PUT', motif: '/api/salons/:id',
    traiter: function (ctx) {
      const existant = ctx.db.prepare('SELECT * FROM salons WHERE id = ?').get(ctx.params.id);
      if (!existant) return { statut: 404, corps: { erreur: 'Salon introuvable', id: ctx.params.id } };

      const d = ctx.corps && typeof ctx.corps === 'object' ? ctx.corps : {};
      const nom = Object.prototype.hasOwnProperty.call(d, 'nom') ? texte(d.nom) : existant.nom;
      if (!nom) {
        return {
          statut: 400,
          corps: { erreur: 'Données invalides', details: { nom: 'Le nom du salon ne peut pas être vide.' } }
        };
      }
      const epingle = Object.prototype.hasOwnProperty.call(d, 'epingle') ? (texte(d.epingle) || null) : existant.epingle;
      ctx.db.prepare('UPDATE salons SET nom = ?, epingle = ? WHERE id = ?').run(nom, epingle, ctx.params.id);
      prevenir(ctx, ctx.params.id);
      return { statut: 200, corps: { id: ctx.params.id, nom: nom, epingle: epingle || undefined } };
    }
  },

  /* DELETE /api/salons/:id — les messages partent en cascade. */
  {
    methode: 'DELETE', motif: '/api/salons/:id',
    traiter: function (ctx) {
      const r = ctx.db.prepare('DELETE FROM salons WHERE id = ?').run(ctx.params.id);
      if (!r.changes) return { statut: 404, corps: { erreur: 'Salon introuvable', id: ctx.params.id } };
      prevenir(ctx, null);
      return { statut: 204, corps: null };
    }
  },

  /* GET /api/messages?salonId=… */
  {
    methode: 'GET', motif: '/api/messages',
    traiter: function (ctx) {
      return { statut: 200, corps: { donnees: lireMessages(ctx.db, texte(ctx.query.salonId) || null) } };
    }
  },

  /* POST /api/messages */
  {
    methode: 'POST', motif: '/api/messages',
    traiter: function (ctx) {
      const d = ctx.corps && typeof ctx.corps === 'object' ? ctx.corps : {};
      const salonId = texte(d.salonId);
      const auteur = texte(d.auteur);
      const corps = texte(d.texte);
      const details = {};
      if (!salonId) details.salonId = 'Le salon est obligatoire.';
      else if (!ctx.db.prepare('SELECT 1 FROM salons WHERE id = ?').get(salonId)) details.salonId = 'Salon inconnu.';
      if (!auteur) details.auteur = "L'auteur est obligatoire.";
      if (!corps) details.texte = 'Le message ne peut pas être vide.';
      if (Object.keys(details).length) {
        return { statut: 400, corps: { erreur: 'Données invalides', details: details } };
      }

      const id = texte(d.id) || ('msg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7));
      const date = texte(d.date) || new Date().toISOString();
      const repondA = d.repondA && typeof d.repondA === 'object' ? JSON.stringify(d.repondA) : null;
      ctx.db.prepare(
        'INSERT INTO messages (id, salon_id, auteur, texte, date, repond_a, modifie, reactions, vu) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)'
      ).run(id, salonId, auteur, corps, date, repondA,
            d.reactions && typeof d.reactions === 'object' ? JSON.stringify(d.reactions) : null,
            d.vu && typeof d.vu === 'object' ? JSON.stringify(d.vu) : null);
      prevenir(ctx, salonId);
      return { statut: 201, corps: messagePublic(ctx.db.prepare('SELECT * FROM messages WHERE id = ?').get(id)) };
    }
  },

  /* PUT /api/messages/:id — champs modifiables : texte, modifié, réactions, vus.
     L'auteur, le salon et la date sont immuables. */
  {
    methode: 'PUT', motif: '/api/messages/:id',
    traiter: function (ctx) {
      const existant = ctx.db.prepare('SELECT * FROM messages WHERE id = ?').get(ctx.params.id);
      if (!existant) return { statut: 404, corps: { erreur: 'Message introuvable', id: ctx.params.id } };

      const d = ctx.corps && typeof ctx.corps === 'object' ? ctx.corps : {};
      const corps = Object.prototype.hasOwnProperty.call(d, 'texte') ? texte(d.texte) : existant.texte;
      if (!corps) {
        return {
          statut: 400,
          corps: { erreur: 'Données invalides', details: { texte: 'Le message ne peut pas être vide.' } }
        };
      }
      const modifie = (Object.prototype.hasOwnProperty.call(d, 'modifie') ? d.modifie : existant.modifie) ? 1 : 0;
      const reactions = Object.prototype.hasOwnProperty.call(d, 'reactions')
        ? (d.reactions && typeof d.reactions === 'object' ? JSON.stringify(d.reactions) : null)
        : existant.reactions;
      const vu = Object.prototype.hasOwnProperty.call(d, 'vu')
        ? (d.vu && typeof d.vu === 'object' ? JSON.stringify(d.vu) : null)
        : existant.vu;
      const repondA = Object.prototype.hasOwnProperty.call(d, 'repondA')
        ? (d.repondA && typeof d.repondA === 'object' ? JSON.stringify(d.repondA) : null)
        : existant.repond_a;

      ctx.db.prepare(
        'UPDATE messages SET texte = ?, modifie = ?, reactions = ?, vu = ?, repond_a = ? WHERE id = ?'
      ).run(corps, modifie, reactions, vu, repondA, ctx.params.id);
      prevenir(ctx, existant.salon_id);
      return { statut: 200, corps: messagePublic(ctx.db.prepare('SELECT * FROM messages WHERE id = ?').get(ctx.params.id)) };
    }
  },

  /* DELETE /api/messages/:id */
  {
    methode: 'DELETE', motif: '/api/messages/:id',
    traiter: function (ctx) {
      const existant = ctx.db.prepare('SELECT * FROM messages WHERE id = ?').get(ctx.params.id);
      if (!existant) return { statut: 404, corps: { erreur: 'Message introuvable', id: ctx.params.id } };
      ctx.db.prepare('DELETE FROM messages WHERE id = ?').run(ctx.params.id);
      /* Une épingle qui pointait vers ce message est retirée (comme le fait le front). */
      ctx.db.prepare('UPDATE salons SET epingle = NULL WHERE epingle = ?').run(ctx.params.id);
      prevenir(ctx, existant.salon_id);
      return { statut: 204, corps: null };
    }
  },

  /* POST /api/reinit — vide tout puis réinsère le jeu de démonstration. */
  {
    methode: 'POST', motif: '/api/reinit',
    traiter: function (ctx) {
      ctx.db.exec('DELETE FROM messages');
      ctx.db.exec('DELETE FROM salons');
      semer(ctx.db);
      prevenir(ctx, null);
      return { statut: 200, corps: { message: 'Base réinitialisée : 3 salons et 7 messages de démonstration.' } };
    }
  },

  /* POST /api/saisie — relais de l'indicateur « est en train d'écrire… ».
     Rien n'est persisté : on retransmet tel quel à tous les clients. */
  {
    methode: 'POST', motif: '/api/saisie',
    traiter: function (ctx) {
      const d = ctx.corps && typeof ctx.corps === 'object' ? ctx.corps : {};
      const auteur = texte(d.auteur);
      if (!auteur) return { statut: 400, corps: { erreur: 'Données invalides', details: { auteur: "L'auteur est obligatoire." } } };
      ctx.flux.publier('saisie', { type: 'saisie', salonId: texte(d.salonId) || null, auteur: auteur });
      return { statut: 204, corps: null };
    }
  }
];

/* ---------- Démarrage ---------- */

fs.mkdirSync(path.dirname(BASE), { recursive: true });

creerServeur({
  nom: 'Messagerie temps réel — full-stack',
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
