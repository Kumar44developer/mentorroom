
const SYSTEM_PROMPT = `You are "Mentor AI", a friendly, precise study-group mentor inside a CometChat topic room.
Rules:


export function llmConfigured() {
  const p = (process.env.LLM_PROVIDER || "none").toLowerCase();
  if (p === "none") return false;
  if (p === "ollama") return true;
  return Boolean(process.env.LLM_API_KEY);
}

export async function classifyToxicity(text) {
