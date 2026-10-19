import { JSDOM } from "jsdom";
import WebSocket from "ws";

class RobustWebSocket extends WebSocket {
  constructor(...args) {
