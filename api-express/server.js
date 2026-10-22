// API REST de gestion de contacts — Express.js + base SQLite (node:sqlite)
// Lancement : npm install && npm start   puis   http://localhost:3000
// Express reste la seule dépendance npm : la persistance utilise le module
// natif node:sqlite (aucun better-sqlite3, aucun autre paquet installé).
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
// Bibliothèque commune du portfolio : ouvrirBase (WAL + foreign_keys) et
// normaliser (recherche/tri insensibles aux accents).
const { ouvrirBase, normaliser } = require('../serveur/commun.js');

const app = express();
const PORT = process.env.PORT || 3000;

/* Base SQLite posée à la racine du repo, dans un dossier « donnees* »
   gitignoré : hors du dossier statique de l'app, donc jamais servie en
   fichiers (cf. serveur/MODELE.md §7). */
const BASE = process.env.BASE || path.join(__dirname, '..', 'donnees-express', 'bdd.sqlite');

/* En-tête d'identification : shared/api-client.js le sonde (requête HEAD)
   pour basculer en mode full-stack. Un en-tête HTTP ne tolère que les
   caractères ASCII imprimables. */
const NOM_SERVEUR = 'API Express - full-stack (Node + SQLite)';

/* ---------- Jeu de démonstration (identique à l'ancien tableau en mémoire) ---------- */

const EXEMPLES = [
  { id: 1, nom: 'El ADNANI Abderrahmane', email: 'm.a.eladnani1@gmail.com', ville: 'Marrakech', telephone: '+212 7 77 60 92 28' },
  { id: 2, nom: 'Bennani Youssef', email: 'youssef.bennani@example.com', ville: 'Casablanca', telephone: '+212 6 12 34 56 78' },
  { id: 3, nom: 'Alaoui Fatima', email: 'fatima.alaoui@example.com', ville: 'Rabat', telephone: '+212 6 98 76 54 32' }
];

