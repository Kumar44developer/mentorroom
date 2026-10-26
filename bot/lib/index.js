import "dotenv/config";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { loadCometChat } from "./lib/browser.js";
import { askMentor, generateRecap, classifyToxicity, llmConfigured } from "./lib/llm.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load bot/.env if present, else fall back to a root .env.
for (const p of [path.join(__dirname, ".env"), path.join(__dirname, "..", ".env")]) {
  if (fs.existsSync(p)) {
    try {
      process.loadEnvFile
        ? process.loadEnvFile(p)
        : (await import("dotenv")).default.config({ path: p });
    } catch {
    }
  }
}


const APP_ID = process.env.COMETCHAT_APP_ID;
const AUTH_KEY = process.env.COMETCHAT_AUTH_KEY;
