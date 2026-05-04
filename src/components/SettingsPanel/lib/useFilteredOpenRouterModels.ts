import { useEffect, useState } from "react";
import { listOpenRouterModels, type OpenRouterModel } from "../../../api";

// Cached + filtered OpenRouter model list. `kind` selects models that
// support the relevant audio modality:
//   - "tts": output_modalities contains "audio"
//   - "stt": input_modalities  contains "audio"
//
// The hook returns an empty list when disabled or when the network call
// fails — sections render hardcoded fallback options in that case.
export function useFilteredOpenRouterModels(
  enabled: boolean,
  kind: "tts" | "stt",
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
        const filtered = list.filter((m) => {
          const arch = m.architecture;
          if (!arch) return false;
          const mods =
            kind === "tts" ? arch.output_modalities : arch.input_modalities;
          return Array.isArray(mods) && mods.includes("audio");
        });
        // Sort: id alphabetical, but pin OpenAI audio models on top.
        filtered.sort((a, b) => {
          const ao = a.id.startsWith("openai/") ? 0 : 1;
          const bo = b.id.startsWith("openai/") ? 0 : 1;
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
