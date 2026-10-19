/* =====================================================================
   Moteur de rendu — ray tracing logiciel, sans WebGL ni bibliothèque.
   ---------------------------------------------------------------------
   Le principe : pour chaque pixel, on lance un rayon depuis la caméra.
   On cherche l'objet le plus proche (test d'intersection), on calcule
   l'ombrage du point touché (diffuse, spéculaire, ombres, réflexion,
   réfraction) puis on recommence pour les rayons secondaires.

   Choix d'architecture :
   - rendu PROGRESSIF : le rendu s'améliore échantillon par échantillon
     (anti-aliasing par jitter + accumulation). On peut donc laisser
     tourner un rendu "parfait" en arrière-plan sans bloquer l'interface.
   - budget de temps par tranche : le rendu est découpé en bandes, on
     s'arrête quand la tranche dépasse quelques millisecondes, puis on
     reprend au frame suivant. L'interface reste fluide à tout instant.
   ===================================================================== */
(function (global) {
  'use strict';

  const RT = (global.RT = global.RT || {});
  const { Vec3 } = RT;

  /* ---------------------------------------------------------------- */
  /* Matériaux                                                        */
  /* ---------------------------------------------------------------- */

  class Material {
    constructor(opts) {
      opts = opts || {};
      this.albedo = opts.albedo || new Vec3(0.8, 0.8, 0.8);
      this.emissive = opts.emissive || new Vec3(0, 0, 0);
      this.metallic = opts.metallic !== undefined ? opts.metallic : 0;
      this.roughness = opts.roughness !== undefined ? opts.roughness : 0.6;
      this.transmission = opts.transmission !== undefined ? opts.transmission : 0;
      this.ior = opts.ior !== undefined ? opts.ior : 1.5;
      this.reflectance = opts.reflectance !== undefined ? opts.reflectance : 0.04;
      this.checker = opts.checker || 0;
      this.uvScale = opts.uvScale || 1;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Lumières                                                         */
  /* ---------------------------------------------------------------- */

  class PointLight {
    constructor(position, color, intensity, radius) {
      this.kind = 'point';
      this.position = position;
      this.color = color || new Vec3(1, 1, 1);
      this.intensity = intensity !== undefined ? intensity : 1;
      this.radius = radius !== undefined ? radius : 0.25; // demi-taille de la source
    }
  }

  class DirectionalLight {
    /**
     * @param {Vec3} direction  direction POINTS VERS la source (comme pour
     *                          une source ponctuelle). Le rayon d'ombre part
     *                          donc dans ce sens, et L = direction.
     */
    constructor(direction, color, intensity, softness) {
      this.kind = 'directional';
      this.direction = direction.normalize();
      this.color = color || new Vec3(1, 1, 1);
      this.intensity = intensity !== undefined ? intensity : 1;
      this.softness = softness !== undefined ? softness : 0.04;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Scénario : caméra + objets + lumières + ciel                     */
  /* ---------------------------------------------------------------- */

  class Scene {
    constructor() {
      this.objects = [];
      this.lights = [];
      this.ambient = new Vec3(0.06, 0.07, 0.09);
      this.skyTop = new Vec3(0.35, 0.48, 0.78);
      this.skyBottom = new Vec3(0.82, 0.86, 0.92);
      this.sunDirection = new Vec3(-0.4, 0.75, -0.5).normalize();
      this.sunColor = new Vec3(1, 0.96, 0.88);
      this.sunIntensity = 0;
    }

    add(object) {
      this.objects.push(object);
      return object;
    }

    addLight(light) {
      this.lights.push(light);
      return light;
    }
  }

  class Camera {
    constructor() {
      this.origin = new Vec3(0, 1.4, 5.5);
      this.target = new Vec3(0, 1.1, 0);
      this.up = new Vec3(0, 1, 0);
      this.fov = 42;
      this.aperture = 0;
    }

    /** u, v ∈ [-1, 1] — coordonnées écran normalisées. */
    ray(u, v) {
      const forward = this.target.sub(this.origin);
      const dist = forward.length();
      const f = forward.div(dist || 1);
      const right = f.cross(this.up).normalize();
      const trueUp = right.cross(f);
      const scale = Math.tan((this.fov * Math.PI) / 180 / 2);
      let direction = f
        .add(right.mul(u * scale))
        .add(trueUp.mul(v * scale))
        .normalize();

      let origin = this.origin;
      if (this.aperture > 0) {
        // Échantillonnage sur le disque de l'ouverture (profondeur de champ)
        const r = this.aperture * Math.sqrt(Math.random());
        const theta = Math.random() * Math.PI * 2;
        origin = origin
          .add(right.mul(r * Math.cos(theta)))
          .add(trueUp.mul(r * Math.sin(theta)));
      }
      return { origin, direction };
    }
  }

  /* ---------------------------------------------------------------- */
  /* Objets : sphère, plan, boîte                                     */
  /* ---------------------------------------------------------------- */

  class Sphere {
    constructor(center, radius, material) {
      this.kind = 'sphere';
      this.center = center;
      this.radius = radius;
      this.material = material;
    }

    intersect(ray) {
      // Équation : |O + t·D - C|² = r²  =>  a·t² + b·t + c = 0
      // avec oc = O - C (et non C - O : le signe de b serait faux,
      // et le discriminant deviendrait négatif — aucune sphère ne
      // serait jamais atteinte).
      const oc = ray.origin.sub(this.center);
      const a = ray.direction.dot(ray.direction);
      const b = 2 * ray.direction.dot(oc);
      const c = oc.dot(oc) - this.radius * this.radius;
      const disc = b * b - 4 * a * c;
      if (disc < 0) return null;
      const sq = Math.sqrt(disc);
      let t = (-b - sq) / (2 * a);
      if (t < 1e-4) t = (-b + sq) / (2 * a);
      if (t < 1e-4) return null;
      const point = ray.origin.add(ray.direction.mul(t));
      const normal = point.sub(this.center).div(this.radius);
      return { t, point, normal, material: this.material };
    }
  }

  class Plane {
    /** Plan horizontal d'équation y = height, illimité. */
    constructor(height, material) {
      this.kind = 'plane';
      this.height = height;
      this.material = material;
    }

    intersect(ray) {
      if (Math.abs(ray.direction.y) < 1e-8) return null;
      const t = (this.height - ray.origin.y) / ray.direction.y;
      if (t < 1e-4) return null;
      const point = ray.origin.add(ray.direction.mul(t));
      return {
        t,
        point,
        normal: new Vec3(0, 1, 0),
        material: this.material,
        uv: [point.x, point.z]
      };
    }
  }

  class Box {
    /** Boîte alignée sur les axes, tournée d'un angle autour de Y. */
    constructor(center, half, material, rotationY) {
      this.kind = 'box';
      this.center = center;
      this.half = half;
      this.material = material;
      this.rotationY = rotationY || 0;
      this.cos = Math.cos(-this.rotationY);
      this.sin = Math.sin(-this.rotationY);
    }

    toLocal(p) {
      const d = p.sub(this.center);
      return new Vec3(
        d.x * this.cos - d.z * this.sin,
        d.y,
        d.x * this.sin + d.z * this.cos
      );
    }

    /**
     * Direction exprimée dans le repère local. C'est la MÊME rotation que
     * toLocal (et non son inverse) : un vecteur se transforme comme un
     * point, sans translation.
     */
    toLocalDir(d) {
      return new Vec3(
        d.x * this.cos - d.z * this.sin,
        d.y,
        d.x * this.sin + d.z * this.cos
      );
    }

    /** Rotation inverse : sert à ramener une normale locale dans le monde. */
    toWorldDir(d) {
      return new Vec3(
        d.x * this.cos + d.z * this.sin,
        d.y,
        -d.x * this.sin + d.z * this.cos
      );
    }

    intersect(ray) {
      const origin = this.toLocal(ray.origin);
      const dir = this.toLocalDir(ray.direction);
      let tmin = -Infinity;
      let tmax = Infinity;
      let axis = 0;
      let sign = 1;

      for (let i = 0; i < 3; i++) {
        const o = i === 0 ? origin.x : i === 1 ? origin.y : origin.z;
        const d = i === 0 ? dir.x : i === 1 ? dir.y : dir.z;
        const h = i === 0 ? this.half.x : i === 1 ? this.half.y : this.half.z;
        if (Math.abs(d) < 1e-8) {
          if (o < -h || o > h) return null;
          continue;
        }
        const inv = 1 / d;
        let t1 = (-h - o) * inv;
        let t2 = (h - o) * inv;
        let s = -1;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
          s = 1;
        }
        if (t1 > tmin) {
          tmin = t1;
          axis = i;
          sign = s;
        }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return null;
      }

      let t = tmin;
      if (t < 1e-4) t = tmax;
      if (t < 1e-4) return null;

      const point = ray.origin.add(ray.direction.mul(t));
      const localNormal = new Vec3(
        axis === 0 ? sign : 0,
        axis === 1 ? sign : 0,
        axis === 2 ? sign : 0
      );
      const normal = this.toWorldDir(localNormal);
      return { t, point, normal, material: this.material };
    }
  }

  /* ---------------------------------------------------------------- */
  /* Fonctions optiques                                               */
  /* ---------------------------------------------------------------- */

  /** Réflexion de Fresnel (approximation de Schlick). */
  function schlick(cosTheta, f0) {
    const c = Math.max(0, Math.min(1, cosTheta));
    return f0 + (1 - f0) * Math.pow(1 - c, 5);
  }

  /** Réfraction de Snell. Renvoie null en cas de réflexion totale. */
  function refract(dir, normal, eta) {
    const cosi = -normal.dot(dir);
    const k = 1 - eta * eta * (1 - cosi * cosi);
    if (k < 0) return null;
    return dir.mul(eta).add(normal.mul(eta * cosi - Math.sqrt(k))).normalize();
  }

  /** Réponse spectrale d'une tone curve ACES (approximation de Narkowicz). */
  function aces(x) {
    const a = 2.51;
    const b = 0.03;
    const c = 2.43;
    const d = 0.59;
    const e = 0.14;
    return Math.max(0, Math.min(1, (x * (a * x + b)) / (x * (c * x + d) + e)));
  }

  function encodeGamma(v) {
    return Math.round(255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2));
  }

  /* ---------------------------------------------------------------- */
  /* Le moteur                                                        */
  /* ---------------------------------------------------------------- */

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.width = 0;
      this.height = 0;
      this.buffer = null;      // accumulation de radiance (Float32Array RGB)
      this.image = null;       // ImageData pour l'affichage
      this.samples = 0;
      this.row = 0;
      this.rays = 0;
      this.frameMs = 0;
      this.dirty = true;
      this.running = false;

      this.scene = new Scene();
      this.camera = new Camera();
      this.maxSamples = 512;
      this.exposure = 1;

      this.options = {
        shadows: true,
        reflections: true,
        refraction: true,
        maxDepth: 5,
        shadowSamples: 4
      };
    }

    /* ---------------- Cycle de vie ---------------- */

    resize(width, height) {
      width = Math.max(16, Math.round(width));
      height = Math.max(16, Math.round(height));
      if (width === this.width && height === this.height) return;
      this.width = width;
      this.height = height;
      this.canvas.width = width;
      this.canvas.height = height;
      this.buffer = new Float32Array(width * height * 3);
      this.image = this.ctx.createImageData(width, height);

      // Aperçu basse résolution : rendu 3 fois plus petit, donc 9 fois
      // moins de rayons. Il s'affiche immédiatement et évite l'écran
      // noir qui précéderait la première passe complète.
      this.previewWidth = Math.max(8, Math.round(width / 3));
      this.previewHeight = Math.max(8, Math.round(height / 3));
      this.previewCanvas = document.createElement('canvas');
      this.previewCanvas.width = this.previewWidth;
      this.previewCanvas.height = this.previewHeight;
      this.previewCtx = this.previewCanvas.getContext('2d');
      this.previewBuffer = new Float32Array(this.previewWidth * this.previewHeight * 3);
      this.previewImage = this.previewCtx.createImageData(this.previewWidth, this.previewHeight);

      this.reset();
    }

    /** Invalide l'accumulation : le rendu repart de zéro. */
    reset() {
      if (this.buffer) this.buffer.fill(0);
      if (this.previewBuffer) this.previewBuffer.fill(0);
      this.samples = 0;
      this.row = 0;
      this.rays = 0;
      this.previewDone = false;
      this.dirty = true;
    }

    setScene(scene) {
      this.scene = scene;
      this.reset();
    }

    setCamera(camera) {
      this.camera = camera;
      this.reset();
    }

    /* ---------------- Rendu ---------------- */

    /**
     * Rend une tranche de temps (budget en ms) et affiche le résultat.
     * @returns {boolean} true s'il reste du travail à faire.
     */
    step(budgetMs) {
      // Pas encore de tampon (le canvas n'a pas de taille) : on ne conclut
      // rien, l'appelant réessaiera au frame suivant.
      if (!this.buffer) return true;

      // Première venue : on rend d'abord un aperçu basse résolution.
      // Il coûte 9 fois moins de rayons et donne tout de suite une image
      // lisible, au lieu d'un rectangle noir.
      if (!this.previewDone) {
        this.renderPreview();
        this.previewDone = true;
        return true;
      }

      const start = performance.now();
      const jitterSeed = this.samples * 977 + 13;

      while (this.row < this.height) {
        this.renderRow(this.row, jitterSeed);
        this.row++;
        if (performance.now() - start > budgetMs) break;
      }

      this.present();
      this.frameMs = performance.now() - start;

      if (this.row >= this.height) {
        this.samples++;
        this.row = 0;
        return this.samples < this.maxSamples;
      }
      return true;
    }

    /**
     * Ré-applique le tone mapping à l'aperçu (utile quand l'exposition
     * change : on ne refait pas les rayons, on recompose seulement).
     */
    refreshPreview() {
      if (!this.previewBuffer) return;
      const buf = this.previewBuffer;
      const data = this.previewImage.data;
      for (let i = 0, p = 0; i < buf.length; i += 3, p += 4) {
        data[p] = encodeGamma(aces(buf[i] * this.exposure));
        data[p + 1] = encodeGamma(aces(buf[i + 1] * this.exposure));
        data[p + 2] = encodeGamma(aces(buf[i + 2] * this.exposure));
        data[p + 3] = 255;
      }
      this.previewCtx.putImageData(this.previewImage, 0, 0);
    }

    /**
     * Aperçu basse résolution : une passe complète sur une grille 3 fois
     * plus petite, puis agrandissement sur le canvas principal.
     */
    renderPreview() {
      const { previewWidth: w, previewHeight: h, camera, scene, options } = this;
      const buf = this.previewBuffer;

      for (let y = 0; y < h; y++) {
        const v = 1 - ((y + 0.5) / h) * 2;
        for (let x = 0; x < w; x++) {
          const u = ((x + 0.5) / w) * 2 - 1;
          const ray = camera.ray(u, v);
          const color = this.trace(ray, 0, scene, options);
          const i = (y * w + x) * 3;
          buf[i] += color.x;
          buf[i + 1] += color.y;
          buf[i + 2] += color.z;
        }
      }

      const data = this.previewImage.data;
      for (let i = 0, p = 0; i < buf.length; i += 3, p += 4) {
        data[p] = encodeGamma(aces(buf[i] * this.exposure));
        data[p + 1] = encodeGamma(aces(buf[i + 1] * this.exposure));
        data[p + 2] = encodeGamma(aces(buf[i + 2] * this.exposure));
        data[p + 3] = 255;
      }
      this.previewCtx.putImageData(this.previewImage, 0, 0);
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.drawImage(this.previewCanvas, 0, 0, this.width, this.height);
    }

    renderRow(y, jitterSeed) {
      const { width, height, camera, scene, options } = this;
      const buf = this.buffer;
      const rowOffset = y * width * 3;

      for (let x = 0; x < width; x++) {
        // Jitter : décalage pseudo-aléatoire du point d'échantillonnage.
        // C'est ce qui produit l'anti-aliasing par accumulation.
        const jx = RT.hash(jitterSeed + x * 1.618 + y * 7.13) - 0.5;
        const jy = RT.hash(jitterSeed + x * 3.71 + y * 5.37 + 101) - 0.5;

        const u = ((x + 0.5 + jx) / width) * 2 - 1;
        const v = 1 - ((y + 0.5 + jy) / height) * 2;

        const ray = camera.ray(u, v);
        const color = this.trace(ray, 0, scene, options);

        const i = rowOffset + x * 3;
        buf[i] += color.x;
        buf[i + 1] += color.y;
        buf[i + 2] += color.z;
      }
    }

    /** Convertit l'accumulation en pixels affichables (tone mapping + gamma). */
    present() {
      const { width, height, buffer, image } = this;
      if (!image) return;

      // Tant que la première passe complète n'est pas terminée, on garde
      // l'aperçu basse résolution à l'écran : afficher le tampon
      // partiel donnerait un canvas à moitié noir.
      if (this.samples === 0 && this.previewDone) {
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.drawImage(this.previewCanvas, 0, 0, width, height);
        return;
      }

      const n = Math.max(1, this.samples);
      const exposure = this.exposure;
      const data = image.data;
      for (let i = 0, p = 0; i < buffer.length; i += 3, p += 4) {
        data[p] = encodeGamma(aces(buffer[i] * exposure / n));
        data[p + 1] = encodeGamma(aces(buffer[i + 1] * exposure / n));
        data[p + 2] = encodeGamma(aces(buffer[i + 2] * exposure / n));
        data[p + 3] = 255;
      }
      this.ctx.putImageData(image, 0, 0);
    }

    /* ---------------- Intersection & ombrage ---------------- */

    intersectScene(ray, scene, maxDistance) {
      let best = null;
      let bestT = maxDistance !== undefined ? maxDistance : Infinity;
      const objects = scene.objects;
      for (let i = 0; i < objects.length; i++) {
        const hit = objects[i].intersect(ray);
        if (hit && hit.t < bestT) {
          best = hit;
          bestT = hit.t;
        }
      }
      return best;
    }

    /**
     * Facteur d'ombre : fraction d'échantillons de la source non bloqués.
     * Une source de taille finie donne naturally une ombre douce.
     */
    shadowFactor(origin, normal, light, scene) {
      const S = this.options.shadowSamples;
      if (S <= 0) return 1;
      let clear = 0;

      for (let i = 0; i < S; i++) {
        let dir;
        if (light.kind === 'directional') {
          const jitter = Vec3.randomUnit().mul(light.softness);
          dir = light.direction.add(jitter).normalize();
        } else {
          const target = light.position.add(Vec3.randomUnit().mul(light.radius));
          dir = target.sub(origin).normalize();
        }
        const ray = { origin: origin.add(normal.mul(1e-3)), direction: dir };
        const hit = this.intersectScene(ray, scene);
        if (!hit) clear++;
      }
      return clear / S;
    }

    /** Couleur du ciel pour un rayon qui n'a rien touché. */
    skyColor(dir, scene) {
      // t vaut 1 en haut de l'image (le rayon pointe vers le zénith)
      // et 0 vers le nadir : on mélange donc ciel-haut et ciel-bas dans
      // ce sens, sinon le ciel est inversé.
      const t = 0.5 * (dir.y + 1);
      const base = scene.skyBottom.mul(1 - t).add(scene.skyTop.mul(t));
      if (scene.sunIntensity <= 0) return base;
      const d = Math.max(0, dir.dot(scene.sunDirection));
      const glow = Math.pow(d, 220) * 3.2 + Math.pow(d, 12) * 0.28;
      return base.add(scene.sunColor.mul(glow * scene.sunIntensity));
    }

    /** Ombrage d'un point touché. */
    shade(hit, ray, depth, scene) {
      const m = hit.material;
      const p = hit.point;
      const n = hit.normal;
      const view = ray.direction.negate();
      const ndv = Math.max(0, n.dot(view));

      // --- Albédo effectif : texture procédurale (damier) appliquée ici,
      //     avant l'éclairage, pour qu'elle reçoive la lumière normalement. ---
      let albedo = m.albedo;
      if (m.checker && hit.uv) {
        const c = (Math.floor(hit.uv[0] * m.checker) + Math.floor(hit.uv[1] * m.checker)) & 1;
        albedo = c ? albedo : albedo.mul(0.45);
      }

      let base = m.emissive;

      // --- Ambiance (éclairage indirect approché) ---
      base = base.add(albedo.mulVec(scene.ambient));

      // --- Lumières directes ---
      for (let i = 0; i < scene.lights.length; i++) {
        const light = scene.lights[i];
        let L;
        let attenuation = 1;
        if (light.kind === 'directional') {
          L = light.direction;
        } else {
          const d = light.position.sub(p);
          const dist = d.length();
          L = d.div(dist || 1);
          attenuation = 1 / (1 + 0.12 * dist + 0.04 * dist * dist);
        }

        const ndotl = Math.max(0, n.dot(L));
        if (ndotl === 0) continue;

        let visibility = 1;
        if (this.options.shadows) {
          visibility = this.shadowFactor(p, n, light, scene);
          if (visibility === 0) continue;
        }

        const energy = light.color.mul(light.intensity * ndotl * attenuation * visibility);

        // Composante diffuse de Lambert : albédo × couleur de la source × (N·L).
        // On n'utilise JAMAIS le vecteur L lui-même ici : ses composantes
        // peuvent être négatives et le résultat sortirait de [0, 1].
        if (m.metallic < 0.5) {
          base = base.add(albedo.mulVec(energy));
        }

        // Composante spéculaire (Blinn-Phong, brillance déduite de la rugosité)
        if (m.metallic > 0.5 || m.roughness < 0.95) {
          const h = L.add(view);
          if (h.lengthSq() > 1e-12) {
            const nh = Math.max(0, n.dot(h.normalize()));
            const rough = Math.max(0.03, m.roughness);
            const shininess = Math.max(1, 2 / Math.pow(rough, 4) - 2);
            // Le spéculaire d'un diélectrique doit rester discret : on
            // l'atténue en (1 - rugosité)², sinon une surface mate se
            // comporte comme un miroir.
            const amount = m.metallic > 0.5
              ? 1
              : 0.6 * Math.pow(1 - m.roughness, 2);
            const spec = Math.pow(nh, shininess) * amount;
            const specColor = m.metallic > 0.5 ? m.albedo : new Vec3(1, 1, 1);
            base = base.add(specColor.mulVec(light.color).mul(spec * light.intensity * attenuation * visibility));
          }
        }
      }

      // --- Texture procédurale : damier ---
      // (l'albédo effectif a déjà été calculé plus haut et utilisé
      //  dans le calcul de la lumière : rien à corriger ici)

      // --- Réflexion ---
      let reflected = null;
      if (this.options.reflections && depth < this.options.maxDepth) {
        const wantReflection =
          m.metallic > 0.5 || (m.transmission === 0 && m.roughness < 0.55) || m.transmission > 0;
        if (wantReflection) {
          const dir = ray.direction.reflect(n);
          reflected = this.trace(
            { origin: p.add(n.mul(1e-3)), direction: dir },
            depth + 1,
            scene,
            this.options
          );
        }
      }

      // --- Réfraction ---
      if (this.options.refraction && m.transmission > 0 && depth < this.options.maxDepth) {
        const eta = n.dot(ray.direction) < 0 ? m.ior : 1 / m.ior;
        const dir = refract(ray.direction, n, eta);
        if (dir) {
          const transmitted = this.trace(
            { origin: p.sub(n.mul(1e-3)), direction: dir },
            depth + 1,
            scene,
            this.options
          );
          // Verre : on mélange réflexion et transmission selon Fresnel.
          const f0 = Math.pow((1 - m.ior) / (1 + m.ior), 2);
          const fresnel = schlick(ndv, f0);
          const out = (reflected || new Vec3(0, 0, 0)).mul(fresnel).add(transmitted.mul(1 - fresnel));
          return out.add(m.emissive);
        }
        // Réflexion totale : on renvoie le reflet.
        if (reflected) return reflected.add(m.emissive);
      }

      // --- Métal : le reflet teinté par l'albédo domine ---
      if (m.metallic > 0.5) {
        if (reflected) return reflected.mulVec(albedo).add(m.emissive);
        return base.add(m.emissive);
      }

      // --- Diélectrique brillant : Fresnel entre base et reflet ---
      if (reflected) {
        const f = schlick(ndv, m.reflectance) * (1 - m.roughness);
        return base.mul(1 - f).add(reflected.mul(f)).add(m.emissive);
      }

      return base.add(m.emissive);
    }

    /** Lancer de rayon : point d'entrée du shading. */
    trace(ray, depth, scene, options) {
      this.rays++;
      const hit = this.intersectScene(ray, scene);
      if (!hit) return this.skyColor(ray.direction, scene);
      return this.shade(hit, ray, depth, scene);
    }
  }

  RT.Material = Material;
  RT.PointLight = PointLight;
  RT.DirectionalLight = DirectionalLight;
  RT.Scene = Scene;
  RT.Camera = Camera;
  RT.Sphere = Sphere;
  RT.Plane = Plane;
  RT.Box = Box;
  RT.Renderer = Renderer;
  RT.schlick = schlick;
  RT.refract = refract;
})(window);
