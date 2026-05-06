// Smart routing: when enabled, the assistant uses a tiny classifier model
// (running on OpenRouter) to decide whether each user turn should hit the
// local LLM or the cloud LLM. The classifier model id is user-editable;
// we default to a 3B-class model that's cheap enough to run on every turn.

import { useEffect, useState } from "react";
import {
  setClassifierModel,
  setSmartRouting,
  type PublicSettings,
} from "../../../api";
import { t, useLocale } from "../../../i18n";
import ModelCombobox from "../lib/ModelCombobox";

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export default function SmartRoutingSection({ settings, refresh }: Props) {
  useLocale();
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const enabled = settings?.smart_routing ?? false;
  const hasKey = settings?.has_openrouter_key ?? false;

  useEffect(() => {
    setModel(settings?.classifier_model ?? "");
  }, [settings?.classifier_model]);

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      await setSmartRouting(on);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const saveModel = async (value: string) => {
    setBusy(true);
    try {
      await setClassifierModel(value);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ opacity: 0.7, marginBottom: 6 }}>
        {t("settings.smart.label")}{" "}
        {enabled && (
          <span style={{ color: "#a5d6a7" }}>{t("settings.status.on")}</span>
        )}
      </div>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy || !hasKey}
          onChange={(e) => toggle(e.target.checked)}
        />
        {t("settings.smart.enable")}
      </label>
      <ModelCombobox
        value={model}
        onChange={setModel}
        onCommit={(v) =>
          v !== (settings?.classifier_model ?? "") && saveModel(v)
        }
        kind="text"
        enabled={hasKey && enabled}
        disabled={busy || !enabled}
        placeholder="meta-llama/llama-3.2-3b-instruct"
        fallback={[
          "meta-llama/llama-3.2-3b-instruct",
          "openai/gpt-4o-mini",
          "anthropic/claude-3-haiku",
          "google/gemini-flash-1.5",
        ]}
      />
      <div style={{ opacity: 0.5, fontSize: 11, marginTop: 6 }}>
        {hasKey ? t("settings.smart.hint_on") : t("settings.smart.hint_off")}
      </div>
    </div>
  );
}
