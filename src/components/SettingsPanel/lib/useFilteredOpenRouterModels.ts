import { useEffect, useState } from "react";
import { listOpenRouterModels, type OpenRouterModel } from "../../../api";

/// Capability buckets we care about. The OpenRouter `architecture`
/// metadata is a pair of `input_modalities` / `output_modalities`
/// arrays — we filter against them instead of trying to guess from the
/// model id, which is brittle (e.g. `qwen/qwen-2.5-vl-...` vs
/// `qwen2.5-vl/...`).
///
/// - "text": text → text. The default for chat / classifier / coach
///   text-only routing.
/// - "vision": image+text → text. Used by the game coach and any
///   future "look at this screenshot" features.
/// - "tts": text → audio.
/// - "stt": audio → text.
/// - "image": text → image. Image generation models exposed on
///   OpenRouter (e.g. Flux variants).
export type ModelKind = "text" | "vision" | "tts" | "stt" | "image";

function has(arr: unknown, value: string): boolean {
  return Array.isArray(arr) && (arr as string[]).includes(value);
}

function matches(m: OpenRouterModel, kind: ModelKind): boolean {
  const arch = m.architecture;
  if (!arch) return false;
  const ins = arch.input_modalities;
  const outs = arch.output_modalities;
  switch (kind) {
    case "text":
      // Plain text in, text out. Reject audio-only / image-only models.
      return has(ins, "text") && has(outs, "text");
    case "vision":
      return has(ins, "text") && has(ins, "image") && has(outs, "text");
    case "tts":
      return has(outs, "audio");
    case "stt":
      return has(ins, "audio");
    case "image":
      return has(outs, "image");
  }
}

// Cached + filtered OpenRouter model list. Returns the empty list when
// disabled or when the network call fails — callers render a minimal
// hardcoded fallback in that case.
export function useFilteredOpenRouterModels(
  enabled: boolean,
  kind: ModelKind,
): OpenRouterModel[] {
  const [models, setModels] = useState<OpenRouterModel[]>([]);

  useEffect(() => {
    if (!enabled) {
      setModels([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await listOpenRouterModels();
        if (cancelled) return;
        const filtered = list.filter((m) => matches(m, kind));
        // Sort: id alphabetical, but pin OpenAI / Anthropic / Google on
        // top — the most commonly-used providers, surfacing them first
        // saves a scroll for the typical user.
        const order = (id: string) =>
          id.startsWith("openai/")
            ? 0
            : id.startsWith("anthropic/")
              ? 1
              : id.startsWith("google/")
                ? 2
                : 3;
        filtered.sort((a, b) => {
          const ao = order(a.id);
          const bo = order(b.id);
          if (ao !== bo) return ao - bo;
          return a.id.localeCompare(b.id);
        });
        setModels(filtered);
      } catch {
        // Silently keep empty list — fallback hardcoded options will show.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, kind]);

  return models;
}
