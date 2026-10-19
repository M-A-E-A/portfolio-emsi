/* =====================================================================
   Visionneuse d'aperçu — Abderrahmane El ADNANI
   Ouvre la maquette d'un projet en grand, dans une lightbox accessible.
   Sans JavaScript, l'aperçu réduit reste visible : rien n'est perdu.
   ===================================================================== */
(() => {
  "use strict";

  const ouvrants = Array.from(document.querySelectorAll("[data-ouvrir]"));
  if (!ouvrants.length) return;

  let dernierFocus = null;

  const focusables = (boite) =>
    Array.from(
      boite.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute("disabled"));

  function fermer(visionneuse) {
    visionneuse.hidden = true;
    document.body.classList.remove("visionneuse-ouverte");
    if (dernierFocus && typeof dernierFocus.focus === "function") {
      dernierFocus.focus();
    }
    dernierFocus = null;
  }

  function ouvrir(visionneuse, declencheur) {
    dernierFocus = declencheur || null;
    visionneuse.hidden = false;
    document.body.classList.add("visionneuse-ouverte");
    const premier = visionneuse.querySelector(".visionneuse-fermer");
    if (premier) premier.focus();
  }

  ouvrants.forEach((bouton) => {
    bouton.addEventListener("click", () => {
      const visionneuse = document.getElementById(bouton.dataset.ouvrir);
      if (visionneuse) ouvrir(visionneuse, bouton);
    });
  });

  document.querySelectorAll(".visionneuse").forEach((visionneuse) => {
    // Clic sur le fond (hors de la boîte) : ferme
    visionneuse.addEventListener("click", (e) => {
      if (e.target === visionneuse) fermer(visionneuse);
    });
    const boutonFermer = visionneuse.querySelector(".visionneuse-fermer");
    if (boutonFermer) {
      boutonFermer.addEventListener("click", () => fermer(visionneuse));
    }
    // Le focus reste à l'intérieur de la boîte ouverte
    visionneuse.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const liste = focusables(visionneuse);
      if (!liste.length) return;
      const premier = liste[0];
      const dernier = liste[liste.length - 1];
      if (e.shiftKey && document.activeElement === premier) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault();
        premier.focus();
      }
    });
  });

  // Échap ferme la visionneuse ouverte
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const ouverte = document.querySelector(".visionneuse:not([hidden])");
    if (ouverte) fermer(ouverte);
  });

  /* =====================================================================
     Démonstrations : l'aperçu agrandi est une petite appli utilisable.
     Chaque bloc est isolé et ne s'active que si ses éléments existent.
     ===================================================================== */

  const tous = (sel, racine = document) => Array.from(racine.querySelectorAll(sel));

  // Boutique — ajouter un article au panier
  tous(".prev-ajouter").forEach((bouton) => {
    bouton.addEventListener("click", () => {
      if (bouton.classList.contains("ajoute")) return;
      bouton.classList.add("ajoute");
      bouton.textContent = "Ajouté ✓";
      const nb = document.querySelector(".prev-panier-nb");
      if (nb) nb.textContent = String(Number(nb.textContent || 0) + 1);
    });
  });

  // API — changer de route (et de réponse)
  tous(".prev-route").forEach((route) => {
    route.addEventListener("click", () => {
      const cible = route.dataset.cible;
      tous(".prev-route").forEach((r) => r.classList.toggle("actif", r === route));
      tous(".prev-panneau").forEach((p) =>
        p.classList.toggle("actif", p.dataset.panneau === cible)
      );
    });
  });

  // Messagerie — envoyer un message
  const formulaireEnvoi = document.querySelector(".prev-envoi");
  if (formulaireEnvoi) {
    formulaireEnvoi.addEventListener("submit", (e) => {
      e.preventDefault();
      const champ = formulaireEnvoi.querySelector("input");
      const fil = document.querySelector(".prev-fil");
      const valeur = champ ? champ.value.trim() : "";
      if (!valeur || !fil) return;
      const bulle = document.createElement("div");
      bulle.className = "prev-msg moi";
      bulle.textContent = valeur;
      const quand = document.createElement("small");
      quand.textContent = "Moi · maintenant";
      bulle.appendChild(quand);
      fil.appendChild(bulle);
      champ.value = "";
      fil.scrollTop = fil.scrollHeight;
    });
  }

  // Dépenses — choisir un mois
  tous(".prev-barre-col").forEach((colonne) => {
    colonne.addEventListener("click", () => {
      tous(".prev-barre-col").forEach((c) => c.classList.toggle("actif", c === colonne));
      const lecture = document.querySelector(".prev-lecture");
      if (lecture) lecture.textContent = `${colonne.dataset.mois} : ${colonne.dataset.valeur}`;
    });
  });

  // Sélections liées : un clic sur un élément met en avant ses jumeaux
  // (contacts de la messagerie, lieux sur la carte…)
  tous("[data-ref]").forEach((element) => {
    element.addEventListener("click", () => {
      const groupe = element.dataset.groupe || "";
      const ref = element.dataset.ref;
      tous("[data-ref]").forEach((x) => {
        if ((x.dataset.groupe || "") === groupe) {
          x.classList.toggle("actif", x.dataset.ref === ref);
        }
      });
    });
  });

  // Quiz — répondre à la question
  const reponses = tous(".prev-reponse");
  if (reponses.length) {
    const score = document.querySelector(".prev-score");
    const note = document.querySelector(".prev-quiz-bas");
    let bonnes = Number((score && score.dataset.bonnes) || 0);
    reponses.forEach((reponse) => {
      reponse.addEventListener("click", () => {
        if (reponses.some((r) => r.dataset.repondu === "true")) return;
        reponses.forEach((r) => {
          r.dataset.repondu = "true";
          if (r.dataset.juste === "true") r.classList.add("juste");
        });
        const juste = reponse.dataset.juste === "true";
        if (juste) {
          bonnes += 1;
          if (note) note.textContent = "Bonne réponse !";
        } else {
          reponse.classList.add("faux");
          if (note) note.textContent = "Raté — la bonne réponse était Rabat.";
        }
        if (score) {
          score.dataset.bonnes = String(bonnes);
          const valeur = score.querySelector("b");
          if (valeur) valeur.textContent = String(bonnes);
        }
      });
    });
  }
})();
