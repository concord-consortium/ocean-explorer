/**
 * Read-only interface for the simulation grid data arrays.
 * Used by rendering and utility code that reads grid state without modifying it.
 */
export interface IGrid {
  readonly waterU: Float64Array;
  readonly waterV: Float64Array;
  readonly eta: Float64Array;
  readonly landMask: Uint8Array;
  readonly temperatureField: Float64Array;
}
