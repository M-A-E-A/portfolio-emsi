'use strict';

/* =========================================================
   Bibliothèque commune aux serveurs full-stack du portfolio.
   Zéro dépendance : uniquement des modules natifs de Node.
     - node:http   : serveur HTTP + Server-Sent Events
     - node:fs     : fichiers statiques
     - node:path   : résolution des chemins
     - node:sqlite : vraie base de données SQL
   Chaque projet possède son propre server.js qui appelle
   creerServeur() avec ses routes et sa base.
   ========================================================= */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

/* Types MIME servis en statique. */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.webmanifest': 'application/manifest+json'
};

/* Ouvre (et crée si nécessaire) une base SQLite avec les pragmas adaptés.
   WAL permet plusieurs lectures concurrentes pendant une écriture ;
   foreign_keys respecte les clés étrangères déclarées. */
function ouvrirBase(chemin) {
  const base = new DatabaseSync(chemin);
  base.exec('PRAGMA journal_mode = WAL;');
  base.exec('PRAGMA foreign_keys = ON;');
  return base;
}

/* Hub Server-Sent Events : publie des événements à tous les clients
   connectés. Nécessaire pour le temps réel (messagerie, tableau blanc). */
function creerFlux() {
  const clients = new Set();

  /* Heartbeat : sans paquet périodique, les proxys ferment le flux. */
  const veilleur = setInterval(function () {
    clients.forEach(function (res) { res.write(': ping\n\n'); });
  }, 25000);
  if (veilleur.unref) veilleur.unref();

  return {
    /* Attache une requête GET au flux (à appeler depuis la route /flux). */
    ouvrir: function (req, res) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.write('retry: 2000\n\n');
      clients.add(res);
      req.on('close', function () { clients.delete(res); });
    },
    /* Diffuse un événement nommé à tous les clients. */
    publier: function (evenement, donnees) {
      if (!clients.size) return;
      const trame = 'event: ' + evenement + '\ndata: ' + JSON.stringify(donnees) + '\n\n';
      clients.forEach(function (res) { res.write(trame); });
    },
    nbClients: function () { return clients.size; }
  };
}

/* Analyse le corps JSON d'une requête (1 Mo maximum). */
function lireCorps(req) {
  return new Promise(function (resoudre, rejeter) {
    let taille = 0;
    const morceaux = [];
    req.on('data', function (m) {
      taille += m.length;
      if (taille > 1024 * 1024) {
        rejeter(new Error('Corps de requête trop volumineux (1 Mo maximum).'));
        req.destroy();
        return;
      }
      morceaux.push(m);
    });
    req.on('end', function () {
      if (!morceaux.length) return resoudre(undefined);
      /* Un BOM (byte order mark) en tête de corps est toléré :
         certains clients Windows l'ajoutent automatiquement. */
      let texte = Buffer.concat(morceaux).toString('utf8').replace(/^\uFEFF/, '');
      try { resoudre(JSON.parse(texte)); }
      catch (e) { rejeter(new Error('JSON invalide : ' + e.message)); }
    });
    req.on('error', rejeter);
  });
}