/* ---------- Middleware ---------- */
// Sonde de détection du moteur (avant tout le reste : aussi sur /apercu.html).
app.use(function (req, res, next) {
  res.set('X-Serveur', NOM_SERVEUR);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Journalisation simple de chaque requête
app.use(function (req, res, next) {
  const debut = Date.now();
  res.on('finish', function () {
    console.log(req.method, req.originalUrl, res.statusCode, (Date.now() - debut) + 'ms');
  });
  next();
});

/* ---------- Schéma de la base ----------
   Deux colonnes « fantômes » (recherche, tri_*) stockent la version
   normalisée (sans accent, minuscules) : elles permettent une recherche
   et un tri insensibles aux accents EN SQL, sans charger toute la table
   en mémoire. Recalculées à chaque écriture (cf. api-contacts/server.js). */

function preparerBase(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      nom       TEXT    NOT NULL,
      email     TEXT    NOT NULL,
      ville     TEXT,
      telephone TEXT,
      recherche TEXT,
      tri_nom   TEXT,
      tri_ville TEXT
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

/* Insère les 3 contacts d'exemple au premier lancement seulement,
   dans une transaction. Renvoie true si un semis a eu lieu. */
function semer(db) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM contacts').get().n;
  if (n > 0) return false;
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
    console.log('  • 3 contacts de démonstration insérés.');
    return true;
  } catch (e) {
    db.prepare('ROLLBACK').run();
    throw e;
  }
}

/* Lecture d'une ligne ; renvoie undefined pour un identifiant non entier
   (comportement identique à l'ancien parseInt() + find()). */
function trouver(id) {
  if (!Number.isInteger(id)) return undefined;
  return db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
}

/* Public : retire les colonnes techniques avant d'envoyer la réponse. */
function publique(c) {
  return { id: c.id, nom: c.nom, email: c.email, ville: c.ville, telephone: c.telephone };
}

function valider(corps) {
  const erreurs = [];
  if (!corps.nom || String(corps.nom).trim().length < 2) erreurs.push('nom : au moins 2 caractères');
  // Attention : dans un littéral de regex, un seul antislash suffit.
  // « \\s » exigerait un antislash littéral dans l'adresse e-mail.
  if (!corps.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(corps.email)) erreurs.push('email : format invalide');
  if (corps.ville && String(corps.ville).trim().length < 2) erreurs.push('ville : au moins 2 caractères');
  return erreurs;
}

// ---------- Base ----------

fs.mkdirSync(path.dirname(BASE), { recursive: true });
const db = ouvrirBase(BASE);
preparerBase(db);
semer(db);

// ---------- Routes ----------

// GET /api/contacts?q=&ville=&tri=&ordre=&page=&parPage=
app.get('/api/contacts', function (req, res) {
  const q = (req.query.q || '').toLowerCase();
  const ville = (req.query.ville || '').toLowerCase();
  const tri = ['nom', 'email', 'ville'].includes(req.query.tri) ? req.query.tri : 'nom';
  const ordre = req.query.ordre === 'desc' ? -1 : 1;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const parPage = Math.min(50, Math.max(1, parseInt(req.query.parPage, 10) || 10));

  /* Le tri se fait sur la colonne normalisée correspondante :
     nom → tri_nom, ville → tri_ville, e-mail → colonne brute. */
  const colonneTri = tri === 'ville' ? 'tri_ville' : tri === 'email' ? 'email' : 'tri_nom';

  /* Filtres SQL : la recherche est normalisée puis cherchée dans la
     colonne « recherche » (insensible aux accents : q=fes → Fès),
     le filtre ville compare la colonne tri_ville normalisée. */
  const conditions = [];
  const args = [];
  if (q) {
    conditions.push('recherche LIKE ?');
    args.push('%' + normaliser(q) + '%');
  }
  if (ville) {
    conditions.push('tri_ville = ?');
    args.push(normaliser(ville));
  }

  const sql = 'SELECT * FROM contacts' +
    (conditions.length ? ' WHERE ' + conditions.join(' AND ') : '') +
    ' ORDER BY ' + colonneTri + (ordre === -1 ? ' DESC' : ' ASC') + ', id ASC';
  const lignes = db.prepare(sql).all(...args);

  const total = lignes.length;
  const debut = (page - 1) * parPage;
  const pageItems = lignes.slice(debut, debut + parPage).map(publique);

  res.json({
    donnees: pageItems,
    meta: { total: total, page: page, parPage: parPage, pages: Math.ceil(total / parPage) }
  });
});

// GET /api/contacts/:id
app.get('/api/contacts/:id', function (req, res) {
  const id = parseInt(req.params.id, 10);
  const contact = trouver(id);
  if (!contact) return res.status(404).json({ erreur: 'Contact introuvable', id: id });
  res.json(publique(contact));
});

// POST /api/contacts
app.post('/api/contacts', function (req, res) {
  const erreurs = valider(req.body || {});
  if (erreurs.length) return res.status(400).json({ erreur: 'Validation', details: erreurs });
  const nouveau = {
    id: 0,
    nom: String(req.body.nom).trim(),
    email: String(req.body.email).trim(),
    ville: String(req.body.ville || '').trim(),
    telephone: String(req.body.telephone || '').trim()
  };
  const nrm = normalises(nouveau.nom, nouveau.email, nouveau.ville, nouveau.telephone);
  const r = db.prepare(
    'INSERT INTO contacts (nom, email, ville, telephone, recherche, tri_nom, tri_ville) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(nouveau.nom, nouveau.email, nouveau.ville, nouveau.telephone, nrm.recherche, nrm.tri_nom, nrm.tri_ville);
  nouveau.id = Number(r.lastInsertRowid);
  res.status(201).json(nouveau);
});

// PUT /api/contacts/:id
app.put('/api/contacts/:id', function (req, res) {
  const id = parseInt(req.params.id, 10);
  const contact = trouver(id);
  if (!contact) return res.status(404).json({ erreur: 'Contact introuvable', id: id });
  const erreurs = valider(req.body || {});
  if (erreurs.length) return res.status(400).json({ erreur: 'Validation', details: erreurs });
  const maj = {
    nom: String(req.body.nom).trim(),
    email: String(req.body.email).trim(),
    ville: String(req.body.ville || contact.ville).trim(),
    telephone: String(req.body.telephone || contact.telephone).trim()
  };
  const nrm = normalises(maj.nom, maj.email, maj.ville, maj.telephone);
  db.prepare(
    'UPDATE contacts SET nom = ?, email = ?, ville = ?, telephone = ?, recherche = ?, tri_nom = ?, tri_ville = ? WHERE id = ?'
  ).run(maj.nom, maj.email, maj.ville, maj.telephone, nrm.recherche, nrm.tri_nom, nrm.tri_ville, id);
  res.json(Object.assign({ id: id }, maj));
});

// DELETE /api/contacts/:id
app.delete('/api/contacts/:id', function (req, res) {
  const id = parseInt(req.params.id, 10);
  const contact = trouver(id);
  if (!contact) return res.status(404).json({ erreur: 'Contact introuvable', id: id });
  db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
  res.status(204).send();
});

// GET /api/stats
app.get('/api/stats', function (req, res) {
  // GROUP BY + MIN(id) conserve l'ordre des premières apparitions
  // (même ordre de clés que l'ancien reduce() sur le tableau en mémoire).
  const lignes = db.prepare(
    'SELECT ville, COUNT(*) AS n FROM contacts GROUP BY ville ORDER BY MIN(id)'
  ).all();
  const parVille = {};
  lignes.forEach(function (l) { parVille[String(l.ville)] = l.n; });
  const total = db.prepare('SELECT COUNT(*) AS n FROM contacts').get().n;
  res.json({ total: total, parVille: parVille });
});

// POST /api/reinit — vide la table puis réinsère les 3 exemples.
app.post('/api/reinit', function (req, res) {
  db.exec('DELETE FROM contacts');
  db.exec("DELETE FROM sqlite_sequence WHERE name = 'contacts'");
  semer(db);
  res.json({ message: 'Base réinitialisée : 3 contacts de démonstration.', total: EXEMPLES.length });
});

// ---------- Fichiers statiques (apercu.html, css/, js/) ----------
// Alias /shared → dossier partagé du portfolio (theme.css, api-client.js…).
app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));

app.use(function (req, res, next) {
  // node_modules n'a pas à être servi en fichiers statiques.
  if (req.path === '/node_modules' || req.path.indexOf('/node_modules/') === 0) {
    return res.status(404).json({ erreur: 'Route inconnue', methode: req.method, chemin: req.originalUrl });
  }
  next();
});
app.use(express.static(__dirname));

// ---------- Gestion des erreurs ----------
app.use(function (req, res) {
  res.status(404).json({ erreur: 'Route inconnue', methode: req.method, chemin: req.originalUrl });
});

app.use(function (err, req, res, next) {
  console.error(err);
  res.status(500).json({ erreur: 'Erreur interne', message: err.message });
});

// ---------- Démarrage ----------
app.listen(PORT, function () {
  console.log('API Contacts (Express + SQLite) en écoute sur http://localhost:' + PORT);
  console.log('Base : ' + BASE);
  console.log('Essayer : curl http://localhost:' + PORT + '/api/contacts');
  console.log('Aperçu  : http://localhost:' + PORT + '/apercu.html');
});
