#!/usr/bin/env node
import process from "node:process";
import { startJoelBotGateway } from "./joelbot-agent.js";

async function runGateway() {
  process.on("uncaughtException", (error) => {
    console.error("[JoelBot Core Exception]:", error);
  });
  try {
    startJoelBotGateway();
  } catch (err: any) {
    console.error("❌ Falha crítica ao subir o barramento JoelBot:", err);
    process.exit(1);
  }
}

void runGateway();
