
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

        max_tokens: 512,
        messages: [
          {
            role: "system",
            content:
              "You are a content moderator for a student study chat. Classify the user message for insults, harassment, hate or self-harm directed at people. Respond in exactly this format on line one: VERDICT: SAFE or VERDICT: UNSAFE. Optionally add line two: REASON: <one or two words>.",
          },
          { role: "user", content: text },
        ],
      }),
    });
    const data = await res.json();
    if (data?.error) return { verdict: "unclear" };
    const content = (data?.choices?.[0]?.message?.content || "").toUpperCase();
    if (/VERDICT:\s*UNSAFE|\bUNSAFE\b/.test(content)) {
      const m = content.match(/REASON:\s*([^\n]+)/);
      const reason = m ? m[1].trim().toLowerCase().replace(/_/g, " ") : "hostile content";
      return { verdict: "unsafe", reason: `Flagged by AI moderator (${reason})` };
    }
    if (/VERDICT:\s*SAFE|\bSAFE\b/.test(content)) return { verdict: "safe" };
    return { verdict: "unclear" }; // empty/truncated -> caller retries
  } catch {
    return { verdict: "unclear" };
  }
}


export async function askMentor(context, question) {
  const provider = (process.env.LLM_PROVIDER || "none").toLowerCase();
  const transcript = context
    .map((m) => `${m.name}: ${m.text}`)
    .join("\n")
    .slice(-4000);

  const userPrompt = `Recent room conversation:\n${transcript || "(no prior messages)"}\n\nNew question to answer:\n${question}`;


  try {
    if (provider === "openai") return await callOpenAI(userPrompt);
    if (provider === "groq") return await callGroq(userPrompt);
    if (provider === "anthropic") return await callAnthropic(userPrompt);
    if (provider === "gemini") return await callGemini(userPrompt);
    if (provider === "ollama") return await callOllama(userPrompt);
  } catch (e) {
    console.error("[llm] provider error, using fallback:", e.message);
  }
