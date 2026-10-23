
const SYSTEM_PROMPT = `You are "Mentor AI", a friendly, precise study-group mentor inside a CometChat topic room.
Rules:


export function llmConfigured() {
  const p = (process.env.LLM_PROVIDER || "none").toLowerCase();
  if (p === "none") return false;
  if (p === "ollama") return true;
  return Boolean(process.env.LLM_API_KEY);
}

export async function classifyToxicity(text) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await classifyToxicityOnce(text);
    if (out.verdict !== "unclear") return { flagged: out.verdict === "unsafe", reason: out.reason, score: out.verdict === "unsafe" ? 1 : 0 };
  }
  return { flagged: false }; // still unclear after retry -> fail open
}

async function classifyToxicityOnce(text) {
  const provider = (process.env.LLM_PROVIDER || "none").toLowerCase();
  if (!["groq", "openai"].includes(provider) || !process.env.LLM_API_KEY) {
    return { verdict: "unclear" };
  }
  const base =
    process.env.LLM_BASE_URL ||
    (provider === "groq" ? "https://api.groq.com/openai/v1" : "https://api.openai.com/v1");
  const model =
    process.env.LLM_TOXICITY_MODEL ||
    (provider === "groq" ? "openai/gpt-oss-safeguard-20b" : "omni-moderation-latest");
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.LLM_API_KEY}`,
      },
      signal: AbortSignal.timeout(4000),
      body: JSON.stringify({
        model,
        temperature: 0,
