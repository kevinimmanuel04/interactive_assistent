import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type {
  RelationshipStage,
  RelationshipState,
  RelationshipStageChange,
} from "./types";

export async function getRelationshipState(): Promise<RelationshipState> {
  return invoke<RelationshipState>("get_relationship_state");
}

export async function resetRelationship(): Promise<void> {
  await invoke("reset_relationship");
}

export async function setUserName(name: string): Promise<void> {
  await invoke("set_user_name", { name });
}

export async function setRelationshipVisibility(
  visibility: "indicator" | "hidden",
): Promise<void> {
  await invoke("set_relationship_visibility", { visibility });
}

export async function setRelationshipNsfwAllowed(
  allowed: boolean,
): Promise<void> {
  await invoke("set_relationship_nsfw_allowed", { allowed });
}

export async function setRelationshipDecayEnabled(
  enabled: boolean,
): Promise<void> {
  await invoke("set_relationship_decay_enabled", { enabled });
}

export async function setLanguage(
  language: "auto" | "en" | "ru" | "uk",
): Promise<void> {
  await invoke("set_language", { language });
}

export async function getResolvedLanguage(): Promise<"en" | "ru" | "uk"> {
  return (await invoke<string>("get_resolved_language")) as
    | "en"
    | "ru"
    | "uk";
}

export function onRelationshipUpdated(
  cb: (s: RelationshipState) => void,
): Promise<UnlistenFn> {
  return listen<RelationshipState>("relationship:updated", (evt) =>
    cb(evt.payload),
  );
}

export function onRelationshipStageChange(
  cb: (e: RelationshipStageChange) => void,
): Promise<UnlistenFn> {
  return listen<RelationshipStageChange>("relationship:stage-change", (evt) =>
    cb(evt.payload),
  );
}

export const STAGE_LABELS: Record<
  RelationshipStage,
  { en: string; ru: string; emoji: string }
> = {
  stranger: { en: "Stranger", ru: "Незнакомец", emoji: "🤍" },
  acquaintance: { en: "Acquaintance", ru: "Знакомый", emoji: "🩶" },
  friend: { en: "Friend", ru: "Друг", emoji: "💚" },
  close: { en: "Close", ru: "Близкий", emoji: "💛" },
  trusted: { en: "Trusted", ru: "Доверенный", emoji: "🧡" },
  romantic: { en: "Romantic", ru: "Романтика", emoji: "💖" },
  lover: { en: "Lover", ru: "Любимый", emoji: "❤️" },
};

export const STAGE_THRESHOLDS: Record<RelationshipStage, number> = {
  stranger: 0,
  acquaintance: 50,
  friend: 150,
  close: 300,
  trusted: 500,
  romantic: 750,
  lover: 1000,
};
