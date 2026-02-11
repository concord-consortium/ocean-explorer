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

## Design doc revision workflow

When visual verification or testing reveals issues:

1. Record revisions in the design doc's "Revision log" section at the bottom, noting what
   changed and why.
2. Integrate each revision into the main body of the design doc so it reads as the current
   specification (not a patch on top of an older version).
3. Implement the code changes.
4. Commit with a message referencing the revision number (e.g., "revision 2").
