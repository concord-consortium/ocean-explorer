import { latLonToPosition, tangentFrame } from "./globe-math";

describe("latLonToPosition", () => {
  it("returns (1, 0, 0) at 0°N 0°E on a unit sphere", () => {
    const [x, y, z] = latLonToPosition(0, 0, 1);
    expect(x).toBeCloseTo(1, 10);
    expect(y).toBeCloseTo(0, 10);
    expect(z).toBeCloseTo(0, 10);
  });

  it("returns (0, 1, 0) at 90°N on a unit sphere", () => {
    const [x, y, z] = latLonToPosition(90, 0, 1);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(1, 10);
    expect(z).toBeCloseTo(0, 10);
  });

  it("returns (0, -1, 0) at 90°S on a unit sphere", () => {
    const [x, y, z] = latLonToPosition(-90, 0, 1);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(-1, 10);
    expect(z).toBeCloseTo(0, 10);
  });
});

describe("tangentFrame", () => {
  it("at equator 0°E: east = (0, 0, -1), north = (0, 1, 0)", () => {
    const { east, north } = tangentFrame(0, 0);
    expect(east[0]).toBeCloseTo(0, 10);
    expect(east[1]).toBeCloseTo(0, 10);
    expect(east[2]).toBeCloseTo(-1, 10);
    expect(north[0]).toBeCloseTo(0, 10);
    expect(north[1]).toBeCloseTo(1, 10);
    expect(north[2]).toBeCloseTo(0, 10);
  });

  it("at north pole: does not produce NaN", () => {
    const { east, north } = tangentFrame(90, 0);
    expect(Number.isNaN(east[0])).toBe(false);
    expect(Number.isNaN(east[1])).toBe(false);
    expect(Number.isNaN(east[2])).toBe(false);
    expect(Number.isNaN(north[0])).toBe(false);
    expect(Number.isNaN(north[1])).toBe(false);
    expect(Number.isNaN(north[2])).toBe(false);
  });

  it("east and north are orthogonal", () => {
    const { east, north } = tangentFrame(45, 90);
    const dot = east[0] * north[0] + east[1] * north[1] + east[2] * north[2];
    expect(dot).toBeCloseTo(0, 10);
  });

  it("east and north are unit vectors", () => {
    const { east, north } = tangentFrame(30, -60);
    const eMag = Math.sqrt(east[0] ** 2 + east[1] ** 2 + east[2] ** 2);
    const nMag = Math.sqrt(north[0] ** 2 + north[1] ** 2 + north[2] ** 2);
    expect(eMag).toBeCloseTo(1, 10);
    expect(nMag).toBeCloseTo(1, 10);
  });
});
