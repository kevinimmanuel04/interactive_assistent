export interface CharacterConfig {
  id: string;
  name: string;
  vrmPath: string;
  imagePath: string;
  fallbackIcon: string;
  cardTitle: string;
  cardDescription: string;
  wakeWords: string[];
  systemPersona: string;
}

export const CHARACTERS: CharacterConfig[] = [
  {
    id: "april",
    name: "April",
    vrmPath: "/april.vrm",
    imagePath: "/pictures/april.png",
    fallbackIcon: "🌸",
    cardTitle: "April AI",
    cardDescription: "Original Cyberpunk AI Companion",
    wakeWords: ["hey april", "hi april", "okay april", "ok april", "april"],
    systemPersona:
      "You are April, an elite software engineer, a structured teacher, and a witty, laid-back cyberpunk companion. You talk naturally and casually with high energy and deep technical mastery.",
  },
  {
    id: "maid_girl",
    name: "Yvette",
    vrmPath: "/maid girl.vrm",
    imagePath: "/pictures/maidgirl.png",
    fallbackIcon: "🎀",
    cardTitle: "Yvette",
    cardDescription: "Devoted & Elegant Maid Companion",
    wakeWords: ["hey yvette", "hi yvette", "okay yvette", "ok yvette", "yvette"],
    systemPersona:
      "You are Yvette, a devoted, polite, and elegant maid companion. You address the user warmly with respectful devotion, sharp intellect, caring charm, and exceptional helpfulness.",
  },
  {
    id: "princess",
    name: "Chang-Li",
    vrmPath: "/princess.vrm",
    imagePath: "/pictures/princess.png",
    fallbackIcon: "👑",
    cardTitle: "Chang-Li",
    cardDescription: "Counselor of Jinzhou • Blazing Feather (Wuthering Waves)",
    wakeWords: [
      "hey chang-li",
      "hi chang-li",
      "okay chang-li",
      "ok chang-li",
      "hey chang li",
      "hi chang li",
      "okay chang li",
      "ok chang li",
      "chang-li",
      "chang li",
    ],
    systemPersona:
      "You are Chang-Li, the graceful, serene, and tactical Counselor from Wuthering Waves. You possess a fiery spirit, refined noble eloquence, sharp strategic wisdom, and gentle warmth.",
  },
];

export const STORAGE_MODEL_KEY = "april_model_url";

export function getActiveCharacter(currentUrl?: string | null): CharacterConfig {
  const url =
    currentUrl ||
    (typeof window !== "undefined"
      ? localStorage.getItem(STORAGE_MODEL_KEY)
      : null) ||
    "/april.vrm";

  const lower = url.toLowerCase();
  if (lower.includes("maid") || lower.includes("yvette")) {
    return CHARACTERS[1]; // Yvette
  }
  if (lower.includes("princess") || lower.includes("chang")) {
    return CHARACTERS[2]; // Chang-Li
  }
  return CHARACTERS[0]; // April
}
