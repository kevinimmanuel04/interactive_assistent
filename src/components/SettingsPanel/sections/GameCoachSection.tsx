// Game coach: an experimental feature that injects an additional turn
// from a vision-capable model when the user is playing a game (detected
// elsewhere). Disabled by default — only activates when an OpenRouter
// key is configured.

import { useEffect, useState } from "react";
import {
  setGameCoachEnabled,
  setGameCoachModel,
  setGameCoachUseVision,
  type PublicSettings,
} from "../../../api";
import { t, useLocale } from "../../../i18n";
import ModelCombobox from "../lib/ModelCombobox";

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export default function GameCoachSection({ settings, refresh }: Props) {
  useLocale();
  const hasKey = settings?.has_openrouter_key ?? false;
  const enabled = settings?.game_coach_enabled ?? false;
  const useVision = settings?.game_coach_use_vision ?? true;
  const persistedModel = settings?.game_coach_model ?? "openai/gpt-4o-mini";
  // Local draft so typing doesn't fire a Tauri save on every keystroke.
  const [model, setModel] = useState(persistedModel);
  useEffect(() => setModel(persistedModel), [persistedModel]);

  const toggle = async (v: boolean) => {
    await setGameCoachEnabled(v);
    await refresh();
  };
  const commitModel = async (v: string) => {
    await setGameCoachModel(v);
    await refresh();
  };
  const toggleVision = async (v: boolean) => {
    await setGameCoachUseVision(v);
    await refresh();
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ opacity: 0.7, marginBottom: 6 }}>
        {t("settings.coach.title")}
      </div>
      <div
        style={{
          padding: 8,
          background: "rgba(255,255,255,0.03)",
          borderRadius: 6,
        }}
      >
        {!hasKey && (
          <div style={{ color: "#ffb74d", fontSize: 11, marginBottom: 6 }}>
            {t("settings.coach.no_key_text_only")}
          </div>
        )}
        <label
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => toggle(e.target.checked)}
          />
          {t("settings.coach.enable")}
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            marginTop: 6,
          }}
        >
          <input
            type="checkbox"
            checked={useVision}
            disabled={!enabled}
            onChange={(e) => toggleVision(e.target.checked)}
          />
          {t("settings.coach.use_vision")}
        </label>
        <div style={{ opacity: 0.55, fontSize: 11, marginTop: 4 }}>
          {t("settings.coach.use_vision_hint")}
        </div>
        <div style={{ opacity: 0.7, fontSize: 11, marginTop: 8, marginBottom: 4 }}>
          {t("settings.coach.model")}
        </div>
        <ModelCombobox
          value={model}
          onChange={setModel}
          onCommit={(v) => {
            if (v !== persistedModel) void commitModel(v);
          }}
          // Filter to vision-capable models when "use vision" is on,
          // otherwise show every text-capable model. Some users disable
          // vision to save tokens but still want a smarter coach.
          kind={useVision ? "vision" : "text"}
          enabled={hasKey}
          disabled={!hasKey}
          fallback={[
            "openai/gpt-4o-mini",
            "openai/gpt-4o",
            "google/gemini-2.5-flash",
            "anthropic/claude-3.5-sonnet",
          ]}
        />
        <div style={{ opacity: 0.5, fontSize: 11, marginTop: 6 }}>
          {t("settings.coach.hint")}
        </div>
      </div>
    </div>
  );
}
