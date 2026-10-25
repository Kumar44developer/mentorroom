import "dotenv/config";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { loadCometChat } from "./lib/browser.js";
import { askMentor, generateRecap, classifyToxicity, llmConfigured } from "./lib/llm.js";