/* Convertit un motif du type « /api/contacts/:id » en expression régulière. */
function motiverVersRegexp(motif) {
  const morceaux = motif.split('/').map(function (m) {
    return m.charAt(0) === ':' ? '([^/]+)' : m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  return { regexp: new RegExp('^' + morceaux.join('/') + '/?$'), cles: motif.split('/').filter(function (m) { return m.charAt(0) === ':'; }).map(function (m) { return m.slice(1); }) };
}

/* Sécurité : le chemin résolu doit rester à l'intérieur du dossier servi. */
function verifierChemin(dossierRacine, cheminRelatif) {
  const resolu = path.normalize(path.join(dossierRacine, cheminRelatif));
  const racine = path.normalize(dossierRacine + path.sep);
  if (resolu !== path.normalize(dossierRacine) && resolu.indexOf(racine) !== 0) return null;
  return resolu;
}

/* Sert un fichier statique, avec index.html implicite pour les dossiers. */
function servirStatique(racine, res, cheminRelatif) {
  const rel = (cheminRelatif || '').replace(/^\/+/, '') || 'index.html';
  const resolu = verifierChemin(racine, decodeURIComponent(rel));
  if (!resolu) { repondre(res, 403, { erreur: 'Accès refusé.' }); return; }

  let cible = resolu;
  try {
    if (fs.existsSync(cible) && fs.statSync(cible).isDirectory()) cible = path.join(cible, 'index.html');
  } catch (e) { /* ignoré : traitement 404 ci-dessous */ }

  fs.readFile(cible, function (err, contenu) {
    if (err) { repondre(res, 404, { erreur: 'Fichier introuvable', chemin: cheminRelatif }); return; }
    const type = TYPES[path.extname(cible).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(contenu);
  });
}

/* Réponse JSON pratique. */
let repondre = function (res, statut, corps) {
  const vide = corps === null || corps === undefined;
  const corpsTexte = vide ? '' : JSON.stringify(corps);
  res.writeHead(statut, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(corpsTexte)
  });
  res.end(corpsTexte);
};

/* Normalisation « insensible à la casse ET aux accents » (NFD),
   identique à celle des frontends : é → e, ç → c, … */
function normaliser(valeur) {
  return String(valeur === undefined || valeur === null ? '' : valeur)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/* Lance un serveur complet : routes API + fichiers statiques.
   options :
     nom        libellé affiché au démarrage
     port       port d'écoute (surchargeable par la variable PORT)
     racine     dossier statique de l'application
     alias      [{ prefixe, dossier }] — ex. /shared → ../shared
     base       chemin du fichier SQLite (optionnel)
     routes     [{ methode, motif, traiter }] — traiter(ctx) → {statut, corps}
                ctx = { req, res, params, query, corps, db, flux }
     surDemarrage(base) — peuplement de la base au premier lancement
   Retourne { db, flux, port, fermer }. */
async function creerServeur(options) {
  /* `nom` devient l'en-tête X-Serveur (§2 du MODELE). Une chaîne vide
     désactive l'en-tête : le serveur statique de test ne doit PAS être
     détecté comme un backend Node (sinon le frontend en mode local
     appellerait des routes inexistantes et provoquerait des erreurs
     404 dans la console). */
  const nom = options.nom === undefined ? 'Serveur' : String(options.nom);
  const nomAffiche = nom || 'Serveur';
  const port = parseInt(process.env.PORT || options.port, 10);
  const racine = path.resolve(options.racine);
  const alias = (options.alias || []).map(function (a) {
    return { prefixe: a.prefixe.replace(/\/+$/, ''), dossier: path.resolve(a.dossier) };
  });
  const db = options.base ? ouvrirBase(path.resolve(options.base)) : null;
  const flux = creerFlux();

  /* Compilation des routes. */
  const routes = (options.routes || []).map(function (r) {
    const p = motiverVersRegexp(r.motif);
    return { methode: r.methode.toUpperCase(), motif: r.motif, traiter: r.traiter, regexp: p.regexp, cles: p.cles };
  });

  const serveur = http.createServer(async function (req, res) {
    const debut = Date.now();
    const url = new URL(req.url, 'http://localhost');
    const chemin = url.pathname;

    /* En-tête d'identification : permet au frontend de détecter un
       serveur Node sans requête 404 (voir shared/api-client.js).
       Un en-tête HTTP ne peut contenir que des caractères ASCII
       imprimables : on remplace tout autre caractère. */
    if (nom) res.setHeader('X-Serveur', nom.replace(/[^\x20-\x7E]/g, '-'));

    res.on('finish', function () {
      console.log('  ' + req.method + ' ' + chemin + ' → ' + res.statusCode + ' (' + (Date.now() - debut) + ' ms)');
    });

    try {
      /* 1. Routes API. */
      const route = routes.find(function (r) {
        return r.methode === req.method.toUpperCase() && r.regexp.test(chemin);
      });
      if (route) {
        const m = route.regexp.exec(chemin);
        const params = {};
        route.cles.forEach(function (cle, i) { params[cle] = decodeURIComponent(m[i + 1]); });
        const query = {};
        url.searchParams.forEach(function (v, k) { query[k] = v; });
        const corps = (req.method === 'GET' || req.method === 'HEAD') ? undefined : await lireCorps(req);
        const sortie = await route.traiter({ req: req, res: res, params: params, query: query, corps: corps, db: db, flux: flux });
        if (sortie !== undefined) repondre(res, sortie.statut, sortie.corps);
        return;
      }

      /* 2. Fichiers statiques (alias puis racine de l'application). */
      if (req.method === 'GET' || req.method === 'HEAD') {
        for (const a of alias) {
          if (chemin === a.prefixe || chemin.indexOf(a.prefixe + '/') === 0) {
            servirStatique(a.dossier, res, chemin.slice(a.prefixe.length));
            return;
          }
        }
        servirStatique(racine, res, chemin);
        return;
      }

      /* 3. Méthode non supportée sur ce chemin. */
      repondre(res, 405, { erreur: 'Méthode non autorisée', methode: req.method, chemin: chemin });
    } catch (err) {
      console.error('  Erreur sur ' + req.method + ' ' + chemin + ' :', err);
      if (!res.headersSent) repondre(res, 500, { erreur: 'Erreur interne du serveur', message: err.message });
    }
  });

  await new Promise(function (resoudre, rejeter) {
    serveur.once('error', function (err) {
      if (err.code === 'EADDRINUSE') {
        console.error('✗ ' + nomAffiche + ' : le port ' + port + ' est déjà occupé. ' +
          'Relancez avec PORT=<autre port> node server.js');
        process.exit(1);
      }
      rejeter(err);
    });
    serveur.listen(port, function () { resoudre(); });
  });

  if (db && typeof options.surDemarrage === 'function') options.surDemarrage(db);

  console.log('✓ ' + nomAffiche + ' → http://localhost:' + port +
    (db ? '  (base : ' + path.basename(options.base) + ', SQLite)' : ''));

  return {
    db: db,
    flux: flux,
    port: port,
    serveur: serveur,
    fermer: function () {
      return new Promise(function (resoudre) {
        serveur.close(function () { if (db) db.close(); resoudre(); });
      });
    }
  };
}

module.exports = { creerServeur, ouvrirBase, creerFlux, repondre, normaliser, lireCorps, TYPES };
