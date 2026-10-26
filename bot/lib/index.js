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
const BOT_UID = process.env.COMETCHAT_BOT_UID || "mentor_bot";
const PORT = Number(process.env.BOT_PORT || 8787);

if (!APP_ID || !AUTH_KEY) {
  console.error(
    "\n[MentorRoom bot] Missing COMETCHAT_APP_ID / COMETCHAT_AUTH_KEY.\n" +
      "Copy .env.example to bot/.env (or root .env) and fill in your credentials.\n"
  );
  process.exit(1);
}


const processed = new Set(); // dedupe by message id
const contextCache = new Map();

process.on("uncaughtException", (e) =>
  console.warn("[mentor] uncaught exception (kept alive):", e?.message || e)
);
process.on("unhandledRejection", (e) =>
  console.warn("[mentor] unhandled rejection:", e?.message || e)
);

function pick(obj, getter, key) {
  if (!obj) return undefined;
