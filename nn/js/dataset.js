/* =====================================================================
   Jeu de données — chiffres dessinés à la main.
   ---------------------------------------------------------------------
   Plutôt que de télécharger un jeu de données (ce qui casserait la
   promesse « aucune dépendance », et imposerait un accès réseau), les
   chiffres sont dessinés ici : chaque chiffre est une liste de
   polylignes, rasterisées en distance signée.

   Chaque échantillon reçoit ensuite une perturbation aléatoire
   (rotation, échelle, translation, bruit) : le réseau doit donc
   apprendre la forme, pas memoriser une image fixe.
   ===================================================================== */
(function (global) {
  'use strict';

  const NN = (global.NN = global.NN || {});

  const TAILLE = 16; // 16 × 16 pixels

  // Chaque chiffre : un tableau de polylignes, en coordonnées 0..1.
  const CHIFFRES = {
    0: [
      [[0.20, 0.16], [0.50, 0.05], [0.80, 0.16], [0.85, 0.50], [0.80, 0.84], [0.50, 0.95], [0.20, 0.84], [0.15, 0.50], [0.20, 0.16]]
    ],
    1: [
      [[0.34, 0.26], [0.50, 0.08], [0.50, 0.92]],
      [[0.28, 0.92], [0.72, 0.92]]
    ],
    2: [
      [[0.18, 0.26], [0.36, 0.09], [0.66, 0.09], [0.80, 0.28], [0.74, 0.46], [0.50, 0.63], [0.18, 0.90], [0.84, 0.90]]
    ],
    3: [
      [[0.22, 0.12], [0.60, 0.09], [0.73, 0.28], [0.50, 0.45], [0.78, 0.62], [0.68, 0.88], [0.24, 0.90]]
    ],
    4: [
      [[0.63, 0.08], [0.17, 0.63], [0.86, 0.63]],
      [[0.63, 0.34], [0.63, 0.93]]
    ],
    5: [
      [[0.76, 0.10], [0.28, 0.10], [0.23, 0.42], [0.60, 0.42], [0.79, 0.60], [0.70, 0.87], [0.24, 0.90]]
    ],
    6: [
      [[0.70, 0.09], [0.40, 0.12], [0.21, 0.40], [0.19, 0.72], [0.45, 0.93], [0.73, 0.85], [0.76, 0.62], [0.45, 0.49], [0.24, 0.60]]
    ],
    7: [
      [[0.17, 0.10], [0.83, 0.10], [0.44, 0.93]],
      [[0.31, 0.50], [0.66, 0.50]]
    ],
    8: [
      [[0.50, 0.09], [0.24, 0.22], [0.32, 0.40], [0.68, 0.40], [0.77, 0.22], [0.50, 0.09], [0.23, 0.60], [0.35, 0.87], [0.67, 0.87], [0.79, 0.60], [0.50, 0.45]]
    ],
    9: [
      [[0.76, 0.42], [0.50, 0.50], [0.25, 0.40], [0.30, 0.17], [0.62, 0.11], [0.77, 0.30], [0.72, 0.62], [0.50, 0.91], [0.29, 0.93]]
    ]
  };

  /* ---------------------------------------------------------------- */
  /* Rasterisation                                                     */
  /* ---------------------------------------------------------------- */

  function distanceSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const longueur2 = dx * dx + dy * dy;
    if (longueur2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / longueur2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  /** Distance d'un point (0..1) à l'ensemble des polylignes du chiffre. */
  function distanceAuChiffre(x, y, polylignes) {
    let min = Infinity;
    for (const ligne of polylignes) {
      for (let i = 0; i + 1 < ligne.length; i++) {
        const d = distanceSegment(x, y, ligne[i][0], ligne[i][1], ligne[i + 1][0], ligne[i + 1][1]);
        if (d < min) min = d;
      }
    }
    return min;
  }

  /** Applique rotation, échelle et translation à un point. */
  function transformer(x, y, angle, echelle, tx, ty) {
    const dx = (x - 0.5) * echelle;
    const dy = (y - 0.5) * echelle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return [0.5 + dx * cos - dy * sin + tx, 0.5 + dx * sin + dy * cos + ty];
  }

  /**
   * Rend un chiffre en grille TAILLE × TAILLE, valeurs entre 0 et 1.
   * Le rendu par distance donne un anticrénelage gratuit.
   */
  function rendre(chiffre, alea, epaisseur) {
    const polylignes = CHIFFRES[chiffre];
    const angle = (alea() - 0.5) * 0.42;          // ± 12°
    const echelle = 0.82 + alea() * 0.24;           // 0.82 → 1.06
    const tx = (alea() - 0.5) * 0.10;
    const ty = (alea() - 0.5) * 0.10;
    const demi = (epaisseur || 0.085) / 2;

    const grille = new Float32Array(TAILLE * TAILLE);
    for (let py = 0; py < TAILLE; py++) {
      for (let px = 0; px < TAILLE; px++) {
        const ux = (px + 0.5) / TAILLE;
        const uy = (py + 0.5) / TAILLE;
        let min = Infinity;
        for (const ligne of polylignes) {
          for (let i = 0; i + 1 < ligne.length; i++) {
            const a = transformer(ligne[i][0], ligne[i][1], angle, echelle, tx, ty);
            const b = transformer(ligne[i + 1][0], ligne[i + 1][1], angle, echelle, tx, ty);
            const d = distanceSegment(ux, uy, a[0], a[1], b[0], b[1]);
            if (d < min) min = d;
          }
        }
        // Anti-crénelage : intensity lisse sur une demi-largeur de trait
        const intensite = Math.max(0, Math.min(1, 1 - (min - demi) / demi));
        grille[py * TAILLE + px] = intensite;
      }
    }
    return grille;
  }

  /**
   * Construit un jeu de données.
   * @param {number} parChiffre  nombre d'exemples par chiffre
   * @param {number} graine
   */
  function construire(parChiffre, graine) {
    const alea = NN.generateur(graine || 1234);
    const echantillons = [];
    for (let chiffre = 0; chiffre <= 9; chiffre++) {
      for (let i = 0; i < parChiffre; i++) {
        // Épaisseur variable : le réseau doit être robuste au trait.
        const epaisseur = 0.07 + alea() * 0.045;
        const x = rendre(chiffre, alea, epaisseur);
        // Un peu de bruit : imite la pixellisation d'un scanned.
        for (let p = 0; p < x.length; p++) {
          if (x[p] > 0) x[p] = Math.max(0, Math.min(1, x[p] + (alea() - 0.5) * 0.18));
        }
        echantillons.push({ x, y: chiffre });
      }
    }
    // Mélange déterministe
    for (let i = echantillons.length - 1; i > 0; i--) {
      const j = Math.floor(alea() * (i + 1));
      const t = echantillons[i];
      echantillons[i] = echantillons[j];
      echantillons[j] = t;
    }
    return echantillons;
  }

  NN.CHIFFRES = CHIFFRES;
  NN.TAILLE = TAILLE;
  NN.rendre = rendre;
  NN.construire = construire;
})(window);
