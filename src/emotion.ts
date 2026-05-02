/**
 * Streaming emotion detector with a hybrid strategy:
 *
 *  1. **Inline LLM tags** — if the model emits `<mood:happy>` style
 *     markers (we ask it to in the system prompt), we honor them as
 *     ground truth. This is the v1.1+ protocol.
 *  2. **Keyword/emoji heuristic** — fallback for models that ignore the
 *     instruction or for older replies. Works offline, no model call.
 *
 * `stripMoodTags(text)` removes the LLM markers from text before display
 * so the user never sees `<mood:happy>` in the chat bubble.
 */

export type Emotion =
  | "neutral"
  | "happy"
  | "sad"
  | "angry"
  | "surprised"
  | "thinking";

interface Rule {
  emotion: Emotion;
  // Lowercase substrings or emoji; any match contributes `weight`.
  cues: readonly string[];
  weight: number;
}

const RULES: readonly Rule[] = [
  {
    emotion: "happy",
    weight: 2,
    cues: [
      "😊", "😁", "😄", "😆", "🙂", "😂", "🤣", "❤", "💕", "✨", "🎉",
      "haha", "lol", "yay", "great!", "awesome", "love it",
      "ура", "здорово", "классно", "супер", "люблю", "рада", "рад",
    ],
  },
  {
    emotion: "sad",
    weight: 2,
    cues: [
      "😢", "😭", "😞", "😔", "💔",
      "sorry", "unfortunately", "sadly", "i'm afraid",
      "жаль", "грустно", "печально", "к сожалению",
    ],
  },
  {
    emotion: "angry",
    weight: 2,
    cues: [
      "😠", "😡", "🤬",
      "error", "failed", "can't", "cannot", "won't work", "not allowed",
      "ошибка", "не могу", "нельзя", "не получилось",
    ],
  },
  {
    emotion: "surprised",
    weight: 1,
    cues: [
      "😮", "😲", "😯", "wow", "whoa", "!",
      "ого", "ничего себе", "вот это",
    ],
  },
  {
    emotion: "thinking",
    weight: 1,
    cues: [
      "🤔", "hmm", "let me think", "let's see", "consider",
      "хм", "дайте подумать", "давайте посмотрим",
    ],
  },
];

/**
 * Matches `<mood:NAME>` markers (case-insensitive). The model is
 * instructed to emit at most one per reply, but we tolerate any.
 */
const MOOD_TAG = /<mood:(neutral|happy|sad|angry|surprised|thinking)>/gi;

/**
 * Strip mood tags from a text fragment so they don't appear in chat or
 * get pronounced by TTS. Use on every token chunk.
 */
export function stripMoodTags(text: string): string {
  return text
    .replace(MOOD_TAG, "")
    // Tool-call protocol markers: backend leaks <tool_call>{...}</tool_call>
    // and <tool_status>NAME</tool_status> into the visible token stream
    // because we don't pre-process the SSE feed. Strip them client-side.
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
    .replace(/<tool_status>[\s\S]*?<\/tool_status>/gi, "");
}

/**
 * Extract the last mood tag in a text fragment, if any. Returns
 * `undefined` when no tag is present.
 */
export function extractMoodTag(text: string): Emotion | undefined {
  const matches = [...text.matchAll(MOOD_TAG)];
  if (matches.length === 0) return undefined;
  const last = matches[matches.length - 1][1].toLowerCase() as Emotion;
  return last;
}

/**
 * Classify a piece of text (partial or complete). Returns `"neutral"`
 * when no cue matches. Case-insensitive. Safe to call on every token
 * during streaming — `O(text.length * cueCount)` and cue count is small.
 *
 * If the text contains a `<mood:X>` tag, that tag wins (ground truth
 * from the LLM). Otherwise falls back to the keyword/emoji heuristic.
 */
export function detectEmotion(text: string): Emotion {
  if (!text) return "neutral";
  const tagged = extractMoodTag(text);
  if (tagged) return tagged;
  const lower = text.toLowerCase();
  const scores: Record<Emotion, number> = {
    neutral: 0,
    happy: 0,
    sad: 0,
    angry: 0,
    surprised: 0,
    thinking: 0,
  };
  for (const rule of RULES) {
    for (const cue of rule.cues) {
      if (lower.includes(cue)) {
        scores[rule.emotion] += rule.weight;
      }
    }
  }
  // Dampen "surprised" when stronger emotions are present — a happy
  // exclamation like "wow, awesome!" should read as happy, not surprised.
  if (scores.happy > 0 && scores.surprised > 0) {
    scores.surprised = Math.max(0, scores.surprised - 1);
  }
  let best: Emotion = "neutral";
  let bestScore = 0;
  for (const [emotion, score] of Object.entries(scores) as [Emotion, number][]) {
    if (score > bestScore) {
      best = emotion;
      bestScore = score;
    }
  }
  return best;
}
