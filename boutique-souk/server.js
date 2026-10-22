'use strict';

/* =========================================================
   Souk — serveur full-stack
   Node.js natif (node:http) + base SQLite (node:sqlite).
   Aucune dépendance npm : `node server.js` suffit.
   Lancement : node server.js   puis   http://localhost:3103
   Variables d'environnement : PORT (port d'écoute),
                               BASE (chemin de la base SQLite).
   ========================================================= */

const path = require('node:path');
const { creerServeur, normaliser } = require('../serveur/commun.js');

const PORT = parseInt(process.env.PORT || '3103', 10);
const BASE = process.env.BASE || path.join(__dirname, '..', 'donnees-boutique', 'bdd.sqlite');

/* ---------- Règles partagées (identiques au front) ---------- */

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SEUIL_LIVRAISON = 500;   // livraison offerte dès 500 MAD
const FRAIS_LIVRAISON = 30;    // sinon 30 MAD
const CATEGORIES = ['Cuisine', 'Textile', 'Luminaires', 'Décoration'];

function texte(v) { return typeof v === 'string' ? v.trim() : ''; }

/* ---------- Catalogue de démonstration (identique au frontend) ---------- */

const ARTICLES = [
  {
    id: 'theiere', nom: 'Théière en cuivre', prix: 180, categorie: 'Cuisine', stock: 8,
    accroche: "Cuivre martelé à la main, bec verseur fin et poignée torsadée.",
    description: "Théière en cuivre au fini martelé, pensée pour le thé à la menthe. "
      + "Le bec verseur fin limite les gouttes et la poignée torsadée reste facile à saisir. "
      + "Chaque pièce est un peu différente, le cuivre étant travaillé à la main.",
    details: {
      'Matière': 'Cuivre martelé',
      'Dimensions': 'Hauteur 22 cm · contenance 0,9 L',
      'Entretien': 'Lavage à la main, essuyer après usage',
      'Finition': 'Martelée'
    }
  },
  {
    id: 'plateau', nom: 'Plateau en cèdre', prix: 240, categorie: 'Cuisine', stock: 5,
    accroche: "Bois de cèdre massif, bord relevé, veinage naturel apparent.",
    description: "Plateau taillé dans une pièce de cèdre massif, avec un bord légèrement relevé. "
      + "Le veinage naturel varie d'un plateau à l'autre. "
      + "La surface est poncée puis huilée pour résister à l'usage quotidien.",
    details: {
      'Matière': 'Cèdre massif',
      'Dimensions': '42 × 30 × 3 cm',
      'Entretien': 'Essuyer avec un chiffon humide',
      'Finition': 'Huilée'
    }
  },
  {
    id: 'verres', nom: 'Verres à thé (x6)', prix: 150, categorie: 'Cuisine', stock: 14,
    accroche: "Six verres gravés, parfaits pour le thé à la menthe.",
    description: "Série de six verres à thé gravés d'un motif géométrique discret. "
      + "Le verre épais garde la chaleur plus longtemps et supporte les boissons chaudes. "
      + "Ils se rangent facilement et se lavent sans difficulté.",
    details: {
      'Matière': 'Verre',
      'Dimensions': 'Hauteur 11 cm · contenance 20 cl',
      'Entretien': 'Lavage à la main conseillé',
      'Finition': 'Gravée'
    }
  },
  {
    id: 'tapis', nom: 'Tapis berbère', prix: 950, categorie: 'Textile', stock: 3,
    accroche: "Laine nouée à la main, motifs géométriques des Beni Ouarain.",
    description: "Tapis en laine nouée à la main, aux motifs géométriques inspirés des tapis Beni Ouarain. "
      + "La laine épaisse apporte un confort chaud et s'use lentement. "
      + "Les teintes naturelles varient légèrement d'une pièce à l'autre.",
    details: {
      'Matière': 'Laine nouée main',
      'Dimensions': '200 × 140 cm',
      'Entretien': 'Aspirer sans brosse, nettoyage à sec',
      'Finition': 'Motifs géométriques'
    }
  },
  {
    id: 'coussin', nom: 'Coussin brodé', prix: 120, categorie: 'Textile', stock: 20,
    accroche: "Housse en coton, broderie au fil de soie, fermeture zippée.",
    description: "Coussin avec housse en coton et broderie au fil de soie. "
      + "La fermeture zippée permet de retirer la housse pour l'entretien. "
      + "Le garnissage est ferme, adapté à un canapé comme à un lit.",
    details: {
      'Matière': 'Coton, broderie fil de soie',
      'Dimensions': '45 × 45 cm',
      'Entretien': 'Housse déhoussable, lavage 30 °C',
      'Finition': 'Broderie'
    }
  },
  {
    id: 'lampe', nom: 'Lampe en laiton', prix: 320, categorie: 'Luminaires', stock: 6,
    accroche: "Laiton poli, lumière tamisée, interrupteur sur cordon.",
    description: "Lampe en laiton poli qui diffuse une lumière tamisée. "
      + "L'interrupteur se trouve sur le cordon, ce qui laisse le pied libre de tout bouton. "
      + "Elle éclaire un coin de salon ou une tête de lit.",
    details: {
      'Matière': 'Laiton poli',
      'Dimensions': 'Hauteur 38 cm · câble 1,8 m',
      'Entretien': 'Chiffon doux, produit non abrasif',
      'Finition': 'Polie'
    }
  },
  {
    id: 'lanterne', nom: 'Lanterne en fer forgé', prix: 280, categorie: 'Luminaires', stock: 9,
    accroche: "Fer forgé patiné, verre coloré, se pose ou se suspend.",
    description: "Lanterne en fer forgé patiné, montée avec des verres colorés. "
      + "Elle se pose sur une table ou se suspend grâce à son anneau. "
      + "La lumière filtrée dessine des motifs sur les murs.",
    details: {
      'Matière': 'Fer forgé, verre coloré',
      'Dimensions': 'Hauteur 30 cm · diamètre 16 cm',
      'Entretien': 'Chiffon sec',
      'Finition': 'Patinée'
    }
  },
  {
    id: 'miroir', nom: 'Miroir peint', prix: 410, categorie: 'Décoration', stock: 4,
    accroche: "Cadre en bois peint à la main, finition mat, accroche incluse.",
    description: "Miroir encadré d'un bois peint à la main, à la finition mate. "
      + "L'accroche est fournie et le cadre reste assez léger pour un mur creux. "
      + "Il se pose aussi bien à l'entrée que dans une chambre.",
    details: {
      'Matière': 'Bois peint, verre',
      'Dimensions': '50 × 70 cm',
      'Entretien': 'Chiffon doux, éviter l’humidité',
      'Finition': 'Mate'
    }
  }
];

