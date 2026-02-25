import { AppElements } from "../support/elements/app-elements";

const app = new AppElements();

context("Ocean Explorer", () => {
  it("renders the simulation controls and canvas", () => {
    app.visit();
    cy.contains("Rotation rate").should("be.visible");
    cy.contains("Temp gradient").should("be.visible");
    cy.get("canvas").should("exist");
  });
});
