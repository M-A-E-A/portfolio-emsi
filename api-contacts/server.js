'use strict';

/* =========================================================
   API Contacts — serveur full-stack
   Node.js natif (node:http) + base SQLite (node:sqlite).
   Aucune dépendance npm : `node server.js` suffit.
   Lancement : node server.js   puis   http://localhost:3101
   Variables d'environnement : PORT (port d'écoute),
                               BASE (chemin de la base SQLite).
   ========================================================= */

const path = require('node:path');
const { creerServeur, normaliser } = require('../serveur/commun.js');

const PORT = parseInt(process.env.PORT || '3101', 10);
const BASE = process.env.BASE || path.join(__dirname, 'donnees', 'bdd.sqlite');

/* ---------- Règles de validation (mêmes messages que le simulateur) ---------- */

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TRI_AUTORISES = ['id', 'nom', 'ville'];
const SENS_AUTORISES = ['asc', 'desc'];
const CHAMPS_MODIFIABLES = ['nom', 'email', 'ville', 'telephone'];

function texte(v) { return typeof v === 'string' ? v.trim() : ''; }

/* Validation partagée par POST, PUT et PATCH.
   En mode partiel (PATCH), seuls les champs présents sont vérifiés. */
function valider(donnees, partiel) {
  const d = donnees && typeof donnees === 'object' ? donnees : {};
  const erreurs = {};
  const present = function (champ) {
    return !partiel || Object.prototype.hasOwnProperty.call(d, champ);
  };
  if (present('nom') && !texte(d.nom)) erreurs.nom = 'Le nom est obligatoire.';
  if (present('email')) {
    if (!texte(d.email)) erreurs.email = "L'e-mail est obligatoire.";
    else if (!RE_EMAIL.test(texte(d.email))) erreurs.email = "Format d'e-mail invalide (ex. prenom.nom@example.ma).";
  }
  return erreurs;
}

/* Entier >= 1 attendu (page, limit). */
function entierPositif(valeur, defaut) {
  if (valeur === undefined || valeur === null || String(valeur).trim() === '') {
    return { ok: true, valeur: defaut };
  }
  const brut = String(valeur).trim();
  if (!/^[0-9]+$/.test(brut)) return { ok: false, valeur: defaut };
  const n = parseInt(brut, 10);
  if (!isFinite(n) || n < 1) return { ok: false, valeur: defaut };
  return { ok: true, valeur: n };
}

/* ---------- Jeu de démonstration (identique au frontend) ---------- */

const EXEMPLES = [
  { nom: 'Yasmine El Amrani',    email: 'yasmine.elamrani@example.ma', ville: 'Marrakech', telephone: '+212 6 12 34 56 78' },
  { nom: 'Omar Benjelloun',      email: 'omar.benjelloun@example.ma',   ville: 'Casablanca', telephone: '+212 6 61 22 33 44' },
  { nom: 'Salma Bouzid',         email: 'salma.bouzid@example.ma',       ville: 'Rabat',      telephone: '+212 6 55 77 88 99' },
  { nom: 'Mehdi Tazi',           email: 'mehdi.tazi@example.ma',         ville: 'Tanger',     telephone: '+212 6 70 11 22 33' },
  { nom: 'Karim El Fassi',       email: 'karim.elfassi@example.ma',      ville: 'Fès',        telephone: '+212 6 33 44 55 66' },
  { nom: 'Nadia Chraibi',        email: 'nadia.chraibi@example.ma',      ville: 'Agadir',     telephone: '+212 6 40 55 66 77' },
  { nom: 'Youssef Alaoui',       email: 'youssef.alaoui@example.ma',     ville: 'Oujda',      telephone: '+212 6 22 11 00 99' },
  { nom: 'Fatima Zahra Idrissi', email: 'fatima.idrissi@example.ma',     ville: 'Meknès',     telephone: '+212 6 88 99 00 11' }
];

/* ---------- Schéma de la base ----------
   Deux colonnes « fantômes » (recherche, tri_*) stockent la version
   normalisée (sans accent, minuscules) : elles permettent une
   recherche et un tri insensibles aux accents EN SQL, sans charger
   toute la table en mémoire. Recalculées à chaque écriture. */

