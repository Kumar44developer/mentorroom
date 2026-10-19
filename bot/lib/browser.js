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