/* Jeu d'avis de départ (identique à avisDepart() du front). */
const AVIS_DEPART = [
  { id: 'avis-v1', article_id: 'theiere', auteur: 'Salma B.', note: 5, date: '2026-02-14T10:12:00.000Z',
    texte: "Le bec ne goutte pas et le cuivre a une belle couleur. Je l'utilise tous les jours depuis un mois." },
  { id: 'avis-v2', article_id: 'theiere', auteur: 'Yassine R.', note: 4, date: '2026-03-02T18:40:00.000Z',
    texte: "Bonne contenance pour six verres. Un peu lourde à vide, mais ça ne me gêne pas." },
  { id: 'avis-v3', article_id: 'tapis', auteur: 'Nadia K.', note: 5, date: '2026-01-21T09:05:00.000Z',
    texte: "Laine épaisse et motifs bien nets. Les couleurs sont proches des photos." },
  { id: 'avis-v4', article_id: 'tapis', auteur: 'Omar T.', note: 4, date: '2026-02-27T16:20:00.000Z',
    texte: "Tapis chaud et dense. Il perd un peu de laine au début, c'est normal pour cette matière." },
  { id: 'avis-v5', article_id: 'lampe', auteur: 'Imane Z.', note: 4, date: '2026-03-11T20:15:00.000Z',
    texte: "Lumière douce et pied stable. Le cordon est un peu court pour ma table de chevet." },
  { id: 'avis-v6', article_id: 'verres', auteur: 'Karim L.', note: 5, date: '2026-02-05T11:30:00.000Z',
    texte: "Six verres solides et la gravure reste discrète. Lavés à la main sans souci." },
  { id: 'avis-v7', article_id: 'verres', auteur: 'Hind M.', note: 3, date: '2026-03-19T08:50:00.000Z',
    texte: "Jolis verres mais plus petits que je pensais. Bon rapport qualité-prix malgré tout." }
];

