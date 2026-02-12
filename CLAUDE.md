# Ocean Explorer — Claude Code Instructions

## Implementation workflow

When asked to implement a design document (from `doc/`), follow this two-step process:

1. **Create an implementation plan** — Use the `superpowers:writing-plans` skill to produce a
   step-by-step plan saved to `docs/plans/`. The plan breaks the design into discrete tasks
   with test-first steps, exact file paths, and commit points.

2. **Execute the plan** — Use the `superpowers:executing-plans` skill to implement the plan
   task-by-task with review checkpoints.

The design doc in `doc/` is the source of truth for *what* to build. The plan in `docs/plans/`
is a disposable implementation guide for *how* to build it — it can be regenerated from the
design doc if needed.

## Code style

- **Objects with behavior should be classes.** When functions take an object as their first
  argument and operate on its internal state, that object should be a class with those
  functions as methods — unless there's a measured performance reason not to.

## Rendering

### Optimization principle

Don't optimize rendering in ways that prevent future complexity. If a visualization element
(e.g., temperature background, wind arrows) will become per-cell variable in later phases,
keep redrawing it every frame rather than caching or skipping it based on change detection.
The rendering loop code should change as little as possible over time — only the model
computations get more complex.

### PixiJS shared GraphicsContext pattern

For repeated shapes (background cells, arrows), use a shared `GraphicsContext` rather than
rebuilding geometry every frame:

1. **Define the shape once** — Create a `GraphicsContext` with a reference shape drawn in
   white (e.g., a 1×1 rect for cells, a fixed-length arrow for vectors).
2. **Share it across instances** — Pass the context to each `new Graphics(context)`.
3. **Vary per instance via transforms** — Each frame, set `.position`, `.rotation`, `.scale`,
   `.tint`, and `.visible` on each Graphics instance. Never call `.clear()` or redraw geometry.

This eliminates per-frame geometry rebuilds while still allowing every instance to differ in
position, size, orientation, and color each frame. An FPS counter (`app.ticker.FPS`) is
displayed in the legend overlay to monitor performance.

## Design doc revision workflow

When visual verification or testing reveals issues:

1. Record revisions in the design doc's "Revision log" section at the bottom, noting what
   changed and why.
2. Integrate each revision into the main body of the design doc so it reads as the current
   specification (not a patch on top of an older version).
3. Implement the code changes.
4. Commit with a message referencing the revision number (e.g., "revision 2").
