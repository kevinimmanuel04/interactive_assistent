import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { t, useLocale } from "../i18n";
import { ChatIcon, CloseIcon } from "./icons";
import { getActiveCharacter } from "../utils/characters";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
  sttEnabled?: boolean;
  modelLabel?: string | null;
  isRotateMode?: boolean;
  onToggleRotateMode?: (rotate: boolean) => void;
  onToggleDrawer?: () => void;
  onToggleSettings?: () => void;
  onQuit?: () => void;
  onSpeechUpdate?: (text: string) => void;
}

export default function InputField({
  open,
  onClose,
  onSubmit,
  sttEnabled = true,
  modelLabel: _modelLabel,
  isRotateMode = false,
  onToggleRotateMode,
  onToggleDrawer,
  onToggleSettings,
  onQuit,
  onSpeechUpdate,
}: Props) {
  useLocale();
  const [value, setValue] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [charName, setCharName] = useState(() => getActiveCharacter().name);

  useEffect(() => {
    const handleCharChange = () => setCharName(getActiveCharacter().name);
    window.addEventListener("april-character-changed", handleCharChange);
    return () => window.removeEventListener("april-character-changed", handleCharChange);
  }, []);

  const ref = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLTextAreaElement>(null);

  const handleSpeechAutoSubmit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed) {
        setValue("");
        setIsExpanded(false);
        onSubmit(trimmed);
      }
    },
    [onSubmit]
  );

  const {
    isListening,
    transcript,
    interimTranscript,
    toggleListening,
    stopListening,
  } = useSpeechRecognition({
    onAutoSubmit: handleSpeechAutoSubmit,
  });

  // Real-time Voice Input update to Subtitles "You:" section ONLY
  useEffect(() => {
    if (isListening) {
      const currentText = (transcript + " " + interimTranscript).trim();
      if (currentText) {
        onSpeechUpdate?.(currentText);
      }
    }
  }, [isListening, transcript, interimTranscript, onSpeechUpdate]);

  useEffect(() => {
    if (open) {
      setValue("");
      queueMicrotask(() => ref.current?.focus());
    } else if (isListening) {
      stopListening();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isExpanded) {
      queueMicrotask(() => popupRef.current?.focus());
    }
  }, [isExpanded]);

  const handleFormSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = value.trim();
    if (text) {
      if (isListening) stopListening();
      setValue(""); // IMMEDIATELY CLEAR INPUT TEXT AREA ON SEND!
      setIsExpanded(false);
      onSubmit(text);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div
          key="input-root-wrapper"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            height: "auto",
            pointerEvents: "none",
            zIndex: 999,
          }}
        >
          {/* Expanded Pop-up Modal when input is clicked */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                key="popup-modal"
                className="interactive"
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.96 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                style={{
                  position: "absolute",
                  bottom: 64,
                  left: 12,
                  right: 12,
                  background: "rgba(18, 18, 26, 0.96)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  borderRadius: 18,
                  border: "1px solid rgba(124, 77, 255, 0.6)",
                  boxShadow: "0 16px 40px rgba(124, 77, 255, 0.35), 0 10px 30px rgba(0,0,0,0.8)",
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  pointerEvents: "auto",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
                    Ask {charName}...
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsExpanded(false)}
                    style={{
                      background: "rgba(255, 255, 255, 0.08)",
                      border: "none",
                      borderRadius: 6,
                      color: "#aaa",
                      cursor: "pointer",
                      width: 24,
                      height: 24,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    ×
                  </button>
                </div>
                <textarea
                  ref={popupRef}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleFormSubmit();
                    } else if (e.key === "Escape") {
                      setIsExpanded(false);
                    }
                  }}
                  placeholder={`Type your message to ${charName}...`}
                  style={{
                    width: "100%",
                    height: 80,
                    background: "rgba(0, 0, 0, 0.3)",
                    border: "1px solid rgba(124, 77, 255, 0.3)",
                    borderRadius: 10,
                    color: "#fff",
                    padding: "10px 12px",
                    fontSize: 14,
                    outline: "none",
                    resize: "none",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                  }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setIsExpanded(false)}
                    className="dock-action-btn"
                    style={{ width: "auto", padding: "0 12px" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFormSubmit()}
                    disabled={!value.trim()}
                    className="button-send-fly"
                  >
                    <div className="svg-wrapper-1">
                      <div className="svg-wrapper">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16}>
                          <path fill="none" d="M0 0h24v24H0z" />
                          <path fill="currentColor" d="M1.946 9.315c-.522-.174-.527-.455.01-.634l19.087-6.362c.529-.176.832.12.684.638l-5.454 19.086c-.15.529-.455.547-.679.045L12 14l6-8-8 6-8.054-2.685z" />
                        </svg>
                      </div>
                    </div>
                    <span>Send</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Master Bottom Dock Bar - Always Fixed at Window Bottom */}
          <motion.form
            key="input"
            className="interactive master-dock-container"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onSubmit={handleFormSubmit}
            style={{
              position: "fixed",
              bottom: 12,
              left: 12,
              right: 12,
              pointerEvents: "auto",
            }}
          >

            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {/* 1. Left Action Controls: Chat History & Animated Settings Gear */}
              {onToggleDrawer && (
                <button
                  type="button"
                  onClick={onToggleDrawer}
                  className="dock-action-btn"
                  title="Chat History"
                  aria-label="Chat History"
                >
                  <ChatIcon size={15} />
                </button>
              )}
              {onToggleSettings && (
                <button
                  type="button"
                  onClick={() => {
                    setIsExpanded(false);
                    onToggleSettings();
                  }}
                  className="settings-button"
                  title="Settings"
                  aria-label="Settings"
                >
                  <svg
                    className="settings-btn-icon"
                    xmlns="http://www.w3.org/2000/svg"
                    height={18}
                    viewBox="0 -960 960 960"
                    width={18}
                    fill="#e8eaed"
                  >
                    <path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z" />
                  </svg>
                </button>
              )}
              {/* Animated Burger Mode Toggle Switch */}
              {onToggleRotateMode && (
                <label
                  className="burger-wrapper"
                  title={
                    isRotateMode
                      ? "Switch to Drag Window"
                      : `Switch to Rotate ${charName}`
                  }
                >
                  <input
                    id="burger-checkbox"
                    type="checkbox"
                    checked={isRotateMode}
                    onChange={(e) => onToggleRotateMode(e.target.checked)}
                  />
                  <span className="burger">
                    <span />
                    <span />
                    <span />
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#fff" }}>
                    {isRotateMode ? "Rotate" : "Drag"}
                  </span>
                </label>
              )}
              <div className="dock-divider" />

              {/* Unified Widget Mode Animated Type Bar with Mic AI Orb & Send Button */}
              <div className="container-ia-chat-widget">
                {/* 1. Input text MUST be first for CSS ~ sibling selectors to work */}
                <input
                  ref={ref}
                  type="text"
                  name="input-text"
                  id="input-text-widget"
                  className="input-text-widget"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onClick={() => setIsExpanded(true)}
                  onFocus={() => setIsExpanded(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleFormSubmit();
                    } else if (e.key === "Escape" && !value) {
                      onClose();
                    }
                  }}
                  placeholder={isListening ? "Listening..." : `Ask ${charName}...`}
                  required
                />

                {/* 2. Mic / Voice Dictation Button & Miniaturized AI Orb */}
                {sttEnabled && (
                  <div
                    className={`label-voice-widget ${isListening ? "label-voice-widget--active" : ""}`}
                    onClick={toggleListening}
                    title={isListening ? t("input.mic.stop") : t("input.mic.start")}
                  >
                    <svg className="icon-voice" xmlns="http://www.w3.org/2000/svg" width={18} height={18} viewBox="0 0 24 24">
                      <path fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={2} d="M12 4v16m4-13v10M8 7v10m12-6v2M4 11v2" />
                    </svg>
                    <div className="ai-mini">
                      <div className="container">
                        <div className="c c4" />
                        <div className="c c1" />
                        <div className="c c2" />
                        <div className="c c3" />
                        <div className="rings" />
                      </div>
                      <div className="glass" />
                    </div>
                  </div>
                )}
              </div>

              <div className="dock-divider" />

              {/* 6. Window Controls: Minimize & Close */}
              <button
                type="button"
                onClick={async () => {
                  try {
                    const { invoke } = await import("@tauri-apps/api/core");
                    await invoke("minimize_window");
                  } catch {
                    const { getCurrentWindow } = await import("@tauri-apps/api/window");
                    void getCurrentWindow().minimize();
                  }
                }}
                className="dock-action-btn"
                title="Minimize to Taskbar"
                aria-label="Minimize to Taskbar"
              >
                <span style={{ fontSize: 14, fontWeight: "bold", lineHeight: 1 }}>−</span>
              </button>

              {onQuit && (
                <button
                  type="button"
                  onClick={onQuit}
                  className="dock-action-btn dock-close-btn"
                  title="Quit Application"
                  aria-label="Quit Application"
                >
                  <CloseIcon size={13} />
                </button>
              )}
            </div>
          </motion.form>
        </div>
      )}
    </AnimatePresence>
  );
}
