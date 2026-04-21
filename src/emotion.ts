/**
 * Lightweight, streaming-friendly emotion detector.
 *
 * Takes the assistant's text (so far) and emits one of a small set of
 * emotions based on keyword cues and punctuation. Deliberately simple —
 * Phase 3D keeps emotion inference on-device and model-free so it stays
 * responsive and works offline. A model-based upgrade is planned for
 * Phase 4 alongside TTS prosody control.
 *
 * The detector is *monotonic within an utterance* in the sense that it
 * returns the strongest emotion seen in the whole input, so a reply that
 * starts neutral and ends with "haha 😂" flips to Happy once the cue
 * arrives.
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
 * Classify a piece of text (partial or complete). Returns `"neutral"`
 * when no cue matches. Case-insensitive. Safe to call on every token
 * during streaming — `O(text.length * cueCount)` and cue count is small.
 */
export function detectEmotion(text: string): Emotion {
  if (!text) return "neutral";
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
