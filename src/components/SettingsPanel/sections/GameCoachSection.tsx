// Game coach: an experimental feature that injects an additional turn
// from a vision-capable model when the user is playing a game (detected
// elsewhere). Disabled by default — only activates when an OpenRouter
// key is configured.

import {
  setGameCoachEnabled,
  setGameCoachModel,
  setGameCoachUseVision,
  type PublicSettings,
} from "../../../api";
import { t, useLocale } from "../../../i18n";
import { inputStyle } from "../styles";

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export default function GameCoachSection({ settings, refresh }: Props) {
  useLocale();
  const hasKey = settings?.has_openrouter_key ?? false;
  const enabled = settings?.game_coach_enabled ?? false;
  const model = settings?.game_coach_model ?? "openai/gpt-4o-mini";
  const useVision = settings?.game_coach_use_vision ?? true;

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
        <input
          type="text"
          list="game-coach-models"
          defaultValue={model}
          disabled={!hasKey}
          onBlur={(e) => {
            if (e.target.value !== model) commitModel(e.target.value);
          }}
          style={inputStyle}
        />
        <datalist id="game-coach-models">
          <option value="openai/gpt-4o-mini" />
          <option value="openai/gpt-4o" />
          <option value="google/gemini-2.5-flash" />
          <option value="anthropic/claude-3.5-sonnet" />
        </datalist>
        <div style={{ opacity: 0.5, fontSize: 11, marginTop: 6 }}>
          {t("settings.coach.hint")}
        </div>
      </div>
    </div>
  );
}
