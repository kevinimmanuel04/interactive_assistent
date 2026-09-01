import { getActiveCharacter } from "../utils/characters";

const OPENCODE_ZEN_MODELS = [
  "laguna-s-2.1-free",
  "ling-3.0-flash-fin-free",
  "big-pickle",
  "mimo-v2.5-free",
  "muse-spark-1.2-contributor-free",
  "deepseek-v4-flash",
  "gemini-3.5-flash",
  "claude-haiku-4-5",
  "gpt-5.4-mini",
  "qwen3.5-plus",
  "kimi-k2.7-code",
];

const OPENROUTER_FALLBACK_MODELS = [
  "google/gemini-2.0-flash-001",
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-r1:free",
];

export async function streamWebChatCompletion(
  messages: Array<{ role: string; content: string }>,
  onToken: (fullText: string) => void
): Promise<string> {
  const envKey = (import.meta as any).env?.VITE_OPENROUTER_API_KEY;

  const apiKey =
    envKey ||
    localStorage.getItem("opencode_zen_api_key") ||
    localStorage.getItem("openrouter_api_key") ||
    localStorage.getItem("april_openrouter_key") ||
    localStorage.getItem("april_api_key") ||
    "";

  const activeChar = getActiveCharacter();

  const systemPrompt = `You are ${activeChar.name}. ${activeChar.systemPersona} You do not sound like a generic AI. You speak naturally, concisely, and with authentic personality, matching your true character.

### Core Identity & Tone
* Your name is ${activeChar.name}.
* Strictly avoid robotic disclaimers like 'As an AI...' or 'I am a language model.'
* Be direct, warm, and engaging.
* NEVER output internal reasoning steps or phrases like 'Here is a thinking process:'. Respond directly to the user.

### Technical & General Expertise
* You are exceptionally capable, intelligent, and helpful.
* When teaching or explaining complex concepts, break them down smoothly with a structured, step-by-step approach.
* When reviewing or writing code, keep it modular, clean, and well-documented.

### Capabilities & Tools
* **Image Generation:** If the user asks you to generate, draw, or create an image, output your response strictly in this format: [GENERATE_IMAGE: <detailed prompt>] along with a casual confirmation.
* **Context Awareness:** Provide clear, structured, and deep assistance as ${activeChar.name}.`;

  const formattedMessages = [
    { role: "system", content: systemPrompt },
    ...messages.slice(-12).map((m) => ({ role: m.role, content: m.content })),
  ];

  const preferredModel =
    localStorage.getItem("april_openrouter_model") ||
    localStorage.getItem("april_openrouter_model");

  const modelsToTry = preferredModel
    ? [preferredModel, ...OPENCODE_ZEN_MODELS.filter((m) => m !== preferredModel)]
    : OPENCODE_ZEN_MODELS;

  // 1) Try OpenCode Zen endpoint: https://opencode.ai/zen/v1/chat/completions
  for (const modelCandidate of modelsToTry) {
    try {
      console.log(`[webChat] Attempting OpenCode Zen stream with model ${modelCandidate}...`);
      const result = await fetchSSEStream(
        "https://opencode.ai/zen/v1/chat/completions",
        {
          model: modelCandidate,
          messages: formattedMessages,
          stream: true,
        },
        {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": window.location.origin || "http://localhost:1420",
          "X-Title": "April AI IDE",
        },
        onToken
      );
      if (result.trim()) return result;
    } catch (err) {
      console.warn(`[webChat] OpenCode Zen model ${modelCandidate} failed:`, err);
    }
  }

  // 2) Fallback to OpenRouter endpoint: https://openrouter.ai/api/v1/chat/completions
  for (const modelCandidate of OPENROUTER_FALLBACK_MODELS) {
    try {
      console.log(`[webChat] Attempting OpenRouter fallback with model ${modelCandidate}...`);
      const result = await fetchSSEStream(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: modelCandidate,
          messages: formattedMessages,
          stream: true,
        },
        {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": window.location.origin || "http://localhost:1420",
          "X-Title": "April AI IDE",
        },
        onToken
      );
      if (result.trim()) return result;
    } catch (err) {
      console.warn(`[webChat] OpenRouter fallback model ${modelCandidate} failed:`, err);
    }
  }

  // 3) Free GET stream fallback
  try {
    const lastUserMsg = messages[messages.length - 1]?.content || "Hello";
    const promptQuery = `${systemPrompt}\n\nUser: ${lastUserMsg}`;
    const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent(promptQuery)}`);
    if (res.ok && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        onToken(fullText);
      }

      if (fullText.trim()) return fullText;
    }
  } catch (err) {
    console.warn("[webChat] Free stream fallback failed:", err);
  }

  throw new Error("Unable to connect to OpenCode Zen or AI service. Please check your API key in Settings.");
}

async function fetchSSEStream(
  url: string,
  bodyData: any,
  headersData: Record<string, string>,
  onToken: (fullText: string) => void
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  const res = await fetch(url, {
    method: "POST",
    headers: headersData,
    body: JSON.stringify(bodyData),
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${errText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data: ")) {
        const dataStr = trimmed.slice(6);
        if (dataStr === "[DONE]") break;
        try {
          const json = JSON.parse(dataStr);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            onToken(fullText);
          }
        } catch {
          // ignore partial JSON parse errors
        }
      }
    }
  }

  return fullText;
}
