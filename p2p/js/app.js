/* =====================================================================
   Application — appairage, conversation, état du canal.
   ===================================================================== */
(function (global) {
  'use strict';

  const P2P = global.P2P;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const CLE_THEME = 'p2p-theme';

  const etat = {
    pair: null,
    messages: [],
    role: null,
  };

  /* ---------------------------------------------------------------- */
  /* Journal et messages                                               */
  /* ---------------------------------------------------------------- */

  function journaliser(texte, type) {
    const zone = $('#journal');
    const ligne = document.createElement('p');
    ligne.className = 'journal-ligne' + (type ? ' ' + type : '');
    ligne.textContent = texte;
    zone.appendChild(ligne);
    zone.scrollTop = zone.scrollHeight;
  }

  function ajouterMessage(texte, distant) {
    const zone = $('#messages');
    const bulle = document.createElement('div');
    bulle.className = 'bulle' + (distant ? ' bulle--distant' : ' bulle--moi');
    const contenu = document.createElement('p');
    contenu.textContent = texte;
    const meta = document.createElement('small');
    meta.textContent = (distant ? 'Pair' : 'Moi') + ' · ' + new Date().toLocaleTimeString('fr-FR');
    bulle.appendChild(contenu);
    bulle.appendChild(meta);
    zone.appendChild(bulle);
    zone.scrollTop = zone.scrollHeight;
    etat.messages.push({ texte, distant });
  }

  function majEtat(etatConnexion) {
    const pastille = $('#pastille');
    pastille.textContent = etatConnexion;
    pastille.className = 'pastille pastille--' + etatConnexion;
    const ouvert = etatConnexion === 'ouvert';
    $('#champ-message').disabled = !ouvert;
    $('#bouton-envoyer').disabled = !ouvert;

    // Tant que le canal n'est pas ouvert, on l'explique dans la zone de
    // conversation plutôt que de la laisser vide sans explication.
    const zone = $('#messages');
    const indice = zone.querySelector('.indice');
    if (!ouvert) {
      if (!indice) {
        zone.innerHTML = '<p class="indice">Terminez l’appairage pour ouvrir le canal direct : '
          + 'les messages apparaîtront ici, chiffrés en AES-GCM.</p>';
      }
    } else if (indice) {
      indice.remove();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Appairage                                                        */
  /* ---------------------------------------------------------------- */

  function creerPair() {
    if (etat.pair) etat.pair.fermer();
    etat.pair = new P2P.Pair({
      surMessage: (m) => ajouterMessage(m.texte, m.distant),
      surEtat: majEtat,
      surJournal: journaliser,
      surCle: (empreinte) => {
        $('#empreinte').textContent = empreinte;
        $('#bloc-empreinte').hidden = false;
      }
    });
    return etat.pair;
  }

  async function creerOffre() {
    etat.role = 'emetteur';
    $('#etape-1').hidden = false;
    $('#etape-2').hidden = true;
    $('#etape-3').hidden = true;
    const code = await creerPair().creerOffre();
    $('#code-a-envoyer').value = code;
    $('#sortie-code').hidden = false;
    journaliser('Offre créée — copiez le code et envoyez-le à votre correspondant.', 'info');
  }

  async function accepterOffre() {
    const code = $('#code-recu').value.trim();
    if (!code) {
      journaliser('✗ Collez d’abord le code reçu.', 'erreur');
      return;
    }
    etat.role = 'recepteur';
    try {
      const reponse = await creerPair().accepterOffre(code);
      $('#code-a-envoyer').value = reponse;
      $('#sortie-code').hidden = false;
      $('#etape-1').hidden = true;
      $('#etape-2').hidden = false;
      journaliser('Offre acceptée — renvoyez le code de réponse.', 'succes');
    } catch (e) {
      journaliser('✗ Code invalide : ' + e.message, 'erreur');
    }
  }

  async function accepterReponse() {
    const code = $('#code-recu').value.trim();
    if (!code) {
      journaliser('✗ Collez d’abord le code de réponse.', 'erreur');
      return;
    }
    try {
      await etat.pair.accepterReponse(code);
      journaliser('Réponse acceptée — le canal s’ouvre…', 'info');
    } catch (e) {
      journaliser('✗ Code invalide : ' + e.message, 'erreur');
    }
  }

  /* ---------------------------------------------------------------- */
  /* Conversation                                                      */
  /* ---------------------------------------------------------------- */

  async function envoyer() {
    const champ = $('#champ-message');
    const texte = champ.value.trim();
    if (!texte) return;
    try {
      await etat.pair.envoyer(texte);
      champ.value = '';
      champ.focus();
    } catch (e) {
      journaliser('✗ ' + e.message, 'erreur');
    }
  }

  /* ---------------------------------------------------------------- */
  /* Interface                                                         */
  /* ---------------------------------------------------------------- */

  function brancherUI() {
    $('#bouton-offre').addEventListener('click', creerOffre);
    $('#bouton-accepter-offre').addEventListener('click', accepterOffre);
    $('#bouton-accepter-reponse').addEventListener('click', accepterReponse);
    $('#bouton-envoyer').addEventListener('click', envoyer);
    $('#form-message').addEventListener('submit', (e) => {
      e.preventDefault();
      envoyer();
    });
    $('#bouton-copier').addEventListener('click', async () => {
      const zone = $('#code-a-envoyer');
      try {
        await navigator.clipboard.writeText(zone.value);
        journaliser('Code copié dans le presse-papiers.', 'succes');
      } catch (e) {
        zone.select();
        journaliser('Copie impossible : sélectionnez le code à la main.', 'info');
      }
    });
    $('#bouton-reinitialiser').addEventListener('click', () => {
      if (etat.pair) etat.pair.fermer();
      etat.pair = null;
      $('#messages').innerHTML = '';
      $('#journal').innerHTML = '';
      $('#code-a-envoyer').value = '';
      $('#code-recu').value = '';
      $('#sortie-code').hidden = true;
      $('#bloc-empreinte').hidden = true;
      $('#etape-1').hidden = false;
      $('#etape-2').hidden = true;
      $('#etape-3').hidden = true;
      majEtat('nouveau');
      journaliser('Session réinitialisée.', 'info');
    });
  }

  /* ---------------------------------------------------------------- */
  /* Thème                                                             */
  /* ---------------------------------------------------------------- */

  function appliquerTheme(sombre) {
    document.body.classList.toggle('sombre', sombre);
    const btn = $('#theme');
    if (btn) {
      btn.setAttribute('aria-pressed', String(sombre));
      btn.setAttribute('aria-label', sombre ? 'Passer au thème clair' : 'Passer au thème sombre');
      btn.title = sombre ? 'Mode clair' : 'Mode sombre';
    }
    try { localStorage.setItem(CLE_THEME, sombre ? 'sombre' : 'clair'); } catch (e) { /* file:// */ }
  }

  function initialiserTheme() {
    const sombre = document.body.classList.contains('sombre');
    const btn = $('#theme');
    if (btn) {
      btn.setAttribute('aria-pressed', String(sombre));
      btn.setAttribute('aria-label', sombre ? 'Passer au thème clair' : 'Passer au thème sombre');
      btn.title = sombre ? 'Mode clair' : 'Mode sombre';
      btn.addEventListener('click', () => {
        appliquerTheme(!document.body.classList.contains('sombre'));
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Démarrage                                                         */
  /* ---------------------------------------------------------------- */

  function demarrer() {
    brancherUI();
    initialiserTheme();
    majEtat('nouveau');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer);
  } else {
    demarrer();
  }
})(window);
