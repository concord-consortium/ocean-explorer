#!/usr/bin/env node
/* eslint-env node */

import { Bonjour } from "bonjour-service";

const bonjour = new Bonjour();

console.log("Discovering Bonjour/Zeroconf HTTP services on the local network...");
console.log("Press Ctrl+C to exit.\n");

const browser = bonjour.find({type: "http"});

browser.on("up", service => {
  console.log("Service found:");
  console.log(`  Name: ${service.name}`);
  console.log(`  Host: ${service.host}`);
  console.log(`  Port: ${service.port}`);
  console.log(`  IP Address: ${service.addresses ? service.addresses.join(", ") : "Unknown"}`);
  console.log("-----------------------------------");
});

browser.on("down", service => {
  console.log(`Service down: ${service.name} (${service.type})`);
});

process.on("SIGINT", () => {
  console.log("\nStopping service discovery...");
  bonjour.destroy();
  process.exit();
});
