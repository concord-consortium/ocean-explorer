import React from "react";
import { render, screen } from "@testing-library/react";
import { App } from "./app";

// Mock the SimulationCanvas since PixiJS requires a real canvas context
jest.mock("./simulation-canvas", () => ({
  SimulationCanvas: () => <div data-testid="simulation-canvas" />,
}));

describe("App component", () => {
  it("renders controls and canvas", () => {
    render(<App />);
    expect(screen.getByText(/Rotation rate/)).toBeDefined();
    expect(screen.getByText(/Temp gradient/)).toBeDefined();
    expect(screen.getByText(/Speed:/)).toBeDefined();
    expect(screen.getByText(/Show wind/)).toBeDefined();
    expect(screen.getByText(/Show water/)).toBeDefined();
    expect(screen.getByTestId("simulation-canvas")).toBeDefined();
  });
});
