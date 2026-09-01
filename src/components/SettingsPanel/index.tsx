import { AnimatePresence, motion } from "framer-motion";
import CloseButton from "../CloseButton";
import { useCallback, useEffect, useState } from "react";
import { getSettings, type PublicSettings } from "../../api";
import { t, useLocale } from "../../i18n";
import SectionCard from "./lib/SectionCard";

// Restructured sections
import ApiKeySection from "./sections/ApiKeySection";
import UserNameSection from "./sections/UserNameSection";
import ElevenLabsVoiceSection from "./sections/voice/ElevenLabsVoiceSection";
import Live2DSection from "./sections/Live2DSection";
import AvatarLayoutSection from "./sections/AvatarLayoutSection";
import VoiceActivationSection from "./sections/VoiceActivationSection";
import LanguageSection from "./sections/locale/LanguageSection";
import UserManualSection from "./sections/UserManualSection";

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

type Tab = "general" | "avatar" | "advanced" | "manual";

export default function SettingsPanel({ open, onClose, onChanged }: Props) {
  useLocale();
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [tab, setTab] = useState<Tab>("general");

  useEffect(() => {
    if (open) {
      getSettings().then(setSettings);
    }
  }, [open]);

  const refresh = useCallback(async () => {
    const next = await getSettings();
    setSettings(next);
    onChanged();
  }, [onChanged]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="settings"
          className="interactive"
          initial={{ opacity: 0, scale: 0.98, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: -4 }}
          transition={{ duration: 0.15 }}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
          style={{
            position: "absolute",
            top: 20,
            left: 16,
            right: 16,
            bottom: 86, // Prevents bottom dock bar from covering settings!
            borderRadius: 16,
            background: "rgba(18, 18, 28, 0.96)",
            color: "#fff",
            fontSize: 13,
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            boxShadow: "0 20px 50px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.12)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            zIndex: 100,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 18px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <strong style={{ fontSize: 15, letterSpacing: "0.5px", color: "#fff" }}>⚙️ Assistant Settings</strong>
            <CloseButton onClick={onClose} title={t("common.close")} size={30} />
          </div>

          {/* Navigation Tabs */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "8px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(0,0,0,0.25)",
            }}
          >
            <div className="settings-tabs">
              <input
                type="radio"
                name="settings-tab"
                id="tab-keys"
                checked={tab === "general"}
                onChange={() => setTab("general")}
              />
              <label htmlFor="tab-keys" onClick={() => setTab("general")}>
                <svg width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                </svg>
                <span>Keys &amp; Voice</span>
              </label>

              <input
                type="radio"
                name="settings-tab"
                id="tab-avatar"
                checked={tab === "avatar"}
                onChange={() => setTab("avatar")}
              />
              <label htmlFor="tab-avatar" onClick={() => setTab("avatar")}>
                <svg width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <rect x={3} y={11} width={18} height={10} rx={2} />
                  <circle cx={12} cy={5} r={2} />
                  <path d="M12 7v4M8 16h8M6 11V9a2 2 0 012-2h8a2 2 0 012 2v2" />
                </svg>
                <span>Characters</span>
              </label>

              <input
                type="radio"
                name="settings-tab"
                id="tab-features"
                checked={tab === "advanced"}
                onChange={() => setTab("advanced")}
              />
              <label htmlFor="tab-features" onClick={() => setTab("advanced")}>
                <svg width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
                <span>Features</span>
              </label>

              <input
                type="radio"
                name="settings-tab"
                id="tab-manual"
                checked={tab === "manual"}
                onChange={() => setTab("manual")}
              />
              <label htmlFor="tab-manual" onClick={() => setTab("manual")}>
                <svg width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  <path d="M9 7h6M9 11h4" />
                </svg>
                <span>User Guide</span>
              </label>

              <div
                className="tab-indicator"
                style={{
                  width: "calc((100% - 8px) / 4)",
                  transform:
                    tab === "general"
                      ? "translateX(0%)"
                      : tab === "avatar"
                        ? "translateX(100%)"
                        : tab === "advanced"
                          ? "translateX(200%)"
                          : "translateX(300%)",
                }}
              />
            </div>
          </div>

          {/* Scrollable Content Container */}
          <div
            style={{
              overflowY: "auto",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              flex: 1,
              minHeight: 0,
            }}
          >
            {tab === "general" && (
              <>
                {/* AI Service API Key Input */}
                <SectionCard>
                  <ApiKeySection settings={settings} refresh={refresh} />
                </SectionCard>

                {/* ElevenLabs Custom Voice ID & Secret Key */}
                <SectionCard>
                  <ElevenLabsVoiceSection />
                </SectionCard>
              </>
            )}

            {tab === "avatar" && (
              <>
                {/* Live2D Model Customization */}
                <SectionCard>
                  <Live2DSection settings={settings} refresh={refresh} />
                </SectionCard>

                {/* Avatar Scale and Position Layout */}
                <SectionCard>
                  <AvatarLayoutSection settings={settings} refresh={refresh} />
                </SectionCard>
              </>
            )}

            {tab === "advanced" && (
              <>
                {/* Nickname / Display Name Customization */}
                <SectionCard>
                  <UserNameSection settings={settings} refresh={refresh} />
                </SectionCard>

                {/* Hands-Free Voice Activation */}
                <SectionCard>
                  <VoiceActivationSection />
                </SectionCard>

                {/* Interface Language & Localization */}
                <SectionCard>
                  <LanguageSection settings={settings} refresh={refresh} />
                </SectionCard>
              </>
            )}

            {tab === "manual" && <UserManualSection />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
