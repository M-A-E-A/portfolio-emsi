/* =====================================================================
   Application — scènes, caméra, interface.
   ---------------------------------------------------------------------
   Le moteur (moteur.js) ne sait rien de l'interface : il ne fait que
   rendre une scène vue par une caméra. Ce fichier assemble les deux
   et gère les réglages.
   ===================================================================== */
(function (global) {
  'use strict';

  const RT = global.RT;
  const { Vec3, Material, PointLight, DirectionalLight, Scene, Camera, Sphere, Plane, Box } = RT;

  const CLE_THEME = 'raytracer-theme';

  // Surface publique : utile pour l'inspection depuis la console.
  global.RTApp = global.RTApp || {};

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /* ---------------------------------------------------------------- */
  /* Scènes                                                           */
  /* ---------------------------------------------------------------- */

  function sceneVitrine() {
    const s = new Scene();
    s.ambient = new Vec3(0.05, 0.055, 0.07);
    s.skyTop = new Vec3(0.16, 0.28, 0.60);
    s.skyBottom = new Vec3(0.55, 0.62, 0.74);
    s.sunDirection = new Vec3(-0.45, 0.58, -0.68).normalize();
    s.sunIntensity = 1;
    s.sunColor = new Vec3(1, 0.96, 0.88);

    s.add(new Plane(0, new Material({ albedo: new Vec3(0.93, 0.93, 0.93), roughness: 0.8, checker: 0.9 })));

    // Sphère de verre : c'est elle qui met en valeur la réfraction.
    s.add(new Sphere(new Vec3(-1.35, 0.95, 0), 0.95, new Material({
      albedo: new Vec3(0.94, 0.97, 1), roughness: 0.02, transmission: 1, ior: 1.52
    })));
    // Sphère de métal doré : réflexion teintée.
    s.add(new Sphere(new Vec3(1.35, 0.8, 0.35), 0.8, new Material({
      albedo: new Vec3(0.96, 0.74, 0.33), metallic: 1, roughness: 0.14
    })));
    // Sphère mate colorée : contraste de matière.
    s.add(new Sphere(new Vec3(-1.75, 0.45, 1.25), 0.45, new Material({
      albedo: new Vec3(0.22, 0.52, 0.82), roughness: 0.55
    })));
    // Boîte tournée : montre que l'intersection n'est pas que pour les sphères.
    s.add(new Box(new Vec3(2.05, 0.32, 1.45), new Vec3(0.46, 0.32, 0.46), new Material({
      albedo: new Vec3(0.82, 0.28, 0.32), roughness: 0.55
    }), 0.6));

    s.addLight(new DirectionalLight(s.sunDirection, new Vec3(1, 0.97, 0.9), 0.95, 0.025));
    s.addLight(new PointLight(new Vec3(-3.4, 3.6, 2.8), new Vec3(1, 0.85, 0.7), 1.4, 0.35));
    return s;
  }

  function sceneMiroir() {
    const s = new Scene();
    s.ambient = new Vec3(0.07, 0.08, 0.1);
    s.skyTop = new Vec3(0.12, 0.16, 0.30);
    s.skyBottom = new Vec3(0.34, 0.40, 0.52);
    s.sunDirection = new Vec3(0.3, 0.72, -0.62).normalize();
    s.sunIntensity = 0.8;

    // Sol poli : il renvoie les sphères.
    s.add(new Plane(0, new Material({
      albedo: new Vec3(0.92, 0.94, 0.98), metallic: 1, roughness: 0.035
    })));

    s.add(new Sphere(new Vec3(-1.5, 0.75, 0), 0.75, new Material({
      albedo: new Vec3(0.85, 0.2, 0.25), roughness: 0.4
    })));
    s.add(new Sphere(new Vec3(0, 0.6, -0.3), 0.6, new Material({
      albedo: new Vec3(0.98, 0.85, 0.35), metallic: 1, roughness: 0.1
    })));
    s.add(new Sphere(new Vec3(1.6, 0.9, 0.2), 0.9, new Material({
      albedo: new Vec3(0.9, 0.96, 1), roughness: 0.02, transmission: 1, ior: 1.45
    })));

    s.addLight(new PointLight(new Vec3(0, 4.2, 1.5), new Vec3(1, 0.98, 0.94), 2.6, 0.5));
    s.addLight(new PointLight(new Vec3(-4, 2, -3), new Vec3(0.55, 0.7, 1), 1.5, 0.4));
    return s;
  }

  function sceneSoleil() {
    const s = new Scene();
    s.ambient = new Vec3(0.045, 0.05, 0.06);
    s.skyTop = new Vec3(0.42, 0.52, 0.78);
    s.skyBottom = new Vec3(0.78, 0.72, 0.62);
    s.sunDirection = new Vec3(-0.82, 0.34, -0.46).normalize();
    s.sunIntensity = 1.4;
    s.sunColor = new Vec3(1, 0.9, 0.74);

    s.add(new Plane(0, new Material({ albedo: new Vec3(0.86, 0.83, 0.78), roughness: 0.9, checker: 0.7 })));

    s.add(new Box(new Vec3(-1.6, 0.7, 0), new Vec3(0.45, 0.7, 0.45), new Material({
      albedo: new Vec3(0.8, 0.78, 0.74), roughness: 0.85
    }), 0.35));
    s.add(new Box(new Vec3(0.4, 0.45, -0.9), new Vec3(0.45, 0.45, 0.45), new Material({
      albedo: new Vec3(0.72, 0.76, 0.8), roughness: 0.8
    }), -0.5));
    s.add(new Sphere(new Vec3(1.7, 0.55, 0.5), 0.55, new Material({
      albedo: new Vec3(0.85, 0.4, 0.22), roughness: 0.7
    })));

    s.addLight(new DirectionalLight(s.sunDirection, new Vec3(1, 0.92, 0.78), 1.35, 0.012));
    return s;
  }

  function sceneNuage() {
    const s = new Scene();
    s.ambient = new Vec3(0.12, 0.14, 0.18);
    s.skyTop = new Vec3(0.18, 0.26, 0.52);
    s.skyBottom = new Vec3(0.6, 0.66, 0.8);
    s.sunDirection = new Vec3(0.2, 0.85, -0.5).normalize();
    s.sunIntensity = 1.1;

    const couleurs = [
      [0.95, 0.45, 0.35], [0.35, 0.62, 0.92], [0.96, 0.82, 0.4],
      [0.45, 0.82, 0.6], [0.78, 0.5, 0.9]
    ];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const r = 2.1;
      const c = couleurs[i];
      s.add(new Sphere(
        new Vec3(Math.cos(a) * r, 0.9 + Math.sin(i * 1.7) * 0.7, Math.sin(a) * r),
        0.42 + (i % 3) * 0.12,
        new Material({ albedo: new Vec3(c[0], c[1], c[2]), roughness: 0.35 })
      ));
    }

    s.addLight(new PointLight(new Vec3(2.5, 3.2, 2.5), new Vec3(1, 0.95, 0.88), 1.9, 0.6));
    s.addLight(new PointLight(new Vec3(-2.8, 1.2, -2.2), new Vec3(0.6, 0.72, 1), 1.2, 0.5));
    return s;
  }

  const SCENES = {
    vitrine: { label: 'Vitrine', build: sceneVitrine, camera: { az: 0.72, el: 0.24, dist: 8.6, ty: 0.95 } },
    miroir: { label: 'Miroir', build: sceneMiroir, camera: { az: 0.45, el: 0.19, dist: 7.4, ty: 0.9 } },
    soleil: { label: 'Soleil', build: sceneSoleil, camera: { az: 0.95, el: 0.16, dist: 9.2, ty: 0.75 } },
    nuage: { label: 'Nuage', build: sceneNuage, camera: { az: 0.3, el: 0.16, dist: 8.6, ty: 1.1 } }
  };

  /* ---------------------------------------------------------------- */
  /* État de la vue                                                   */
  /* ---------------------------------------------------------------- */

  const etat = {
    scene: 'vitrine',
    az: 0.72,
    el: 0.24,
    dist: 8.6,
    cible: new Vec3(0, 0.95, 0),
    echelle: 0.5,
    echantillonsMax: 160,
    ombres: true,
    reflets: true,
    refraction: true,
    profondeur: 5,
    exposition: 0.55,
    ouverture: 0,
    fov: 42,
    enCours: true
  };

  const camera = new Camera();
  let renderer = null;
  let boucle = 0;

  function appliquerCamera() {
    const ce = Math.cos(etat.el);
    const se = Math.sin(etat.el);
    camera.origin = new Vec3(
      etat.cible.x + etat.dist * ce * Math.sin(etat.az),
      etat.cible.y + etat.dist * se,
      etat.cible.z + etat.dist * ce * Math.cos(etat.az)
    );
    camera.target = etat.cible;
    camera.fov = etat.fov;
    camera.aperture = etat.ouverture;
  }

  /* ---------------------------------------------------------------- */
  /* Interface                                                        */
  /* ---------------------------------------------------------------- */

  function majStats() {
    const s = renderer;
    $('#stat-echantillons').textContent = String(s.samples);
    $('#stat-rayons').textContent = s.rays.toLocaleString('fr-FR');
    $('#stat-resolution').textContent = s.width + ' × ' + s.height;
    $('#stat-temps').textContent = s.frameMs.toFixed(1) + ' ms';
    const pct = Math.min(100, Math.round((s.samples / etat.echantillonsMax) * 100));
    $('#barre-progression').style.width = pct + '%';
    $('#stat-progression').textContent = pct + ' %';
  }

  function redimensionner() {
    const canvas = $('#vue');
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false; // pas encore mis en page
    const w = rect.width * etat.echelle;
    const h = rect.height * etat.echelle;
    renderer.resize(w, h);
    majStats();
    return true;
  }

  function changerScene(nom) {
    const def = SCENES[nom];
    if (!def) return;
    etat.scene = nom;
    const scene = def.build();
    renderer.setScene(scene);
    etat.az = def.camera.az;
    etat.el = def.camera.el;
    etat.dist = def.camera.dist;
    etat.cible = new Vec3(0, def.camera.ty, 0);
    appliquerCamera();
    renderer.setCamera(camera);
    $$('[data-scene]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.scene === nom));
    });
    $('#nom-scene').textContent = def.label;
    $('#desc-scene').textContent = descriptionScene(nom);
    majStats();
  }

  function descriptionScene(nom) {
    switch (nom) {
      case 'miroir': return 'Un sol poli renvoie les sphères : la réflexion se lit dans le sol.';
      case 'soleil': return 'Un soleil rasant allonge les ombres portées sur le sol damier.';
      case 'nuage': return 'Des sphères flottantes, sans sol : chaque rayon rencontre le ciel.';
      default: return 'Sphère de verre, sphère dorée, boîte : réfraction, métal et ombres douces.';
    }
  }

  function bindUI() {
    // --- Scènes ---
    $$('[data-scene]').forEach((b) => {
      b.addEventListener('click', () => changerScene(b.dataset.scene));
    });

    // --- Résolution ---
    $('#reglage-echelle').addEventListener('change', (e) => {
      etat.echelle = parseFloat(e.target.value);
      redimensionner();
    });

    // --- Échantillons ---
    $('#reglage-echantillons').addEventListener('input', (e) => {
      etat.echantillonsMax = parseInt(e.target.value, 10);
      $('#valeur-echantillons').textContent = String(etat.echantillonsMax);
      renderer.maxSamples = etat.echantillonsMax;
      // Si la limite est relevée, on relance le rendu.
      if (etat.echantillonsMax > renderer.samples && !etat.enCours) {
        etat.enCours = true;
        $('#bouton-pause').setAttribute('aria-pressed', 'false');
        $('#bouton-pause').querySelector('.libelle').textContent = 'Suspendre';
      }
    });

    // --- Effets ---
    $('#reglage-ombres').addEventListener('change', (e) => {
      etat.ombres = e.target.checked;
      renderer.options.shadows = etat.ombres;
      renderer.reset();
    });
    $('#reglage-reflets').addEventListener('change', (e) => {
      etat.reflets = e.target.checked;
      renderer.options.reflections = etat.reflets;
      renderer.reset();
    });
    $('#reglage-refraction').addEventListener('change', (e) => {
      etat.refraction = e.target.checked;
      renderer.options.refraction = etat.refraction;
      renderer.reset();
    });

    // --- Profondeur de réflexion ---
    $('#reglage-profondeur').addEventListener('input', (e) => {
      etat.profondeur = parseInt(e.target.value, 10);
      $('#valeur-profondeur').textContent = String(etat.profondeur);
      renderer.options.maxDepth = etat.profondeur;
      renderer.reset();
    });

    // --- Exposition (tone mapping) ---
    $('#reglage-exposition').addEventListener('input', (e) => {
      etat.exposition = parseInt(e.target.value, 10) / 100;
      $('#valeur-exposition').textContent = etat.exposition.toFixed(1) + '×';
      renderer.exposure = etat.exposition;
      renderer.refreshPreview();
      renderer.present();
    });

    // --- Ouverture (profondeur de champ) ---
    $('#reglage-ouverture').addEventListener('input', (e) => {
      etat.ouverture = parseFloat(e.target.value) / 1000;
      $('#valeur-ouverture').textContent = (etat.ouverture * 100).toFixed(1) + ' %';
      appliquerCamera();
      renderer.setCamera(camera);
    });

    // --- Champ de vision ---
    $('#reglage-fov').addEventListener('input', (e) => {
      etat.fov = parseInt(e.target.value, 10);
      $('#valeur-fov').textContent = etat.fov + '°';
      appliquerCamera();
      renderer.setCamera(camera);
    });

    // --- Commandes ---
    $('#bouton-pause').addEventListener('click', (e) => {
      etat.enCours = !etat.enCours;
      e.currentTarget.setAttribute('aria-pressed', String(!etat.enCours));
      e.currentTarget.querySelector('.libelle').textContent = etat.enCours ? 'Suspendre' : 'Reprendre';
      majStats();
    });
    $('#bouton-reset').addEventListener('click', () => {
      renderer.reset();
      majStats();
    });
    $('#bouton-image').addEventListener('click', () => {
      const a = document.createElement('a');
      a.download = 'raytracer-' + etat.scene + '.png';
      a.href = renderer.canvas.toDataURL('image/png');
      a.click();
    });
  }

  /* ---------------------------------------------------------------- */
  /* Contrôles caméra                                                 */
  /* ---------------------------------------------------------------- */

  function brancherCamera() {
    const canvas = $('#vue');
    let enCours = false;
    let dernierX = 0;
    let dernierY = 0;

    canvas.addEventListener('pointerdown', (e) => {
      enCours = true;
      dernierX = e.clientX;
      dernierY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('en-glisse');
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!enCours) return;
      const dx = e.clientX - dernierX;
      const dy = e.clientY - dernierY;
      dernierX = e.clientX;
      dernierY = e.clientY;

      if (e.shiftKey) {
        // Déplacement latéral de la cible
        const droite = new Vec3(Math.cos(etat.az), 0, -Math.sin(etat.az));
        const haut = new Vec3(0, 1, 0);
        const k = etat.dist * 0.0016;
        etat.cible = etat.cible.add(droite.mul(-dx * k)).add(haut.mul(dy * k));
      } else {
        etat.az -= dx * 0.006;
        etat.el = Math.max(-1.35, Math.min(1.35, etat.el + dy * 0.005));
      }
      appliquerCamera();
      renderer.setCamera(camera);
    });

    const relacher = (e) => {
      enCours = false;
      canvas.classList.remove('en-glisse');
      if (e && e.pointerId !== undefined && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    };
    canvas.addEventListener('pointerup', relacher);
    canvas.addEventListener('pointercancel', relacher);

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      etat.dist = Math.max(1.4, Math.min(34, etat.dist * (1 + e.deltaY * 0.0012)));
      appliquerCamera();
      renderer.setCamera(camera);
    }, { passive: false });

    canvas.addEventListener('dblclick', () => {
      const def = SCENES[etat.scene];
      etat.az = def.camera.az;
      etat.el = def.camera.el;
      etat.dist = def.camera.dist;
      etat.cible = new Vec3(0, def.camera.ty, 0);
      appliquerCamera();
      renderer.setCamera(camera);
    });

    canvas.addEventListener('keydown', (e) => {
      const pas = e.shiftKey ? 0.25 : 0.08;
      let change = true;
      switch (e.key) {
        case 'ArrowLeft': etat.az -= pas; break;
        case 'ArrowRight': etat.az += pas; break;
        case 'ArrowUp': etat.el = Math.min(1.35, etat.el + pas * 0.6); break;
        case 'ArrowDown': etat.el = Math.max(-1.35, etat.el - pas * 0.6); break;
        case '+': case '=': etat.dist = Math.max(1.4, etat.dist * 0.9); break;
        case '-': case '_': etat.dist = Math.min(34, etat.dist * 1.1); break;
        default: change = false;
      }
      if (change) {
        e.preventDefault();
        appliquerCamera();
        renderer.setCamera(camera);
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /* Thème clair / sombre                                             */
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
    // La classe « sombre » a déjà été posée par le script en ligne dans le
    // <body> : on se contente de refléter l'état dans le bouton.
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
  /* Boucle de rendu                                                  */
  /* ---------------------------------------------------------------- */

  function boucleRendu() {
    if (!etat.enCours) return;

    // Le canvas peut ne pas encore avoir de taille (polices non chargées,
    // onglet en arrière-plan) : on retente au frame suivant plutôt que
    // d'abandonner le rendu.
    if (!renderer.buffer && !redimensionner()) {
      planifier();
      return;
    }

    const suite = renderer.step(14); // 14 ms de rendu par frame
    majStats();
    if (!suite) {
      etat.enCours = false;
      const btn = $('#bouton-pause');
      btn.setAttribute('aria-pressed', 'true');
      btn.querySelector('.libelle').textContent = 'Reprendre';
      return;
    }
    planifier();
  }

  /**
   * Planifie le prochain rendu. On utilise requestAnimationFrame quand la
   * page est visible ; sinon les frames ne sont jamais servies et le
   * rendu resterait bloqué (onglet en arrière-plan, fenêtre masquée).
   */
  function planifier() {
    if (document.hidden) {
      boucle = setTimeout(boucleRendu, 80);
    } else {
      boucle = requestAnimationFrame(boucleRendu);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Démarrage                                                        */
  /* ---------------------------------------------------------------- */

  function demarrer() {
    renderer = new RT.Renderer($('#vue'));
    renderer.options.shadows = etat.ombres;
    renderer.options.reflections = etat.reflets;
    renderer.options.refraction = etat.refraction;
    renderer.options.maxDepth = etat.profondeur;
    renderer.maxSamples = etat.echantillonsMax;
    renderer.exposure = etat.exposition;

    appliquerCamera();
    redimensionner();
    changerScene('vitrine');
    brancherCamera();
    bindUI();
    initialiserTheme();

    window.addEventListener('resize', () => {
      redimensionner();
    });

    // Démarrage du rendu. On tente tout de suite (le canvas peut encore
    // avoir une taille nulle) et on réessaie depuis la boucle si besoin.
    redimensionner();
    planifier();
    requestAnimationFrame(redimensionner);

    // Quand l'onglet redevient visible, on reprend le rendu.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && etat.enCours) planifier();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer);
  } else {
    demarrer();
  }

  global.RTApp = global.RTApp || {};
  global.RTApp.etat = etat;
  global.RTApp.SCENES = SCENES;
  global.RTApp.getRenderer = function () { return renderer; };
})(window);
