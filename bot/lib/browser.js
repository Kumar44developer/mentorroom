import { JSDOM } from "jsdom";
import WebSocket from "ws";

class RobustWebSocket extends WebSocket {
  constructor(...args) {
    super(...args);
    if (process.env.MR_DEBUG) console.log("[ws] connect:", String(args[0]).slice(0, 90));
    this.on("open", () => {
      if (process.env.MR_DEBUG) console.log("[ws] OPEN:", String(args[0]).slice(0, 90));
    });
    this.on("message", (data) => {
      if (process.env.MR_DEBUG) console.log("[ws] FRAME:", String(data).slice(0, 140));
    });
    this.on("close", (code, reason) => {
      if (process.env.MR_DEBUG) console.log("[ws] CLOSE:", String(args[0]).slice(0, 90), "code=", code, String(reason || "").slice(0, 80));
    });
    this.setMaxListeners(0); // silence MaxListenersExceededWarning on shared socket
    this.on("error", (err) => {
      console.warn("[ws] transport error (bot stays alive):", err?.message || err);
    });
  }
}

const REGION = process.env.COMETCHAT_REGION || "us";
function fixRegion(url) {
  try {
    const u = new URL(url);
    const m = u.hostname.match(/^(.*?\.(?:api|apiclient)-)[a-z0-9]+(\.cometchat\.io)$/);
    if (m) {
      const before = u.hostname;
      u.hostname = `${m[1]}${REGION}${m[2]}`;
      if (process.env.MR_DEBUG) console.log("[fixRegion]", before, "->", u.hostname);
      return u.toString();
    }
  } catch {
    /* not a URL */
  }
  return url;
}

class FetchXHR {
  constructor() {
    this.readyState = 0;
    this.status = 0;
    this.responseText = "";
