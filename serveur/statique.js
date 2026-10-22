'use strict';
/* Serveur statique de test (sans cache) — réutilise la bibliothèque partagée.
   Usage : node serveur-statique.js   →   http://127.0.0.1:8913 */
const path = require('node:path');
const { creerServeur } = require('./commun.js');

creerServeur({
  /* `nom: ''` → aucun en-tête X-Serveur : ce serveur ne doit pas être
     confondu avec un backend Node, sinon le frontend croirait être en
     mode full-stack et provoquerait des 404 dans la console. */
  nom: '',
  port: parseInt(process.env.PORT || '8913', 10),
  racine: path.join(__dirname, '..'),
  routes: []
}).then(function () {
  console.log('  → serveur statique de test, sans en-tête X-Serveur (mode local).');
}).catch(function (err) {
  console.error(err);
  process.exit(1);
});
