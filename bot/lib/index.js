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
  if (typeof obj[getter] === "function") return obj[getter]();
  return obj[key];
}

function remember(ctx) {
  const { guid, uid, name, text } = ctx;
  const arr = contextCache.get(guid) || [];
  arr.push({ uid, name, text });
  if (arr.length > 25) arr.shift();
  contextCache.set(guid, arr);
}


function getContext(guid) {
  return contextCache.get(guid) || [];
}


function shouldAnswer(text) {
  const t = (text || "").trim();
  if (!t) return false;
  if (t.toLowerCase().startsWith("/")) return false; // commands handled separately
  // The mentor replies to every human message — questions, greetings,
  // statements — so nobody is ever left waiting for an answer.
  return true;
}


async function main() {
  const CometChat = await loadCometChat();
  console.log("[mentor] booting browser-shimmed CometChat SDK…");


  await CometChat.init(APP_ID);
  const user = await CometChat.login(BOT_UID, AUTH_KEY);
  console.log(`[mentor] logged in as ${user.getUid?.() || BOT_UID} — presence is now ONLINE.`);
  console.log(`[mentor] LLM: ${llmConfigured() ? "configured (" + process.env.LLM_PROVIDER + ")" : "fallback mode (no key)"}`);


  CometChat.addMessageListener(
    "mentorroom_bot",
    new CometChat.MessageListener({
      onTextMessageReceived: (message) => handleText(CometChat, message).catch((e) =>
        console.error("[mentor] text handler error:", e.message || e)
      ),
      onCustomMessageReceived: (message) => handleCustom(CometChat, message).catch((e) =>
        console.error("[mentor] custom handler error:", e.message || e)
      ),
    })
  );

  console.log("[mentor] listening. The mentor replies to every message in the room.");
  // Safety net: since the 2026-10-05 platform deploy, WebSocket push does not
  // deliver group messages to non-browser (Node/jsdom) sessions, while REST
  // reads still work. Poll each room for anything the socket missed; the
  // shared `processed` id-set keeps the two paths from ever double-answering.
  startPoller(CometChat);
  startHttpServer(CometChat);
}

async function handleText(CometChat, message) {
  const id =
    pick(message, "getMessageId", "messageId") || pick(message, "getId", "id");
  if (id && processed.has(id)) return;
  if (id) {
    processed.add(id);
    if (processed.size > 1000) processed.delete(processed.values().next().value); // keep bounded
  }
  const sender = pick(message, "getSender", "sender");
  const senderUid = pick(sender, "getUid", "uid");
  if (senderUid === BOT_UID) return; // never answer itself
  const receiverType = pick(message, "getReceiverType", "receiverType");
  if (receiverType !== CometChat.RECEIVER_TYPE.GROUP && receiverType !== "group") return;
  const receiver = pick(message, "getReceiver", "receiver");
  const guid = typeof receiver === "string" ? receiver : pick(receiver, "getGuid", "guid");
  const text = pick(message, "getText", "text") || "";

  const name = pick(sender, "getName", "name") || senderUid || "someone";
  remember({ guid, uid: senderUid, name, text });


  if (text.trim().toLowerCase() === "/recap") {
    await postRecap(CometChat, guid);
    return;
  }
  if (shouldAnswer(text)) {
    await answer(CometChat, guid, text);
  }
}
