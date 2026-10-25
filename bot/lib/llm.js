
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
  return fallbackAnswer(question);
}

async function callOpenAI(userPrompt) {
  const base = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.LLM_MODEL || "gpt-4o-mini";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.LLM_API_KEY}`,
    },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      model,
      max_tokens: 300,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || fallbackAnswer(userPrompt);
}

async function callGroq(userPrompt) {
  const base = process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1";
  const model = process.env.LLM_MODEL || "openai/gpt-oss-20b";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.LLM_API_KEY}`,
    },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      model,
      max_tokens: 300,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  const data = await res.json();
  if (data?.error) throw new Error(data.error.message || "groq error");
  return data?.choices?.[0]?.message?.content || fallbackAnswer(userPrompt);
}


async function callAnthropic(userPrompt) {
  const model = process.env.LLM_MODEL || "claude-3-5-haiku-latest";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.LLM_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      model,
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  const data = await res.json();
  return data?.content?.[0]?.text || fallbackAnswer(userPrompt);
}


async function callGemini(userPrompt) {
  const model = process.env.LLM_MODEL || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.LLM_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: 300 },
    }),
  });
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || fallbackAnswer(userPrompt);
}

async function callOllama(userPrompt) {
  const base = process.env.LLM_BASE_URL || "http://localhost:11434";
  const model = process.env.LLM_MODEL || "llama3.2";
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  const data = await res.json();
  return data?.message?.content || fallbackAnswer(userPrompt);
}

function fallbackAnswer(question) {
  const q = (question || "").trim();
  const topic = q.replace(/^@mentor\s*/i, "").replace(/\s*\?+\s*$/, "").trim();
  return (
    `Great question about “${topic || "this topic"}”. Here's the quick version:\n` +
    `• Break it into the core idea, then a tiny example.\n` +
    `• Try it yourself first, then compare with the docs.\n` +
    `(Tip for the demo: set LLM_PROVIDER + LLM_API_KEY in bot/.env to get real AI answers.)`
  );
}

export async function generateRecap(context) {
  const transcript = context.map((m) => `${m.name}: ${m.text}`).join("\n").slice(-6000);
  const prompt = `Summarize this study-room session as JSON with keys: summary (1-2 sentences), topics (array of short strings), openQuestions (array of strings). Conversation:\n${transcript}`;
  const provider = (process.env.LLM_PROVIDER || "none").toLowerCase();
  if (provider !== "none") {
