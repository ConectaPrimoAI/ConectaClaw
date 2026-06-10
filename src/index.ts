#!/usr/bin/env node
import process from "node:process";
import "./joelbot-agent.js";

process.on("uncaughtException", (error) => {
  console.error("[JoelBot Core Exception]:", error);
});
