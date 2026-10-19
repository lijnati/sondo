/*!
 * pixel-scene.js : procedural 16-bit nature scenes for the Pixel Meadow UI style.
 * Zero dependencies, ~10 KB. Draws at low resolution and upscales with
 * `image-rendering: pixelated`, so every scene is crisp pixel art at any size.
 *
 *   PixelScene.mount(el, { preset: "meadow" | "bloom" | "dusk", seed: 7, pixel: 4 })
 *   PixelScene.sprite(el, "bee" | "butterfly" | "bird", { scale: 4 })
 *   PixelScene.pollen(canvasEl, { max: 70 })      // drifting light motes overlay
 *   PixelScene.parallax(rootEl)                    // mouse parallax for [data-depth]
 *
 * `el` should be positioned (relative/absolute). mount() appends an absolutely
 * positioned canvas that covers it and re-renders on resize.
 * mount().destroy() and pollen() release observers and animation frames.
 */
(function (global) {
  "use strict";

  /* ---------- utilities ---------- */
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hex = (h) => {
    h = h.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695040)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function sampleStops(stops, t) {
    t = clamp(t, 0, 1) * (stops.length - 1);
    const i = Math.min(Math.floor(t), stops.length - 2);
    return mix(stops[i], stops[i + 1], t - i);
  }

  /* ---------- low-res pixel buffer ---------- */
  function Buf(w, h) {
    this.w = w; this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
  }
  Buf.prototype.set = function (x, y, c) {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4, d = this.d;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  };
  Buf.prototype.get = function (x, y) {
    x = clamp(x | 0, 0, this.w - 1); y = clamp(y | 0, 0, this.h - 1);
    const i = (y * this.w + x) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2]];
  };

  /* ---------- painters ---------- */
  // Banded, ordered-dithered vertical gradient: the classic 16-bit sky.
  function sky(b, stops, bands) {
    const L = bands || 14;
    for (let y = 0; y < b.h; y++) {
      const v = (y / (b.h - 1)) * (L - 1);
      const base = Math.floor(v), frac = v - base;
      for (let x = 0; x < b.w; x++) {
        const lvl = base + (frac > bayer(x, y) ? 1 : 0);
        b.set(x, y, sampleStops(stops, lvl / (L - 1)));
      }
    }
  }

  function sun(b, cx, cy, r, core, halo) {
    const R = r * 4.2;
    for (let y = Math.floor(cy - R); y <= cy + R; y++) {
      for (let x = Math.floor(cx - R); x <= cx + R; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r) { b.set(x, y, d > r - 1.2 ? mix(core, halo, 0.35) : core); continue; }
        if (d > R) continue;
        const a = Math.pow(1 - (d - r) / (R - r), 1.8) * 0.75;
        const q = Math.floor(a * 4 + bayer(x, y)) / 4; // 4 dithered halo steps
        if (q > 0) b.set(x, y, mix(b.get(x, y), halo, q));
      }
    }
  }

  // Puffy cumulus built from overlapping circles with a flat base and crunchy edges.
  function cloud(b, cx, cy, w, h, pal, R, seed) {
    const n = 3 + Math.floor(w / (h * 0.9));
    const puffs = [];
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const pr = h * (0.42 + 0.58 * Math.sin(Math.PI * u)) * (0.78 + R() * 0.4);
      puffs.push({ x: cx - w / 2 + u * w + (R() - 0.5) * w * 0.08, y: cy - pr * 0.25 + (R() - 0.5) * h * 0.2, r: pr });
    }
    const base = cy + h * 0.32;
    const top = cy - h * 1.3, left = cx - w / 2 - h, right = cx + w / 2 + h;
    for (let y = Math.floor(top); y <= base; y++) {
      for (let x = Math.floor(left); x <= right; x++) {
        let best = -1, bp = null;
        for (const p of puffs) {
          const depth = p.r - Math.hypot(x - p.x, y - p.y) + (hash(x, y, seed) - 0.5) * 1.6;
          if (depth > best) { best = depth; bp = p; }
        }
        if (best < 0) continue;
        const vt = (y - top) / (base - top);
        const lit = ((y - bp.y) / bp.r) * 0.55 + ((x - bp.x) / bp.r) * -0.15;
        let s = 0.5 * vt + 0.5 * (lit * 0.5 + 0.5) + (bayer(x, y) - 0.5) * 0.14;
        if (best < 1.2) s += 0.12; // darker rim on the shadow side gives the pixel outline feel
        b.set(x, y, s < 0.48 ? pal[0] : s < 0.7 ? pal[1] : pal[2]);
      }
    }
  }

  // Diagonal streaky "wisp" clouds (bloom preset).
  function wisp(b, x0, y0, len, dir, pal, R) {
    let x = x0, y = y0;
    for (let i = 0; i < len; i++) {
      const run = Math.max(2, Math.round((1 - i / len) * 10 * (0.5 + R())));
      for (let k = 0; k < run; k++) {
        b.set(x + k * dir, y, pal[0]);
        if (R() > 0.5) b.set(x + k * dir, y + 1, pal[1]);
      }
      x += dir * Math.round(2 + R() * 3);
      y += R() > 0.45 ? 1 : 0;
      if (R() > 0.85) i += 2;
    }
  }

  function ridgeFn(layer) {
    return (x) => {
      let y = layer.base;
      for (const [amp, freq, ph] of layer.waves) y += amp * Math.sin(x * freq + ph);
      if (layer.mesa) { // flat-topped table mountains (ambas / buttes)
        const [hgt, freq, ph] = layer.mesa;
        y -= hgt * clamp((Math.sin(x * freq + ph) + Math.sin(x * freq * 2.3 + ph * 1.7) * 0.35 + 0.1) * 2.6, 0, 1);
      }
      return Math.round(y);
    };
  }

  // Rolling hill layer with rim light, slope shading and grass speckle.
  function hill(b, layer, seed) {
    const ridge = ridgeFn(layer);
    const [rim, light, body, dark] = layer.colors;
    for (let x = 0; x < b.w; x++) {
      const ry = Math.round(ridge(x));
      const slope = ridge(x + 2) - ridge(x - 2);
      for (let y = Math.max(0, ry); y < b.h; y++) {
        const depth = y - ry;
        if (depth < (layer.rim || 2)) { b.set(x, y, rim); continue; }
        const dn = depth / Math.max(8, b.h - ry);
        let v = 0.32 + slope * (layer.slopeK || 0.18) + dn * 0.55 + (hash(x, y >> 1, seed) - 0.5) * 0.28;
        v += (bayer(x, y) - 0.5) * 0.18;
        let c = v < 0.38 ? light : v < 0.7 ? body : dark;
        const h = hash(x, y, seed + 9);
        if (h > 0.975) c = light; else if (h < 0.02) c = dark;
        b.set(x, y, c);
      }
    }
    if (layer.trees) {
      const R = rng(seed + 3);
      for (let x = 0; x < b.w; x++) {
        if (R() > layer.trees) continue;
        const ry = ridge(x), th = 2 + Math.floor(R() * 4), tw = 1 + Math.floor(R() * 2);
        for (let yy = 0; yy < th; yy++) for (let xx = -tw; xx <= tw; xx++)
          if (Math.abs(xx) <= tw - (yy === th - 1 ? 1 : 0)) b.set(x + xx, ry - yy, layer.treeColor || dark);
      }
    }
    return ridge;
  }

  function dot(b, x, y, c) { b.set(x, y, c); }

  // Flat-crowned acacia: thin forked trunk + wide layered umbrella canopy.
  function acacia(b, x, y, s, P, R) {
    const th = Math.round(s * 1.05), cw = s * 1.5, ch = Math.max(2, s * 0.34);
    const top = y - th;
    // clumps of foliage: overlapping flat ellipses make an organic umbrella crown
    const n = s > 10 ? 5 : 3, clumps = [];
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : i / (n - 1) - 0.5;
      clumps.push({ x: x + u * cw * 1.1 + (R() - 0.5) * s * 0.2, y: top - ch * 0.4 + Math.abs(u) * ch * 0.5 + (R() - 0.5) * ch * 0.4, rx: cw * (0.32 + R() * 0.12), ry: ch * (0.55 + R() * 0.2) });
    }
    // trunk + branches up to each clump
    for (let k = 0; k < th * 0.55; k++) { b.set(x, y - k, P.trunk); if (s > 7) b.set(x + 1, y - k, P.trunkDark); }
    const fork = y - th * 0.55;
    for (const c of clumps) {
      const steps = Math.ceil(Math.hypot(c.x - x, c.y - fork));
      for (let t = 0; t <= steps; t++) b.set(x + (c.x - x) * t / steps, fork + (c.y - fork) * t / steps, P.trunk);
    }
    for (const c of clumps) {
      for (let yy = Math.floor(c.y - c.ry); yy <= c.y + c.ry; yy++) for (let xx = Math.floor(c.x - c.rx); xx <= c.x + c.rx; xx++) {
        const d = ((xx - c.x) / c.rx) ** 2 + ((yy - c.y) / c.ry) ** 2 + (hash(xx, yy, 21) - 0.5) * 0.35;
        if (d > 1) continue;
        const v = (yy - (c.y - c.ry)) / (2 * c.ry) + (hash(xx, yy, 4) - 0.5) * 0.3;
        b.set(xx, yy, v < 0.3 ? P.leafLight : v < 0.75 ? P.leaf : P.leafDark);
      }
    }
  }

  // Round hut with a conical thatched roof (tukul).
  function hut(b, x, y, s, P) {
    const w = Math.max(4, Math.round(s)), wh = Math.max(3, Math.round(s * 0.55)), rh = Math.max(3, Math.round(s * 0.75));
    for (let yy = 0; yy < wh; yy++) for (let xx = -w / 2; xx <= w / 2; xx++) b.set(x + xx, y - yy, xx > w * 0.15 ? P.wallDark : P.wall);
    for (let yy = 0; yy < Math.max(2, wh * 0.7); yy++) b.set(x - 1, y - yy, P.door), b.set(x, y - yy, P.door);
    for (let yy = 0; yy < rh; yy++) {
      const half = (w / 2 + 1.5) * (1 - yy / rh);
      for (let xx = -half; xx <= half; xx++) b.set(x + xx, y - wh - yy, (yy % 2 === 0 && xx > 0) || xx > half * 0.4 ? P.roofDark : P.roof);
    }
    b.set(x, y - wh - rh, P.roofDark);
  }

  function fireflies(b, n, yMin, R, c) {
    for (let i = 0; i < n; i++) {
      const x = R() * b.w, y = yMin + R() * (b.h - yMin);
      b.set(x, y, c); if (R() > 0.6) { b.set(x + 1, y, mix(c, b.get(x + 2, y), 0.5)); }
    }
  }
  // Small meadow flowers. Size grows toward the viewer (perspective).
  function meadowFlowers(b, ridge, density, horizon, pal, R, opts) {
    const area = b.w * (b.h - horizon);
    const count = Math.round(area * density);
    for (let i = 0; i < count; i++) {
      const x = Math.floor(R() * b.w);
      const ry = ridge(x) + 2;
      const y = Math.floor(ry + Math.pow(R(), 0.7) * (b.h - ry));
      if (y >= b.h) continue;
      if (opts && opts.avoid && opts.avoid(x, y)) continue;
      const s = (y - horizon) / (b.h - horizon);
      const petal = R() < (pal.yellowChance || 0.12) ? pal.yellow : pal.white;
      if (s < 0.3) { dot(b, x, y, petal); continue; }
      if (s < 0.62) {
        dot(b, x, y, pal.center); dot(b, x - 1, y, petal); dot(b, x + 1, y, petal); dot(b, x, y - 1, petal); dot(b, x, y + 1, pal.shade);
        continue;
      }
      // 5x5 daisy
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const m = Math.abs(dx) + Math.abs(dy);
        if (m === 0 || (m === 1 && (dx === 1 || dy === 1))) b.set(x + dx, y + dy, m === 0 ? pal.center : pal.centerDark || pal.center);
        else if (m <= 2 && !(Math.abs(dx) === 2 && Math.abs(dy) === 2)) b.set(x + dx, y + dy, dy > 0 ? pal.shade : petal);
      }
      b.set(x, y + 3, pal.stem);
    }
  }

  function grassTufts(b, ridge, count, pal, R) {
    for (let i = 0; i < count; i++) {
      const x = Math.floor(R() * b.w);
      const ry = ridge(x);
      const y = Math.floor(ry + 3 + R() * (b.h - ry));
      const hgt = 2 + Math.floor(R() * 3);
      const c = R() > 0.5 ? pal[0] : pal[1];
      for (let k = 0; k < hgt; k++) b.set(x + (k === hgt - 1 && R() > 0.5 ? 1 : 0), y - k, c);
    }
  }

  // Big radial flower (sunflower / daisy) with two petal rings, seeded center and stem.
  function bigFlower(b, cx, cy, r, P, R, o) {
    o = o || {};
    const n = o.petals || Math.round(11 + r * 0.12);
    const tilt = o.tilt || 0.86;
    const rot = R() * Math.PI;
    // stem + leaves first so the head overlaps
    if (o.stem !== false) {
      const sw = Math.max(2, Math.round(r * 0.13));
      const lean = (R() - 0.5) * r * 0.6;
      for (let y = Math.round(cy); y < b.h; y++) {
        const t = (y - cy) / Math.max(1, b.h - cy);
        const sx = Math.round(cx + lean * t * t);
        for (let k = 0; k < sw; k++) b.set(sx + k - (sw >> 1), y, k >= sw - 1 ? P.stemDark : P.stem);
        if (y === Math.round(cy + r * 1.5) || y === Math.round(cy + r * 2.6)) {
          const dir = y === Math.round(cy + r * 1.5) ? 1 : -1;
          leaf(b, sx, y, r * 0.75, dir, P);
        }
      }
    }
    const R0 = r * (o.coreRatio || 0.4);
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        const dx = x - cx, dy = (y - cy) / tilt;
        const d = Math.hypot(dx, dy);
        if (d > r + 1) continue;
        const th = Math.atan2(dy, dx) + rot;
        const sharp = o.sharp || 0.55;
        const front = r * (0.5 + 0.5 * Math.pow(Math.abs(Math.cos((n * th) / 2)), sharp));
        const back = r * 1.04 * (0.5 + 0.5 * Math.pow(Math.abs(Math.cos((n * (th + Math.PI / n)) / 2)), sharp));
        if (d <= R0) {
          // seeded center: dark ring, checker seeds, top-left highlight
          const rr = d / R0;
          let c = rr > 0.82 ? P.coreDark : (((x + y) & 1) === 0 && hash(x, y, 5) > 0.35) ? P.coreDark : P.core;
          if (dx < -R0 * 0.2 && dy < -R0 * 0.2 && rr > 0.35 && rr < 0.75 && hash(x, y, 8) > 0.5) c = P.coreLight;
          b.set(x, y, c);
        } else if (d <= front) {
          const t = (d - R0) / (front - R0);
          const crease = Math.abs(Math.cos((n * th) / 2)) < 0.18 && t < 0.85;
          let c = crease ? P.petalShade : t > 0.62 ? P.petalLight : P.petal;
          if (dy > r * 0.35 && t < 0.5) c = P.petalShade;
          if (d > front - 1) c = P.petalShade; // outline
          b.set(x, y, c);
        } else if (d <= back) {
          b.set(x, y, d > back - 1 ? P.backEdge || P.petalShade : P.petalBack);
        }
      }
    }
  }

  function leaf(b, x0, y0, len, dir, P) {
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const w = Math.sin(Math.PI * t) * len * 0.28;
      const yy = y0 - i * 0.45;
      for (let k = -w; k <= w; k++) b.set(x0 + dir * i, yy + k, k > w * 0.3 ? P.stemDark : k < -w * 0.5 ? P.leafLight || P.stem : P.stem);
    }
  }

  /* ---------- presets ---------- */
  const PRESETS = {
    // Rolling green hills, warm sun, pastel clouds, daisies. Calm, cinematic.
    meadow(b, R, seed, o) {
      const W = b.w, H = b.h;
      sky(b, (o.sky || ["#3f7fc7", "#5f99d6", "#8fb6e2", "#d9c3c2", "#f2d2a8"]).map(hex), 16);
      sun(b, W * (o.sunX ?? 0.87), H * (o.sunY ?? 0.13), Math.max(4, W * 0.032), hex("#fff3d6"), hex("#ffd98c"));
      const cpal = (o.clouds || ["#fbf3ea", "#ecc8bf", "#b8a6c9"]).map(hex);
      const tall = H > W * 0.9;
      const nc = tall ? 4 : Math.round(W / 34);
      for (let i = 0; i < nc; i++) {
        const cw = W * (tall ? 0.35 + R() * 0.3 : 0.08 + R() * 0.16), ch = cw * (0.2 + R() * 0.12);
        let cx = R() * W * 1.1 - W * 0.05, cy = H * (0.04 + Math.pow(R(), 1.4) * 0.36);
        // Keep the headline zone clear: push clouds out of the central band unless clearCenter:false.
        if (o.clearCenter !== false && !tall && cy > H * 0.12 && Math.abs(cx - W / 2) < W * 0.3 + cw / 2) cx = cx < W / 2 ? W * (0.02 + R() * 0.14) - cw * 0.2 : W * (0.98 - R() * 0.14) + cw * 0.2;
        cloud(b, cx, cy, cw, ch, cpal, R, seed + i);
      }
      const L = [
        { base: H * 0.5, waves: [[H * 0.03, 0.021, R() * 6], [H * 0.015, 0.06, R() * 6]], colors: ["#9cc28a", "#88b07a", "#77a06e", "#6a9466"].map(hex), trees: 0.08, treeColor: hex("#4c7a4a") },
        { base: H * 0.58, waves: [[H * 0.06, 0.012, R() * 6], [H * 0.02, 0.04, R() * 6]], colors: ["#c9e06a", "#9cc94a", "#79ad35", "#5f962b"].map(hex) },
        { base: H * 0.68, waves: [[H * 0.07, 0.009, R() * 6], [H * 0.02, 0.031, R() * 6]], colors: ["#d7ea78", "#a6d24c", "#7cb534", "#5a9426"].map(hex) },
        { base: H * 0.8, waves: [[H * 0.06, 0.011, R() * 6], [H * 0.015, 0.05, R() * 6]], colors: ["#bfe063", "#8cc23f", "#5f9a2a", "#3f7a1f"].map(hex) },
      ];
      const fpal = { white: hex("#fbfbf2"), yellow: hex("#ffe36a"), center: hex("#f2c230"), centerDark: hex("#d79a1e"), shade: hex("#d9dccb"), stem: hex("#3c7420"), yellowChance: 0.08 };
      L.forEach((layer, i) => {
        const ridge = hill(b, layer, seed + i * 17);
        if (i >= 1) grassTufts(b, ridge, Math.round(W * (i * 0.6)), [hex("#4f8a26"), hex("#c6e36d")], R);
        if (i >= 2) meadowFlowers(b, ridge, 0.004 + i * 0.005, H * 0.6, fpal, R);
      });
    },

    // Bright saturated sky, huge pixel clouds, giant sunflowers framing a clear center.
    bloom(b, R, seed, o) {
      const W = b.w, H = b.h, M = Math.min(W, H * 1.6);
      sky(b, (o.sky || ["#0567aa", "#0b7cc0", "#2a97d6", "#5db6e6", "#a3d6f2"]).map(hex), 14);
      const cpal = (o.clouds || ["#ffffff", "#d6ecfa", "#8ec4ea"]).map(hex);
      // Portrait (phones): push everything into the lower part so the stacked copy stays readable.
      const portrait = H > W * 0.9;
      const Y = (y) => (portrait ? 0.56 + (y - 0.45) * 0.8 : y);
      const big = [[0.02, 0.26, 0.3], [0.98, 0.35, 0.28], [0.1, 0.72, 0.34], [0.9, 0.78, 0.34], [0.5, 0.98, 0.5]];
      big.forEach(([x, y, w], i) => { if (portrait && i < 2) return; cloud(b, W * x, H * Y(y), W * w, W * w * 0.3, cpal, R, seed + i * 11); });
      // wisps stay in the outer thirds so they never strike through centered headline copy
      for (let i = 0; i < (portrait ? 0 : 4); i++) { const right = i > 1; wisp(b, right ? W * (0.9 - R() * 0.06) : W * (0.1 + R() * 0.06), H * (portrait ? 0.03 + R() * 0.05 : 0.06 + R() * 0.16), (8 + R() * 6) * Math.min(1, W / 320), right ? -1 : 1, cpal, R); }
      const P = {
        petal: hex("#f6b81c"), petalLight: hex("#ffd64a"), petalShade: hex("#d9871a"), petalBack: hex("#e99a1c"), backEdge: hex("#b86a12"),
        core: hex("#9a5418"), coreDark: hex("#5e300c"), coreLight: hex("#d08a2c"), stem: hex("#4f9a2c"), stemDark: hex("#2f6e1c"), leafLight: hex("#7cc43e"),
      };
      const D = { ...P, petal: hex("#ffffff"), petalLight: hex("#ffffff"), petalShade: hex("#cfe0ea"), petalBack: hex("#e8f1f6"), backEdge: hex("#b8ccd8"), core: hex("#f6c21c"), coreDark: hex("#d4931a"), coreLight: hex("#ffe27a") };
      // bottom foliage band
      const ground = { base: H * 0.93, waves: [[H * 0.02, 0.05, R() * 6], [H * 0.01, 0.19, R() * 6]], colors: ["#8fd24a", "#6fb83a", "#4f9a2c", "#2f6e1c"].map(hex), rim: 1 };
      const g = hill(b, ground, seed + 99);
      const flowers = [
        [0.12, 0.5, 0.105, P], [0.035, 0.76, 0.065, P], [0.27, 0.86, 0.05, P], [0.2, 0.7, 0.035, D], [0.07, 0.95, 0.045, D],
        [0.88, 0.58, 0.1, P], [0.975, 0.45, 0.05, P], [0.76, 0.9, 0.05, P], [0.8, 0.72, 0.032, D], [0.95, 0.9, 0.05, D],
        [0.4, 0.97, 0.03, D], [0.6, 0.98, 0.028, P], [0.5, 1.0, 0.025, D],
      ];
      flowers.sort((a, c) => c[2] - a[2] || a[1] - c[1]);
      // draw small/background first, big last
      flowers.slice().reverse().forEach(([x, y, r, pal]) => bigFlower(b, W * x, H * Y(y), M * r, pal, R, pal === D ? { petals: 16, sharp: 0.9, coreRatio: 0.32 } : {}));
      meadowFlowers(b, g, 0.03, H * 0.9, { white: hex("#ffffff"), yellow: hex("#ffd23a"), center: hex("#f6b81c"), centerDark: hex("#d9871a"), shade: hex("#cfe0ea"), stem: hex("#2f6e1c"), yellowChance: 0.35 }, R);
    },

    // Twilight: low setting sun, layered silhouetted hills with golden rim light, trees, stars, fireflies.
    // For long-read / letter / about pages. Pass sky:[...] for other hours (e.g. purple-to-amber).
    dusk(b, R, seed, o) {
      const W = b.w, H = b.h;
      sky(b, (o.sky || ["#1b2740", "#2f3f66", "#6c6f8a", "#c99a7c", "#f2c993"]).map(hex), 18);
      for (let i = 0; i < W * H * 0.0012; i++) { const x = R() * W, y = R() * H * 0.4; b.set(x, y, R() > 0.85 ? hex("#fff6dc") : hex("#c9cfe0")); }
      if (o.sun !== false) sun(b, W * (o.sunX ?? 0.68), H * (o.sunY ?? 0.6), Math.max(4, W * 0.035), hex("#ffe2a8"), hex("#f5b878"));
      const L = [
        { base: H * 0.6, waves: [[H * 0.04, 0.013, R() * 6], [H * 0.015, 0.05, R() * 6]], colors: ["#e3b385", "#7d7690", "#6e6884", "#625d79"].map(hex), rim: 1, trees: 0.05, treeColor: hex("#545070") },
        { base: H * 0.7, waves: [[H * 0.05, 0.01, R() * 6], [H * 0.015, 0.04, R() * 6]], colors: ["#d9a86e", "#4f5a33", "#45502c", "#3a4526"].map(hex), rim: 1, trees: 0.04, treeColor: hex("#2c3618") },
        { base: H * 0.82, waves: [[H * 0.05, 0.008, R() * 6], [H * 0.01, 0.05, R() * 6]], colors: ["#b99a5c", "#3b4625", "#323c1f", "#27301a"].map(hex), rim: 1 },
      ];
      L.forEach((layer, i) => {
        const ridge = hill(b, layer, seed + i * 7);
        if (i > 0) meadowFlowers(b, ridge, 0.002 + i * 0.001, H * 0.7, { white: hex("#d8d6c4"), yellow: hex("#e8cf8a"), center: hex("#c9a95a"), shade: hex("#7c7a62"), stem: hex("#27301a") }, R);
      });
      fireflies(b, Math.round(W * 0.12), H * 0.68, R, hex("#ffe9a3"));
    },

    // Golden-hour highlands: flat-topped table mountains, warm grass, acacias, round huts, yellow daisies.
    // Good for African / East-African products, travel, agriculture, community. huts:false to omit huts.
    highland(b, R, seed, o) {
      const W = b.w, H = b.h, tall = H > W * 0.9;
      sky(b, (o.sky || ["#3d86c6", "#6aa7d6", "#a9c9de", "#f1d3a1", "#f7b77a"]).map(hex), 16);
      sun(b, W * (o.sunX ?? 0.2), H * (o.sunY ?? 0.3), Math.max(4, W * 0.03), hex("#fff4d6"), hex("#ffd38a"));
      const cpal = (o.clouds || ["#fff6ea", "#f2cfb0", "#c7a6b4"]).map(hex);
      for (let i = 0; i < (tall ? 3 : 6); i++) {
        const cw = W * (tall ? 0.4 : 0.1 + R() * 0.12);
        let cx = R() * W, cy = H * (0.05 + R() * 0.2);
        if (!tall && cy > H * 0.13 && Math.abs(cx - W / 2) < W * 0.3) cx = cx < W / 2 ? W * 0.12 * R() : W * (1 - 0.12 * R());
        cloud(b, cx, cy, cw, cw * 0.18, cpal, R, seed + i * 5);
      }
      const L = [
        { base: H * 0.58, waves: [[H * 0.008, 0.06, R() * 6]], mesa: [H * 0.085, 0.016, R() * 6], colors: ["#c9b3c4", "#9c93b4", "#928aab", "#8981a2"].map(hex), rim: 1, slopeK: 0.05 },
        { base: H * 0.63, waves: [[H * 0.025, 0.018, R() * 6], [H * 0.01, 0.06, R() * 6]], colors: ["#c8c98a", "#94a36a", "#8a9a62", "#7f915b"].map(hex), rim: 1, trees: 0.03, treeColor: hex("#5f7348") },
        { base: H * 0.67, waves: [[H * 0.035, 0.012, R() * 6], [H * 0.012, 0.05, R() * 6]], colors: ["#f0d27a", "#d2b85a", "#b9a748", "#9c9a44"].map(hex) },
        { base: H * 0.76, waves: [[H * 0.05, 0.01, R() * 6], [H * 0.012, 0.045, R() * 6]], colors: ["#d9d47a", "#9fb24a", "#7e9a35", "#5f7f27"].map(hex) },
      ];
      const tree = { trunk: hex("#4a3426"), trunkDark: hex("#33241a"), leaf: hex("#5e7a2e"), leafLight: hex("#86a043"), leafDark: hex("#3f5a22") };
      const hutP = { wall: hex("#c49a6c"), wallDark: hex("#a27b52"), door: hex("#4a3426"), roof: hex("#d9b56a"), roofDark: hex("#a9853f") };
      const fpal = { white: hex("#fff3c4"), yellow: hex("#ffd23a"), center: hex("#e59a1c"), centerDark: hex("#b8730f"), shade: hex("#d7b44a"), stem: hex("#4f6b22"), yellowChance: 0.85 };
      L.forEach((layer, i) => {
        const ridge = hill(b, layer, seed + i * 13);
        if (i === 2) {
          for (let k = 0; k < (tall ? 2 : 4); k++) { const x = W * (k % 2 ? 0.62 + R() * 0.3 : 0.06 + R() * 0.28); acacia(b, x, ridge(x | 0) + 2, Math.max(5, W * 0.03), tree, R); }
          if (o.huts !== false) { const hx = W * (0.74 + R() * 0.12); hut(b, hx, ridge(hx | 0) + 3, Math.max(5, W * 0.016), hutP); hut(b, hx + W * 0.03, ridge((hx + W * 0.03) | 0) + 3, Math.max(4, W * 0.012), hutP); }
        }
        if (i === 3) {
          grassTufts(b, ridge, Math.round(W * 1.2), [hex("#5f7f27"), hex("#e3d77a")], R);
          const x = W * (tall ? 0.85 : 0.07 + R() * 0.05); acacia(b, x, ridge(x | 0) + 4, Math.max(9, W * 0.07), tree, R);
          meadowFlowers(b, ridge, 0.012, H * 0.66, fpal, R);
        }
      });
    },
  };

  /* ---------- public API ---------- */
  function render(canvas, opts) {
    const o = opts || {};
    const cw = canvas.clientWidth || canvas.parentElement.clientWidth || 1200;
    const ch = canvas.clientHeight || canvas.parentElement.clientHeight || 700;
    const px = o.pixel || clamp(Math.round(cw / 340), 3, 6);
    const w = Math.max(40, Math.ceil(cw / px)), h = Math.max(30, Math.ceil(ch / px));
    canvas.width = w; canvas.height = h;
    const b = new Buf(w, h);
    const seed = o.seed == null ? 7 : o.seed;
    (PRESETS[o.preset] || PRESETS.meadow)(b, rng(seed), seed, o);
    canvas.getContext("2d").putImageData(new ImageData(b.d, w, h), 0, 0);
  }

  function mount(el, opts) {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", imageRendering: "pixelated", display: "block" });
    el.appendChild(canvas);
    let last = [0, 0], t, ro;
    const go = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (Math.abs(w - last[0]) < 24 && Math.abs(h - last[1]) < 24) return;
      last = [w, h]; render(canvas, opts);
    };
    go();
    if ("ResizeObserver" in global) {
      ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(go, 120); });
      ro.observe(el);
    }
    return {
      canvas,
      rerender: () => { last = [0, 0]; go(); },
      destroy: () => { clearTimeout(t); if (ro) ro.disconnect(); if (canvas.parentNode) canvas.remove(); },
    };
  }

  const SPRITES = {
    bee: {
      pal: { k: "#2a2018", y: "#f6c21c", o: "#e0951a", w: "#f2f9ff", b: "#9cc6e8", e: "#ffffff" },
      rows: [
        "....bb.bb....",
        "...bwwbwwb...",
        "...bwwbwwb...",
        "....bbkbb....",
        "..kkkkkkkkk..",
        ".kyykyykyyek.",
        "kyyykyykyykkk",
        "kooykooykyok.",
        ".koykooykok..",
        "..kkkkkkkk...",
      ],
    },
    butterfly: {
      pal: { k: "#1b2a55", b: "#3d7fe0", l: "#7fb6ff", w: "#e6f2ff" },
      rows: [
        ".kk.......kk.",
        "kbbk.....kbbk",
        "kblbk.k.kblbk",
        "kbwbbkkkbbwbk",
        "kbbbbkkkbbbbk",
        ".kbbbbkbbbbk.",
        "..kkbbkbbkk..",
        ".kblbkkkblbk.",
        "kbwbbk.kbbwbk",
        "kbbbk...kbbbk",
        ".kkk.....kkk.",
      ],
    },
    bird: {
      pal: { k: "#2b3440" },
      rows: ["k.....k", ".k...k.", "..k.k..", "...k..."],
    },
  };

  function sprite(el, name, opts) {
    const s = SPRITES[name]; if (!s) return null;
    const scale = (opts && opts.scale) || 4;
    const c = document.createElement("canvas");
    const w = s.rows[0].length, h = s.rows.length;
    c.width = w; c.height = h;
    Object.assign(c.style, { width: w * scale + "px", height: h * scale + "px", imageRendering: "pixelated", display: "block" });
    const ctx = c.getContext("2d");
    s.rows.forEach((row, y) => [...row].forEach((ch, x) => { if (s.pal[ch]) { ctx.fillStyle = s.pal[ch]; ctx.fillRect(x, y, 1, 1); } }));
    el.appendChild(c);
    return c;
  }

  // Warm drifting light motes (canvas overlay). Respects reduced motion.
  function pollen(canvas, opts) {
    const reduce = global.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = canvas.getContext("2d");
    if (!ctx) return () => {};
    const max = (opts && opts.max) || 70, color = (opts && opts.color) || "255,246,220";
    let motes = [], w = 0, h = 0, frame = 0, stopped = false;
    const resize = () => {
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(max, (w * h) / 22000));
      motes = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.8 + 0.4, vx: (Math.random() - 0.3) * 0.18, vy: -(Math.random() * 0.22 + 0.04), ph: Math.random() * 6.28, a: Math.random() * 0.5 + 0.25 }));
    };
    const draw = (t) => {
      if (stopped) return;
      ctx.clearRect(0, 0, w, h);
      for (const m of motes) {
        m.x += m.vx + Math.sin(t / 2400 + m.ph) * 0.12; m.y += m.vy;
        if (m.y < -10) { m.y = h + 10; m.x = Math.random() * w; }
        if (m.x > w + 10) m.x = -10; if (m.x < -10) m.x = w + 10;
        const tw = 0.6 + 0.4 * Math.sin(t / 900 + m.ph);
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 4);
        g.addColorStop(0, `rgba(${color},${m.a * tw})`); g.addColorStop(1, `rgba(${color},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(m.x, m.y, m.r * 4, 0, 6.2832); ctx.fill();
      }
      if (!reduce) frame = requestAnimationFrame(draw);
    };
    resize();
    const onResize = () => resize();
    addEventListener("resize", onResize);
    frame = requestAnimationFrame(draw);
    return () => { stopped = true; cancelAnimationFrame(frame); removeEventListener("resize", onResize); };
  }

  // Eased mouse parallax for children with data-depth="0.2..1".
  function parallax(root) {
    if (global.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const layers = [...(root || document).querySelectorAll("[data-depth]")];
    if (!layers.length) return;
    let mx = 0, my = 0, cx = 0, cy = 0;
    addEventListener("pointermove", (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });
    const tick = () => {
      cx += (mx - cx) * 0.05; cy += (my - cy) * 0.05;
      for (const l of layers) { const d = parseFloat(l.dataset.depth); l.style.transform = `translate3d(${-cx * 40 * d}px, ${-cy * 24 * d}px, 0)`; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  const api = { mount, render, sprite, pollen, parallax, presets: Object.keys(PRESETS) };
  global.PixelScene = api;
})(typeof globalThis !== "undefined" ? globalThis : {});

export const PixelScene = globalThis.PixelScene;
