/* =====================================================================
   Vec3 — algebra vectorielle 3D pour le moteur de rendu.
   ---------------------------------------------------------------------
   Tout est immuable : chaque opération renvoie un nouveau vecteur.
   C'est un peu plus coûteux qu'une mutation, mais ça élimine toute une
   famille de bugs (aliasing accidentel entrehit-point et vecteur normal)
   — un bug très difficile à débusquer dans un raytracer.
   ===================================================================== */
(function (global) {
  'use strict';

  const RT = (global.RT = global.RT || {});

  class Vec3 {
    constructor(x, y, z) {
      this.x = x || 0;
      this.y = y || 0;
      this.z = z || 0;
    }

    static of(x, y, z) {
      return new Vec3(x, y, z);
    }

    clone() {
      return new Vec3(this.x, this.y, this.z);
    }

    add(o) {
      return new Vec3(this.x + o.x, this.y + o.y, this.z + o.z);
    }

    sub(o) {
      return new Vec3(this.x - o.x, this.y - o.y, this.z - o.z);
    }

    mul(s) {
      return new Vec3(this.x * s, this.y * s, this.z * s);
    }

    /**
     * Produit composante par composante (Hadamard) avec un autre vecteur.
     * À ne pas confondre avec mul() : passer un vecteur à mul() donne
     * NaN, car un objet n'est pas un nombre.
     */
    mulVec(o) {
      return new Vec3(this.x * o.x, this.y * o.y, this.z * o.z);
    }

    div(s) {
      return new Vec3(this.x / s, this.y / s, this.z / s);
    }

    /** Produit scalaire. */
    dot(o) {
      return this.x * o.x + this.y * o.y + this.z * o.z;
    }

    /** Produit vectoriel. */
    cross(o) {
      return new Vec3(
        this.y * o.z - this.z * o.y,
        this.z * o.x - this.x * o.z,
        this.x * o.y - this.y * o.x
      );
    }

    lengthSq() {
      return this.x * this.x + this.y * this.y + this.z * this.z;
    }

    length() {
      return Math.sqrt(this.lengthSq());
    }

    normalize() {
      const l = this.length();
      return l > 1e-9 ? this.div(l) : new Vec3(0, 0, 0);
    }

    negate() {
      return new Vec3(-this.x, -this.y, -this.z);
    }

    /** Symétrique par rapport à la normale (pour un reflet). */
    reflect(n) {
      return this.sub(n.mul(2 * this.dot(n)));
    }

    /** Composante par composante. */
    min(o) {
      return new Vec3(Math.min(this.x, o.x), Math.min(this.y, o.y), Math.min(this.z, o.z));
    }

    max(o) {
      return new Vec3(Math.max(this.x, o.x), Math.max(this.y, o.y), Math.max(this.z, o.z));
    }

    static lerp(a, b, t) {
      return new Vec3(
        a.x + (b.x - a.x) * t,
        a.y + (b.y - a.y) * t,
        a.z + (b.z - a.z) * t
      );
    }

    /** Point uniforme dans la sphère unité. */
    static randomUnit() {
      const z = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      return new Vec3(r * Math.cos(a), r * Math.sin(a), z);
    }

    toArray() {
      return [this.x, this.y, this.z];
    }

    toString() {
      return `(${this.x.toFixed(3)}, ${this.y.toFixed(3)}, ${this.z.toFixed(3)})`;
    }
  }

  /** Unité pseudo-aléatoire déterministe (pour le grain de l'anti-aliasing). */
  function hash(n) {
    const s = Math.sin(n) * 43758.5453123;
    return s - Math.floor(s);
  }

  RT.Vec3 = Vec3;
  RT.hash = hash;
})(window);
