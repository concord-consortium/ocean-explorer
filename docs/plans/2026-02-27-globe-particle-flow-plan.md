# Globe Particle Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add particle flow visualization to the globe renderer, matching the flat map's fade-trail style.

**Architecture:** A new `GlobeParticleLayer` class draws particles onto an offscreen canvas in equirectangular UV space, uploads it as a `THREE.CanvasTexture`, and displays it on a second sphere slightly above the background sphere with additive blending. The existing `ParticleSystem` is reused unchanged.

**Tech Stack:** Three.js (overlay sphere + texture), Canvas 2D (fade trails), TypeScript

**Design doc:** `docs/plans/2026-02-27-globe-particle-flow-design.md`

---

### Task 1: Create GlobeParticleLayer class

**Files:**
- Create: `src/rendering/globe-particle-layer.ts`

**Step 1: Create the GlobeParticleLayer class**

```typescript
import * as THREE from "three";
import { ROWS, COLS, GLOBE_WIDTH_SEGMENTS, GLOBE_HEIGHT_SEGMENTS } from "../constants";
import type { ParticleSystem } from "../simulation/particle-system";

/** Alpha value for the per-frame fade rect. Lower = longer trails. */
const FADE_ALPHA = 0.04;

/** CSS color for particle dots. */
const PARTICLE_COLOR = "rgba(200, 230, 255, 0.9)";

/** Size of each particle dot in texture pixels. */
const PARTICLE_SIZE = 1;

/**
 * Pixel threshold below which channels are zeroed. With FADE_ALPHA = 0.04
 * the multiplicative fade gets stuck at dim values due to 8-bit rounding.
 */
const FADE_THRESHOLD = 13;

/** Radius of the overlay sphere — above background (1.0), below arrows (1.005). */
const OVERLAY_RADIUS = 1.002;

export class GlobeParticleLayer {
  readonly mesh: THREE.Mesh;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private material: THREE.MeshBasicMaterial;
  private geometry: THREE.SphereGeometry;
  private scaleX: number;
  private scaleY: number;

  constructor(width = COLS, height = ROWS) {
    this.scaleX = width / COLS;
    this.scaleY = height / ROWS;

    // Offscreen canvas for fade-trail rendering
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D context for globe particle canvas");
    this.ctx = ctx;

    // Initialize to opaque black
    this.ctx.fillStyle = "rgb(0, 0, 0)";
    this.ctx.fillRect(0, 0, width, height);

    // Three.js texture from offscreen canvas
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;

    // Transparent material with additive blending
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    // Sphere geometry matching the background sphere's segment counts
    this.geometry = new THREE.SphereGeometry(
      OVERLAY_RADIUS,
      GLOBE_WIDTH_SEGMENTS,
      GLOBE_HEIGHT_SEGMENTS,
    );

    this.mesh = new THREE.Mesh(this.geometry, this.material);
  }

  update(particles: ParticleSystem): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Fade previous frame toward black
    ctx.fillStyle = `rgba(0, 0, 0, ${FADE_ALPHA})`;
    ctx.fillRect(0, 0, w, h);

    // Draw each particle in equirectangular UV space
    ctx.fillStyle = PARTICLE_COLOR;
    for (let i = 0; i < particles.count; i++) {
      const x = particles.x[i];
      const y = particles.y[i];
      // Flip y: grid row 0 = south pole = texture bottom
      const texX = x * this.scaleX;
      const texY = (ROWS - 1 - y) * this.scaleY;
      ctx.fillRect(texX, texY, PARTICLE_SIZE, PARTICLE_SIZE);
    }

    // Zero out dim ghost pixels from 8-bit rounding
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < FADE_THRESHOLD) data[i] = 0;
      if (data[i + 1] < FADE_THRESHOLD) data[i + 1] = 0;
      if (data[i + 2] < FADE_THRESHOLD) data[i + 2] = 0;
    }
    ctx.putImageData(imageData, 0, 0);

    this.texture.needsUpdate = true;
  }

  destroy(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
```

**Step 2: Run lint to verify**

Run: `npm run lint:build`
Expected: PASS (no errors or warnings in new file)

**Step 3: Commit**

```bash
git add src/rendering/globe-particle-layer.ts
git commit -m "Add GlobeParticleLayer class for globe particle rendering"
```

---

### Task 2: Integrate GlobeParticleLayer into globe-renderer.ts

**Files:**
- Modify: `src/rendering/globe-renderer.ts`

**Step 1: Add imports**

At the top of `globe-renderer.ts`, after the existing imports (line 13), add:

```typescript
import { ParticleSystem } from "../simulation/particle-system";
import { GlobeParticleLayer } from "./globe-particle-layer";
```

**Step 2: Add lazy particle state**

Inside `createGlobeRenderer()`, after the EMA timing variables (after line 93), add:

```typescript
// Lazy particle flow state
let particleSystem: ParticleSystem | null = null;
let particleLayer: GlobeParticleLayer | null = null;
```

**Step 3: Add particle update logic in the update function**

Inside the `update()` function, after `waterMesh.instanceMatrix.needsUpdate = true;` (after line 192) and before `controls.update();` (line 195), add:

```typescript
// Particle flow visualization
if (opts.waterViz === "particles") {
  if (!particleSystem || !particleLayer) {
    particleSystem = new ParticleSystem(grid);
    particleLayer = new GlobeParticleLayer();
    scene.add(particleLayer.mesh);
  }
  if (opts.stepsThisFrame > 0) {
    particleSystem.update(grid, opts.stepsThisFrame);
    particleLayer.update(particleSystem);
  }
  particleLayer.mesh.visible = true;
} else if (particleLayer) {
  particleLayer.mesh.visible = false;
}
```

**Step 4: Add cleanup in destroy()**

In the `destroy()` function, before `webglRenderer.dispose();` (line 246), add:

```typescript
if (particleLayer) {
  scene.remove(particleLayer.mesh);
  particleLayer.destroy();
}
```

**Step 5: Run lint and tests**

Run: `npm run lint:build`
Expected: PASS

Run: `gtimeout --signal=KILL 30 npx jest --no-watchman --forceExit --testPathIgnorePatterns='/steady-state/' --testPathIgnorePatterns='/playwright/' 2>&1`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/rendering/globe-renderer.ts
git commit -m "Integrate particle flow into globe renderer"
```

---

### Task 3: Visual verification and tuning

**Files:**
- Possibly modify: `src/rendering/globe-particle-layer.ts` (tuning constants)

**Step 1: Run the app and verify visually**

Run: `npm start`

Verify:
1. Switch to globe view
2. Select "particles" water visualization
3. Confirm particles appear as flowing trails on the globe surface
4. Confirm trails fade correctly (not permanent, not too fast)
5. Confirm particles wrap around the globe zonally (east-west)
6. Confirm particles don't appear on land cells
7. Confirm switching back to "arrows" hides the particle layer
8. Confirm switching to flat map still works with particles
9. Confirm pausing freezes the particle trails on the globe

**Step 2: Tune if needed**

If trails look too dim or too bright, adjust `PARTICLE_COLOR` alpha or `FADE_ALPHA`.
If the texture looks too blocky, increase the canvas resolution (constructor params).

**Step 3: Run full verification**

Run: `npm run lint:build`
Run: `gtimeout --signal=KILL 30 npx jest --no-watchman --forceExit --testPathIgnorePatterns='/steady-state/' --testPathIgnorePatterns='/playwright/' 2>&1`
Run: `npm run test:playwright`
Expected: All pass

**Step 4: Commit any tuning changes**

```bash
git add -A
git commit -m "Tune globe particle flow constants"
```
