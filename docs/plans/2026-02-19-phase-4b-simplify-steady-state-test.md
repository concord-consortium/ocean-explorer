# Phase 4b: Simplify Steady State Test

`steady-state.test.ts` is inefficient and needs to be simplified. Perform the following changes:

- Combine all of the `its` under "Steady-state with pressure gradients". Run to steady state once at the start, then make all of the checks that are currently split between different `its`.

- Remove the "Phase 4 regression: water world unchanged" test.

- Combine "north-south continent converges to steady state" and "land cells remain zero at steady state" so `runToSteadyState` is only called once.
