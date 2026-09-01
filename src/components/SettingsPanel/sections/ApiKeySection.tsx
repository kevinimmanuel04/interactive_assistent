import { useState } from "react";
import { setOpenRouterKey, type PublicSettings } from "../../../api";
import { cardTitleStyle, subCardStyle } from "../styles";
import { toast } from "../../Toast";

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export default function ApiKeySection({ settings, refresh }: Props) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    if (!key.trim()) return;
    setBusy(true);
    try {
      const cleanKey = key.trim();
      localStorage.setItem("april_openrouter_key", cleanKey);
      localStorage.setItem("april_openrouter_key", cleanKey);
      await setOpenRouterKey(cleanKey);
      setKey("");
      await refresh();
      toast.success("OpenRouter / OpenCode Zen API key saved successfully!");
    } catch (err) {
      toast.error(`Failed to save key: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={cardTitleStyle}>
        <span>🔑 AI Service API Keys</span>
      </div>

      <div style={{ ...subCardStyle, display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              OpenRouter / OpenCode Zen API Key:
            </label>
            <span style={{ fontSize: 11, color: settings?.has_openrouter_key ? "#a5d6a7" : "#ffb74d" }}>
              {settings?.has_openrouter_key ? "● Key Configured" : "○ No Key Set"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="textInputWrapper" style={{ flex: 1 }}>
              <input
                type="password"
                className="textInput"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sk-or-v1-..."
              />
            </div>
            <button
              onClick={handleSave}
              disabled={busy || !key.trim()}
              className="send-button"
              style={{ padding: "5px 12px", fontSize: 12 }}
            >
              <div className="svg-wrapper-1">
                <div className="svg-wrapper">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={14} height={14}>
                    <path fill="none" d="M0 0h24v24H0z" />
                    <path fill="currentColor" d="M1.946 9.315c-.522-.174-.527-.455.01-.634l19.087-6.362c.529-.176.832.12.684.638l-5.454 19.086c-.15.529-.455.547-.679.045L12 14l6-8-8 6-8.054-2.685z" />
                  </svg>
                </div>
              </div>
              <span>{busy ? "Saving..." : "Save Key"}</span>
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
            Powers DeepSeek V3/R1, Claude 3.5 Sonnet, GPT-4o, and automatic smart routing models.
          </div>
        </div>
      </div>
    </div>
  );
}