function preparerBase(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      nom       TEXT    NOT NULL,
      email     TEXT    NOT NULL,
      ville     TEXT    NOT NULL DEFAULT '',
      telephone TEXT    NOT NULL DEFAULT '',
      recherche TEXT    NOT NULL DEFAULT '',
      tri_nom   TEXT    NOT NULL DEFAULT '',
      tri_ville TEXT    NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_contacts_tri_nom   ON contacts(tri_nom);
    CREATE INDEX IF NOT EXISTS idx_contacts_tri_ville ON contacts(tri_ville);
    CREATE INDEX IF NOT EXISTS idx_contacts_recherche ON contacts(recherche);
  `);
}

/* Recalcule les colonnes normalisées d'une ligne. */
function normalises(nom, email, ville, telephone) {
  return {
    recherche: normaliser(nom + ' ' + email + ' ' + ville + ' ' + telephone),
    tri_nom: normaliser(nom),
    tri_ville: normaliser(ville)
  };
}

/* Insère les 8 contacts de démonstration (premier lancement uniquement). */
function semer(db) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM contacts').get().n;
  if (n > 0) return;
  const ins = db.prepare(
    'INSERT INTO contacts (nom, email, ville, telephone, recherche, tri_nom, tri_ville) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const transaction = db.prepare('BEGIN');
  transaction.run();
  try {
    EXEMPLES.forEach(function (c) {
      const nrm = normalises(c.nom, c.email, c.ville, c.telephone);
      ins.run(c.nom, c.email, c.ville, c.telephone, nrm.recherche, nrm.tri_nom, nrm.tri_ville);
    });
    db.prepare('COMMIT').run();
    console.log('  • 8 contacts de démonstration insérés.');
  } catch (e) {
    db.prepare('ROLLBACK').run();
    throw e;
  }
}

/* Public : retire les colonnes techniques avant d'envoyer la réponse. */
function publique(c) {
  return { id: c.id, nom: c.nom, email: c.email, ville: c.ville, telephone: c.telephone };
}

/* ---------- Routes ---------- */

const routes = [
  /* Sonde de détection du mode full-stack (utilisée par shared/api-client.js). */
  {
    methode: 'GET', motif: '/api/sante',
    traiter: function () {
      return { statut: 200, corps: { serveur: true, nom: 'API Contacts (Node + SQLite)', version: '1.0.0' } };
    }
  },

  /* GET /api/contacts — recherche, tri, pagination. */
  {
    methode: 'GET', motif: '/api/contacts',
    traiter: function (ctx) {
      const p = ctx.query || {};

      const details = {};
      const page = entierPositif(p.page, 1);
      if (!page.ok) details.page = 'Le paramètre « page » doit être un entier supérieur ou égal à 1.';
      const limit = entierPositif(p.limit, 5);
      if (!limit.ok) details.limit = 'Le paramètre « limit » doit être un entier supérieur ou égal à 1.';
      if (Object.keys(details).length) {
        return {
          statut: 400,
          corps: {
            erreur: 'Paramètres de requête invalides',
            message: 'Les paramètres « page » et « limit » doivent être des entiers supérieurs ou égaux à 1.',
            details: details
          }
        };
      }

      const q = texte(p.q);
      const tri = TRI_AUTORISES.indexOf(p.tri) !== -1 ? p.tri : 'id';
      const sens = SENS_AUTORISES.indexOf(p.sens) !== -1 ? p.sens : 'asc';
      const limite = Math.min(limit.valeur, 50);

      /* Le tri se fait sur la colonne normalisée correspondante. */
      const colonneTri = tri === 'nom' ? 'tri_nom' : tri === 'ville' ? 'tri_ville' : 'id';

      let sql = 'SELECT * FROM contacts';
      const args = [];
      if (q) {
        /* Recherche insensible aux accents : la requête est normalisée
           puis cherchée dans la colonne « recherche ». */
        sql += ' WHERE recherche LIKE ?';
        args.push('%' + normaliser(q) + '%');
      }
      sql += ' ORDER BY ' + colonneTri + ' ' + (sens === 'desc' ? 'DESC' : 'ASC') + ', id ASC';

      const lignes = ctx.db.prepare(sql).all(...args);
      const total = lignes.length;
      const pages = Math.max(1, Math.ceil(total / limite));
      const debut = (page.valeur - 1) * limite;
      const donnees = lignes.slice(debut, debut + limite).map(publique);

      return {
        statut: 200,
        corps: {
          donnees: donnees,
          meta: { page: page.valeur, limit: limite, total: total, pages: pages, q: q, tri: tri, sens: sens }
        }
      };
    }
  },

  /* GET /api/contacts/:id */
  {
    methode: 'GET', motif: '/api/contacts/:id',
    traiter: function (ctx) {
      const id = parseInt(ctx.params.id, 10);
      if (!Number.isInteger(id) || id < 1) return { statut: 404, corps: { erreur: 'Contact introuvable', id: ctx.params.id } };
      const c = ctx.db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
      if (!c) return { statut: 404, corps: { erreur: 'Contact introuvable', id: id } };
      return { statut: 200, corps: publique(c) };
    }
  },

  /* POST /api/contacts */
  {
    methode: 'POST', motif: '/api/contacts',
    traiter: function (ctx) {
      const erreurs = valider(ctx.corps);
      if (Object.keys(erreurs).length) {
        return { statut: 400, corps: { erreur: 'Données invalides', details: erreurs } };
      }
      const nom = texte(ctx.corps.nom);
      const email = texte(ctx.corps.email);
      const ville = texte(ctx.corps.ville);
      const telephone = texte(ctx.corps.telephone);
      const nrm = normalises(nom, email, ville, telephone);
      const r = ctx.db.prepare(
        'INSERT INTO contacts (nom, email, ville, telephone, recherche, tri_nom, tri_ville) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(nom, email, ville, telephone, nrm.recherche, nrm.tri_nom, nrm.tri_ville);
      return { statut: 201, corps: { id: Number(r.lastInsertRowid), nom: nom, email: email, ville: ville, telephone: telephone } };
    }
  },

  /* PUT /api/contacts/:id — remplacement intégral. */
  {
    methode: 'PUT', motif: '/api/contacts/:id',
    traiter: function (ctx) { return modifierContact(ctx, false); }
  },

  /* PATCH /api/contacts/:id — mise à jour partielle. */
  {
    methode: 'PATCH', motif: '/api/contacts/:id',
    traiter: function (ctx) { return modifierContact(ctx, true); }
  },

  /* DELETE /api/contacts/:id */
  {
    methode: 'DELETE', motif: '/api/contacts/:id',
    traiter: function (ctx) {
      const id = parseInt(ctx.params.id, 10);
      const r = ctx.db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
      if (!r.changes) return { statut: 404, corps: { erreur: 'Contact introuvable', id: ctx.params.id } };
      return { statut: 204, corps: null };
    }
  },

  /* POST /api/reinitialiser — vide la table puis réinsère les exemples. */
  {
    methode: 'POST', motif: '/api/reinitialiser',
    traiter: function (ctx) {
      ctx.db.exec('DELETE FROM contacts');
      ctx.db.exec("DELETE FROM sqlite_sequence WHERE name = 'contacts'");
      semer(ctx.db);
      return { statut: 200, corps: { message: 'Base réinitialisée : 8 contacts de démonstration.' } };
    }
  }
];

/* PUT (partiel=false) et PATCH (partiel=true) partagent le même corps. */
function modifierContact(ctx, partiel) {
  const id = parseInt(ctx.params.id, 10);
  const existant = ctx.db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  if (!existant) return { statut: 404, corps: { erreur: 'Contact introuvable', id: ctx.params.id } };

  const d = ctx.corps && typeof ctx.corps === 'object' ? ctx.corps : {};

  if (partiel) {
    const champs = CHAMPS_MODIFIABLES.filter(function (champ) {
      return Object.prototype.hasOwnProperty.call(d, champ);
    });
    if (!champs.length) {
      return {
        statut: 400,
        corps: { erreur: 'Aucun champ à mettre à jour', message: 'Fournissez au moins un champ modifiable.', champs: CHAMPS_MODIFIABLES }
      };
    }
  }

  const erreurs = valider(d, partiel);
  if (Object.keys(erreurs).length) {
    return { statut: 400, corps: { erreur: 'Données invalides', details: erreurs } };
  }

  const contact = {
    nom: partiel && !Object.prototype.hasOwnProperty.call(d, 'nom') ? existant.nom : texte(d.nom),
    email: partiel && !Object.prototype.hasOwnProperty.call(d, 'email') ? existant.email : texte(d.email),
    ville: partiel && !Object.prototype.hasOwnProperty.call(d, 'ville') ? existant.ville : texte(d.ville),
    telephone: partiel && !Object.prototype.hasOwnProperty.call(d, 'telephone') ? existant.telephone : texte(d.telephone)
  };
  const nrm = normalises(contact.nom, contact.email, contact.ville, contact.telephone);
  ctx.db.prepare(
    'UPDATE contacts SET nom = ?, email = ?, ville = ?, telephone = ?, recherche = ?, tri_nom = ?, tri_ville = ? WHERE id = ?'
  ).run(contact.nom, contact.email, contact.ville, contact.telephone, nrm.recherche, nrm.tri_nom, nrm.tri_ville, id);

  return { statut: 200, corps: Object.assign({ id: id }, contact) };
}

/* ---------- Démarrage ---------- */

const fs = require('node:fs');
fs.mkdirSync(path.dirname(BASE), { recursive: true });

creerServeur({
  nom: 'API Contacts — full-stack',
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
