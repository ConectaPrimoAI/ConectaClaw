#!/usr/bin/env node
import process from "node:process";
import "./conectaclaw-agent.js";

process.on("uncaughtException", (error) => {
  console.error("[Conecta Claw🦞 Core Exception]: An unexpected error occurred.");
});
