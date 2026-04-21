import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  getSettings,
  Mode,
  PublicSettings,
  setMode,
  setOpenRouterKey,
} from "../api";

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export default function SettingsPanel({ open, onClose, onChanged }: Props) {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      getSettings().then(setSettings);
      setKeyInput("");
    }
  }, [open]);

  const onModeChange = async (mode: Mode) => {
    await setMode(mode);
    const next = await getSettings();
    setSettings(next);
    onChanged();
  };

  const onSaveKey = async () => {
    if (!keyInput.trim()) return;
    setSaving(true);
    try {
      await setOpenRouterKey(keyInput.trim());
      const next = await getSettings();
      setSettings(next);
      setKeyInput("");
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const onClearKey = async () => {
    await setOpenRouterKey("");
    const next = await getSettings();
    setSettings(next);
    onChanged();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="settings"
          className="interactive"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16 }}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
          style={{
            position: "absolute",
            top: 60,
            left: 12,
            right: 12,
            padding: 14,
            borderRadius: 12,
            background: "rgba(18, 18, 26, 0.9)",
            color: "#fff",
            fontSize: 13,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <strong>Settings</strong>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#aaa",
                cursor: "pointer",
                fontSize: 16,
              }}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div>
            <div style={{ opacity: 0.7, marginBottom: 6 }}>Routing mode</div>
            <div style={{ display: "flex", gap: 6 }}>
              {(["auto", "local", "cloud"] as const).map((m) => {
                const active = settings?.mode === m;
                return (
                  <button
                    key={m}
                    onClick={() => onModeChange(m)}
                    style={{
                      flex: 1,
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: active
                        ? "1px solid #b39ddb"
                        : "1px solid rgba(255,255,255,0.1)",
                      background: active ? "rgba(179,157,219,0.2)" : "transparent",
                      color: "#fff",
                      cursor: "pointer",
                      textTransform: "capitalize",
                    }}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ opacity: 0.7, marginBottom: 6 }}>
              OpenRouter API key{" "}
              {settings?.has_openrouter_key && (
                <span style={{ color: "#a5d6a7" }}>• saved</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="password"
                placeholder={
                  settings?.has_openrouter_key ? "••••••••" : "sk-or-..."
                }
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(0,0,0,0.25)",
                  color: "#fff",
                  outline: "none",
                }}
              />
              <button
                disabled={saving || !keyInput.trim()}
                onClick={onSaveKey}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid #b39ddb",
                  background: "rgba(179,157,219,0.2)",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Save
              </button>
              {settings?.has_openrouter_key && (
                <button
                  onClick={onClearKey}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "transparent",
                    color: "#e57373",
                    cursor: "pointer",
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <div style={{ opacity: 0.5, fontSize: 11, marginTop: 6 }}>
              Model: {settings?.openrouter_model ?? "…"}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