/* ---------- Schéma de la base ----------
   articles : le catalogue (les identifiants texte « theiere », « tapis »…
     sont ceux utilisés partout côté front : panier, favoris, avis).
     « recherche » et « tri_nom » stockent la version normalisée (sans
     accent, minuscules) pour trier/chercher en SQL, insensibles aux accents.
   avis     : un avis par ligne, rattaché à son article (clé étrangère).
   panier   : une ligne par article du panier (remplacée à chaque PUT).
   favoris  : table d'associations (article_id seul).
   commandes: journal des commandes validées côté client. */

function preparerBase(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id          TEXT    PRIMARY KEY,
      nom         TEXT    NOT NULL,
      prix        INTEGER NOT NULL CHECK (prix >= 0),
      categorie   TEXT    NOT NULL,
      stock       INTEGER NOT NULL CHECK (stock >= 0),
      accroche    TEXT    NOT NULL,
      description TEXT    NOT NULL,
      details     TEXT    NOT NULL,
      recherche   TEXT    NOT NULL DEFAULT '',
      tri_nom     TEXT    NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_articles_categorie ON articles(categorie);
    CREATE INDEX IF NOT EXISTS idx_articles_tri_nom   ON articles(tri_nom);
    CREATE INDEX IF NOT EXISTS idx_articles_recherche ON articles(recherche);
    CREATE TABLE IF NOT EXISTS avis (
      id         TEXT    PRIMARY KEY,
      article_id TEXT    NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      auteur     TEXT    NOT NULL,
      note       INTEGER NOT NULL CHECK (note BETWEEN 1 AND 5),
      texte      TEXT    NOT NULL,
      date       TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_avis_article ON avis(article_id);
    CREATE TABLE IF NOT EXISTS panier (
      article_id TEXT PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
      qte        INTEGER NOT NULL CHECK (qte >= 1)
    );
    CREATE TABLE IF NOT EXISTS favoris (
      article_id TEXT PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS commandes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      numero     TEXT    NOT NULL,
      nom        TEXT    NOT NULL,
      email      TEXT    NOT NULL,
      adresse    TEXT    NOT NULL,
      lignes     TEXT    NOT NULL,
      sous_total INTEGER NOT NULL,
      livraison  INTEGER NOT NULL,
      total      INTEGER NOT NULL,
      date       TEXT    NOT NULL
    );
  `);
}

/* Colonnes normalisées d'une ligne du catalogue. */
function normalises(article) {
  return {
    recherche: normaliser(article.nom + ' ' + article.accroche + ' ' + article.description),
    tri_nom: normaliser(article.nom)
  };
}

/* Insère le catalogue et les 7 avis d'exemple (premier lancement). */
function semer(db) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM articles').get().n;
  if (n > 0) return;
  const insArt = db.prepare(
    'INSERT INTO articles (id, nom, prix, categorie, stock, accroche, description, details, recherche, tri_nom) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insAvis = db.prepare(
    'INSERT INTO avis (id, article_id, auteur, note, texte, date) VALUES (?, ?, ?, ?, ?, ?)');
  db.prepare('BEGIN').run();
  try {
    ARTICLES.forEach(function (a) {
      const nrm = normalises(a);
      insArt.run(a.id, a.nom, a.prix, a.categorie, a.stock, a.accroche, a.description,
        JSON.stringify(a.details), nrm.recherche, nrm.tri_nom);
    });
    AVIS_DEPART.forEach(function (v) {
      insAvis.run(v.id, v.article_id, v.auteur, v.note, v.texte, v.date);
    });
    db.prepare('COMMIT').run();
    console.log('  • 8 articles et 7 avis de démonstration insérés.');
  } catch (e) {
    db.prepare('ROLLBACK').run();
    throw e;
  }
}

/* Public : décompacte le JSON des caractéristiques. */
function publique(a) {
  let details = {};
  try { details = JSON.parse(a.details); } catch (e) { details = {}; }
  return {
    id: a.id, nom: a.nom, prix: a.prix, categorie: a.categorie, stock: a.stock,
    accroche: a.accroche, description: a.description, details: details
  };
}

/* L'article existe-t-il (avec une catégorie connue du front) ? */
function articleExiste(db, id) {
  return !!db.prepare('SELECT 1 AS ok FROM articles WHERE id = ?').get(String(id));
}

/* ---------- Validations (mêmes messages que le front) ---------- */

function validerAvis(d) {
  const erreurs = {};
  if (!texte(d.auteur)) erreurs.auteur = 'Merci d’indiquer votre nom.';
  if (!Number.isInteger(d.note) || d.note < 1 || d.note > 5) {
    erreurs.note = 'Merci de choisir une note de 1 à 5.';
  }
  if (texte(d.texte).length < 10) {
    erreurs.texte = 'Merci d’écrire au moins quelques mots (10 caractères).';
  }
  return erreurs;
}

function validerCommande(d) {
  const erreurs = {};
  if (!texte(d.nom)) erreurs.nom = 'Merci d’indiquer votre nom.';
  if (!RE_EMAIL.test(texte(d.email))) erreurs.email = 'Merci d’indiquer une adresse e-mail valide.';
  if (!texte(d.adresse)) erreurs.adresse = 'Merci d’indiquer une adresse de livraison.';
  return erreurs;
}

/* Lignes de commande : articles existants et quantités entières positives. */
function validerLignes(db, d) {
  const lignes = Array.isArray(d.lignes) ? d.lignes : [];
  if (!lignes.length) return { erreurs: { lignes: 'Le panier est vide : aucune ligne à enregistrer.' }, lignes: [] };
  const erreurs = {};
  const propres = [];
  lignes.forEach(function (l, i) {
    const id = l && typeof l.id === 'string' ? l.id : '';
    const qte = l ? l.qte : NaN;
    if (!articleExiste(db, id)) erreurs['lignes.' + i] = 'Article introuvable : ' + (id || '(identifiant vide)') + '.';
    else if (!Number.isInteger(qte) || qte < 1) erreurs['lignes.' + i] = 'Quantité invalide pour « ' + id + ' ».';
    else propres.push({ id: id, qte: qte });
  });
  return { erreurs: erreurs, lignes: propres };
}

/* Totaux recalculés côté serveur avec les règles du front
   (livraison offerte dès 500 MAD, sinon 30 MAD). */
function calculerTotaux(db, lignes) {
  let sousTotal = 0;
  lignes.forEach(function (l) {
    const a = db.prepare('SELECT prix FROM articles WHERE id = ?').get(l.id);
    if (a) sousTotal += a.prix * l.qte;
  });
  const livraison = (sousTotal === 0 || sousTotal >= SEUIL_LIVRAISON) ? 0 : FRAIS_LIVRAISON;
  return { sousTotal: sousTotal, livraison: livraison, total: sousTotal + livraison };
}

/* ---------- Routes ---------- */

const routes = [
  /* Sonde de détection du mode full-stack (utilisée par shared/api-client.js). */
  {
    methode: 'GET', motif: '/api/sante',
    traiter: function () {
      return { statut: 200, corps: { serveur: true, nom: 'Souk boutique (Node + SQLite)', version: '1.0.0' } };
    }
  },

  /* GET /api/articles — le catalogue complet. */
  {
    methode: 'GET', motif: '/api/articles',
    traiter: function (ctx) {
      const lignes = ctx.db.prepare('SELECT * FROM articles ORDER BY rowid ASC').all();
      return {
        statut: 200,
        corps: {
          donnees: lignes.map(publique),
          meta: { total: lignes.length, categories: CATEGORIES }
        }
      };
    }
  },

  /* GET /api/articles/:id */
  {
    methode: 'GET', motif: '/api/articles/:id',
    traiter: function (ctx) {
      const a = ctx.db.prepare('SELECT * FROM articles WHERE id = ?').get(String(ctx.params.id));
      if (!a) return { statut: 404, corps: { erreur: 'Article introuvable', id: ctx.params.id } };
      return { statut: 200, corps: publique(a) };
    }
  },

  /* GET /api/avis — tous les avis, groupés par article (modèle du front). */
  {
    methode: 'GET', motif: '/api/avis',
    traiter: function (ctx) {
      const lignes = ctx.db.prepare('SELECT * FROM avis ORDER BY date DESC, id ASC').all();
      const donnees = {};
      let total = 0;
      lignes.forEach(function (v) {
        if (!donnees[v.article_id]) donnees[v.article_id] = [];
        donnees[v.article_id].push({ id: v.id, auteur: v.auteur, note: v.note, texte: v.texte, date: v.date });
        total += 1;
      });
      return { statut: 200, corps: { donnees: donnees, meta: { total: total } } };
    }
  },

  /* POST /api/avis — création d'un avis (validation identique au formulaire). */
  {
    methode: 'POST', motif: '/api/avis',
    traiter: function (ctx) {
      const d = ctx.corps && typeof ctx.corps === 'object' ? ctx.corps : {};
      const articleId = typeof d.article_id === 'string' ? d.article_id : '';
      if (!articleExiste(ctx.db, articleId)) {
        return { statut: 404, corps: { erreur: 'Article introuvable', id: articleId } };
      }
      const erreurs = validerAvis(d);
      if (Object.keys(erreurs).length) {
        return { statut: 400, corps: { erreur: 'Données invalides', details: erreurs } };
      }
      const id = (typeof d.id === 'string' && /^[\w-]{1,64}$/.test(d.id))
        ? d.id
        : 'avis-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
      const auteur = texte(d.auteur).slice(0, 40);
      const note = d.note;
      const t = texte(d.texte).slice(0, 500);
      const date = (typeof d.date === 'string' && !isNaN(new Date(d.date).getTime()))
        ? d.date : new Date().toISOString();
      ctx.db.prepare('INSERT INTO avis (id, article_id, auteur, note, texte, date) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, articleId, auteur, note, t, date);
      return { statut: 201, corps: { id: id, auteur: auteur, note: note, texte: t, date: date } };
    }
  },

  /* DELETE /api/avis/:id */
  {
    methode: 'DELETE', motif: '/api/avis/:id',
    traiter: function (ctx) {
      const r = ctx.db.prepare('DELETE FROM avis WHERE id = ?').run(String(ctx.params.id));
      if (!r.changes) return { statut: 404, corps: { erreur: 'Avis introuvable', id: ctx.params.id } };
      return { statut: 204, corps: null };
    }
  },

  /* GET /api/panier — [{ id, qte }]. */
  {
    methode: 'GET', motif: '/api/panier',
    traiter: function (ctx) {
      const lignes = ctx.db.prepare('SELECT article_id, qte FROM panier ORDER BY rowid ASC').all();
      return {
        statut: 200,
        corps: { donnees: lignes.map(function (l) { return { id: l.article_id, qte: l.qte }; }) }
      };
    }
  },

  /* PUT /api/panier — remplacement intégral (écriture-transit du front). */
  {
    methode: 'PUT', motif: '/api/panier',
    traiter: function (ctx) {
      const brut = ctx.corps !== undefined ? ctx.corps : null;
      if (!Array.isArray(brut)) {
        return { statut: 400, corps: { erreur: 'Données invalides', details: { panier: 'Le corps doit être un tableau [{ id, qte }].' } } };
      }
      const donnees = Array.isArray(brut.donnees) ? brut.donnees : brut;
      const erreurs = {};
      const propres = [];
      donnees.forEach(function (l, i) {
        const id = l && typeof l.id === 'string' ? l.id : '';
        const qte = l ? l.qte : NaN;
        if (!articleExiste(ctx.db, id)) erreurs['panier.' + i] = 'Article introuvable : ' + (id || '(identifiant vide)') + '.';
        else if (!Number.isInteger(qte) || qte < 1) erreurs['panier.' + i] = 'Quantité invalide pour « ' + id + ' ».';
        else if (propres.some(function (p) { return p.id === id; })) erreurs['panier.' + i] = 'Article déjà présent : ' + id + '.';
        else propres.push({ id: id, qte: qte });
      });
      if (Object.keys(erreurs).length) {
        return { statut: 400, corps: { erreur: 'Données invalides', details: erreurs } };
      }
      ctx.db.exec('DELETE FROM panier');
      const ins = ctx.db.prepare('INSERT INTO panier (article_id, qte) VALUES (?, ?)');
      propres.forEach(function (l) { ins.run(l.id, l.qte); });
      return { statut: 200, corps: { donnees: propres } };
    }
  },

  /* DELETE /api/panier — vide le panier. */
  {
    methode: 'DELETE', motif: '/api/panier',
    traiter: function (ctx) {
      ctx.db.exec('DELETE FROM panier');
      return { statut: 204, corps: null };
    }
  },

  /* GET /api/favoris — liste des identifiants favoris. */
  {
    methode: 'GET', motif: '/api/favoris',
    traiter: function (ctx) {
      const lignes = ctx.db.prepare('SELECT article_id FROM favoris ORDER BY rowid ASC').all();
      return { statut: 200, corps: { donnees: lignes.map(function (l) { return l.article_id; }) } };
    }
  },

  /* PUT /api/favoris — remplacement intégral. */
  {
    methode: 'PUT', motif: '/api/favoris',
    traiter: function (ctx) {
      const brut = ctx.corps !== undefined ? ctx.corps : null;
      const donnees = Array.isArray(brut) ? brut : (brut && Array.isArray(brut.donnees) ? brut.donnees : null);
      if (!donnees) {
        return { statut: 400, corps: { erreur: 'Données invalides', details: { favoris: 'Le corps doit être un tableau d\'identifiants.' } } };
      }
      const erreurs = {};
      const propres = [];
      donnees.forEach(function (id, i) {
        if (typeof id !== 'string' || !articleExiste(ctx.db, id)) {
          erreurs['favoris.' + i] = 'Article introuvable : ' + (typeof id === 'string' ? id : '(identifiant invalide)') + '.';
        } else if (propres.indexOf(id) === -1) {
          propres.push(id);
        }
      });
      if (Object.keys(erreurs).length) {
        return { statut: 400, corps: { erreur: 'Données invalides', details: erreurs } };
      }
      ctx.db.exec('DELETE FROM favoris');
      const ins = ctx.db.prepare('INSERT INTO favoris (article_id) VALUES (?)');
      propres.forEach(function (id) { ins.run(id); });
      return { statut: 200, corps: { donnees: propres } };
    }
  },

  /* POST /api/commandes — journalise la commande validée côté client,
     AVANT que le front ne vide son panier. */
  {
    methode: 'POST', motif: '/api/commandes',
    traiter: function (ctx) {
      const d = ctx.corps && typeof ctx.corps === 'object' ? ctx.corps : {};
      const erreurs = validerCommande(d);
      const verr = validerLignes(ctx.db, d);
      Object.assign(erreurs, verr.erreurs);
      if (Object.keys(erreurs).length) {
        return { statut: 400, corps: { erreur: 'Données invalides', details: erreurs } };
      }
      const t = calculerTotaux(ctx.db, verr.lignes);
      const numero = (typeof d.numero === 'string' && /^CMD-\d{4}$/.test(d.numero))
        ? d.numero
        : 'CMD-' + Math.floor(1000 + Math.random() * 9000);
      const date = new Date().toISOString();
      const lignesComplet = verr.lignes.map(function (l) {
        const a = publique(ctx.db.prepare('SELECT * FROM articles WHERE id = ?').get(l.id));
        return { id: a.id, nom: a.nom, prix: a.prix, qte: l.qte, sousTotal: a.prix * l.qte };
      });
      const r = ctx.db.prepare(
        'INSERT INTO commandes (numero, nom, email, adresse, lignes, sous_total, livraison, total, date) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(numero, texte(d.nom), texte(d.email), texte(d.adresse), JSON.stringify(lignesComplet),
          t.sousTotal, t.livraison, t.total, date);
      return {
        statut: 201,
        corps: {
          id: Number(r.lastInsertRowid), numero: numero, date: date,
          lignes: lignesComplet, sousTotal: t.sousTotal, livraison: t.livraison, total: t.total
        }
      };
    }
  },

  /* POST /api/reinit — catalogue, avis, panier, favoris et commandes
     repartent du jeu de démonstration. */
  {
    methode: 'POST', motif: '/api/reinit',
    traiter: function (ctx) {
      ctx.db.exec('DELETE FROM avis; DELETE FROM panier; DELETE FROM favoris; DELETE FROM commandes; DELETE FROM articles;');
      ctx.db.exec("DELETE FROM sqlite_sequence WHERE name = 'commandes'");
      semer(ctx.db);
      return {
        statut: 200,
        corps: { message: 'Base réinitialisée : 8 articles, 7 avis de démonstration, panier et favoris vidés.' }
      };
    }
  }
];

/* ---------- Démarrage ---------- */

const fs = require('node:fs');
fs.mkdirSync(path.dirname(BASE), { recursive: true });

creerServeur({
  nom: 'Souk boutique — full-stack',
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
