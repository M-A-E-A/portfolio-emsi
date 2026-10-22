'use strict';

/* =========================================================
   Détection du moteur de données — commun à toutes les apps.
   Deux modes sont possibles :
     • full-stack : un serveur Node (node:http + node:sqlite)
       répond sur le même hôte → les requêtes partent en HTTP
       et les données vivent dans une vraie base SQLite ;
     • local      : page ouverte en file:// ou servie statiquement
       → tout reste dans localStorage, comme avant.
   La bascule est transparente : LumeAPI.actif doit être lu
   avant le premier chargement de données.
   ========================================================= */
(function () {
  const client = {
    /* true si un serveur Node a répondu à la sonde. */
    actif: false,
    /* Nom affiché par le serveur (pour l'indicateur d'interface). */
    nomServeur: '',
    /* Délai maximum d'attente de la sonde, en millisecondes. */
    delai: 1500,

    /* Sonde : une requête HEAD sur la page courante. Le serveur Node
       (serveur/commun.js) stamps chaque réponse d'un en-tête
       « X-Serveur ». Sa présence signale un backend réel ; un serveur
       statique ou file:// ne le renvoie jamais, donc aucun 404 n'est
       généré dans la console. Retourne une Promise<boolean>. */
    detecter: function () {
      /* file:// : fetch est bloqué par sécurité, inutile d'essayer. */
      if (!/^https?:$/.test(location.protocol)) {
        return Promise.resolve(false);
      }
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      const minuteur = setTimeout(function () { if (ctrl) ctrl.abort(); }, client.delai);
      return fetch(location.pathname, {
        method: 'HEAD',
        cache: 'no-store',
        signal: ctrl ? ctrl.signal : undefined
      })
        .then(function (r) {
          clearTimeout(minuteur);
          const nom = r.headers.get('X-Serveur');
          client.actif = !!nom;
          client.nomServeur = nom || '';
          return client.actif;
        })
        .catch(function () {
          clearTimeout(minuteur);
          return false;
        });
    },

    /* Appel HTTP générique : renvoie { statut, corps } — la même forme
       que le « serveur simulé » des frontends, ce qui permet de
       permuter les moteurs sans toucher au reste du code. */
    appeler: function (methode, chemin, corps) {
      const options = {
        method: methode,
        headers: { 'Accept': 'application/json' }
      };
      if (corps !== undefined) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(corps);
      }
      return fetch(chemin, options).then(function (r) {
        if (r.status === 204) return { statut: 204, corps: null };
        return r.json().then(function (d) { return { statut: r.status, corps: d }; })
          .catch(function () { return { statut: r.status, corps: null }; });
      });
    }
  };

  window.LumeAPI = client;
})();
