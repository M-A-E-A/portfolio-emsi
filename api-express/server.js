// API REST de gestion de contacts — Express.js
// Lancement : npm install && npm start   puis   http://localhost:3000
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Middleware ----------
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

// ---------- Données en mémoire ----------
// (pas de base de données : l'API reste autonome et lançable sans installation)
const contacts = [
  { id: 1, nom: 'El ADNANI Abderrahmane', email: 'm.a.eladnani1@gmail.com', ville: 'Marrakech', telephone: '+212 7 77 60 92 28' },
  { id: 2, nom: 'Bennani Youssef', email: 'youssef.bennani@example.com', ville: 'Casablanca', telephone: '+212 6 12 34 56 78' },
  { id: 3, nom: 'Alaoui Fatima', email: 'fatima.alaoui@example.com', ville: 'Rabat', telephone: '+212 6 98 76 54 32' }
];
let prochainId = 4;

function trouver(id) {
  return contacts.find(function (c) { return c.id === id; });
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

// ---------- Routes ----------

// GET /api/contacts?q=&ville=&tri=&ordre=&page=&parPage=
app.get('/api/contacts', function (req, res) {
  const q = (req.query.q || '').toLowerCase();
  const ville = (req.query.ville || '').toLowerCase();
  const tri = ['nom', 'email', 'ville'].includes(req.query.tri) ? req.query.tri : 'nom';
  const ordre = req.query.ordre === 'desc' ? -1 : 1;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const parPage = Math.min(50, Math.max(1, parseInt(req.query.parPage, 10) || 10));

  let resultat = contacts.slice();
  if (q) resultat = resultat.filter(function (c) {
    return c.nom.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
  });
  if (ville) resultat = resultat.filter(function (c) {
    return c.ville.toLowerCase() === ville;
  });
  resultat.sort(function (a, b) {
    return a[tri] < b[tri] ? -ordre : a[tri] > b[tri] ? ordre : 0;
  });

  const total = resultat.length;
  const debut = (page - 1) * parPage;
  const pageItems = resultat.slice(debut, debut + parPage);

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
  res.json(contact);
});

// POST /api/contacts
app.post('/api/contacts', function (req, res) {
  const erreurs = valider(req.body || {});
  if (erreurs.length) return res.status(400).json({ erreur: 'Validation', details: erreurs });
  const nouveau = {
    id: prochainId++,
    nom: String(req.body.nom).trim(),
    email: String(req.body.email).trim(),
    ville: String(req.body.ville || '').trim(),
    telephone: String(req.body.telephone || '').trim()
  };
  contacts.push(nouveau);
  res.status(201).json(nouveau);
});

// PUT /api/contacts/:id
app.put('/api/contacts/:id', function (req, res) {
  const id = parseInt(req.params.id, 10);
  const contact = trouver(id);
  if (!contact) return res.status(404).json({ erreur: 'Contact introuvable', id: id });
  const erreurs = valider(req.body || {});
  if (erreurs.length) return res.status(400).json({ erreur: 'Validation', details: erreurs });
  Object.assign(contact, {
    nom: String(req.body.nom).trim(),
    email: String(req.body.email).trim(),
    ville: String(req.body.ville || contact.ville).trim(),
    telephone: String(req.body.telephone || contact.telephone).trim()
  });
  res.json(contact);
});

// DELETE /api/contacts/:id
app.delete('/api/contacts/:id', function (req, res) {
  const id = parseInt(req.params.id, 10);
  const index = contacts.findIndex(function (c) { return c.id === id; });
  if (index === -1) return res.status(404).json({ erreur: 'Contact introuvable', id: id });
  contacts.splice(index, 1);
  res.status(204).send();
});

// GET /api/stats
app.get('/api/stats', function (req, res) {
  const parVille = contacts.reduce(function (acc, c) {
    acc[c.ville] = (acc[c.ville] || 0) + 1;
    return acc;
  }, {});
  res.json({ total: contacts.length, parVille: parVille });
});

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
  console.log('API Contacts (Express) en écoute sur http://localhost:' + PORT);
  console.log('Essayer : curl http://localhost:' + PORT + '/api/contacts');
});