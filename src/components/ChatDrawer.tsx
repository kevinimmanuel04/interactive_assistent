import { AnimatePresence, motion } from "framer-motion";
import CloseButton from "./CloseButton";
import { useCallback, useEffect, useState } from "react";
import { clearHistory, loadHistory, type StoredMessage } from "../services/chatStorage";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useLocale } from "../i18n";
import { toast } from "./Toast";
import EnergyOrb from "./EnergyOrb";
import { MicIcon, StopIcon } from "./icons";
import { getActiveCharacter } from "../utils/characters";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit?: (text: string) => void;
}

export default function ChatDrawer({ open, onClose, onSubmit }: Props) {
  useLocale();
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [drawerInput, setDrawerInput] = useState("");
  const [charName, setCharName] = useState(() => getActiveCharacter().name);

  useEffect(() => {
    const handleCharChange = () => setCharName(getActiveCharacter().name);
    window.addEventListener("april-character-changed", handleCharChange);
    return () => window.removeEventListener("april-character-changed", handleCharChange);
  }, []);

  const refreshHistory = () => {
    setMessages(loadHistory());
  };

  const handleSpeechAutoSubmit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed && onSubmit) {
        onSubmit(trimmed);
        setDrawerInput("");
        setTimeout(refreshHistory, 300);
      }
    },
    [onSubmit]
  );

  const {
    isListening,
    toggleListening,
  } = useSpeechRecognition({
    onAutoSubmit: handleSpeechAutoSubmit,
  });



  useEffect(() => {
    if (open) {
      refreshHistory();
    }
  }, [open]);

  const handleClose = () => {
    onClose();
  };

  const handleClear = () => {
    clearHistory();
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
    setMessages([]);
    toast.success("April chat history cleared");
  };

  const handleDrawerSubmit = () => {
    const text = drawerInput.trim();
    if (text && onSubmit) {
      onSubmit(text);
      setDrawerInput("");
      setTimeout(refreshHistory, 300);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="interactive"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.85)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              zIndex: 998,
              pointerEvents: "auto",
            }}
          />

          {/* Full Screen Chat Panel */}
          <motion.div
            className="interactive"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: "100vw",
              height: "100vh",
              background: "rgba(13, 14, 21, 0.98)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              borderRadius: 0,
              boxShadow: "0 24px 64px rgba(0, 0, 0, 0.9)",
              display: "flex",
              flexDirection: "column",
              zIndex: 999,
              overflow: "hidden",
              color: "#f3f4f6",
              pointerEvents: "auto",
              fontFamily:
                "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            }}
          >
            {/* Full Screen Top Header Bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 28px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                background: "rgba(255, 255, 255, 0.03)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: "rgba(0, 0, 0, 0.4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    boxShadow: "0 4px 14px rgba(124, 77, 255, 0.4)",
                    border: "1px solid rgba(124, 77, 255, 0.4)",
                  }}
                >
                  <EnergyOrb size={34} mode="icon" />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", letterSpacing: 0.3 }}>
                    April Full Screen Chat
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                    {messages.length} messages in memory
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {messages.length > 0 && (
                  <button
                    onClick={handleClear}
                    style={{
                      background: "rgba(239, 68, 68, 0.18)",
                      border: "1px solid rgba(239, 68, 68, 0.35)",
                      color: "#fca5a5",
                      cursor: "pointer",
                      fontSize: 13,
                      padding: "6px 14px",
                      borderRadius: 8,
                      fontWeight: 500,
                      transition: "all 0.15s ease",
                    }}
                  >
                    Clear History
                  </button>
                )}
                <CloseButton onClick={handleClose} title="Close Full Screen Chat" size={34} />
              </div>
            </div>

            {/* Messages Stream Container (Max Width 860px Centered) */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "24px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 18,
                width: "100%",
                maxWidth: 860,
                margin: "0 auto",
              }}
            >
              {messages.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    color: "rgba(255, 255, 255, 0.4)",
                    marginTop: 140,
                    fontSize: 15,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div style={{ fontSize: 32 }}>🌸</div>
                  <span>No conversation history yet. Start chatting with April!</span>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                      width: "100%",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "rgba(255, 255, 255, 0.45)",
                        marginBottom: 4,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "0 4px",
                      }}
                    >
                      <span>{msg.role === "user" ? "You" : "April"}</span>
                      <span>•</span>
                      <span>
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div
                      style={{
                        position: "relative",
                        maxWidth: msg.role === "user" ? "80%" : "85%",
                        padding: "12px 18px",
                        borderRadius:
                          msg.role === "user" ? "16px 16px 2px 16px" : "16px 16px 16px 2px",
                        fontSize: 14,
                        lineHeight: 1.55,
                        background:
                          msg.role === "user"
                            ? "linear-gradient(135deg, #7c4dff 0%, #651fff 100%)"
                            : "rgba(255, 255, 255, 0.06)",
                        color: "#fff",
                        border:
                          msg.role === "user"
                            ? "1px solid rgba(255, 255, 255, 0.2)"
                            : "1px solid rgba(255, 255, 255, 0.08)",
                        boxShadow:
                          msg.role === "user"
                            ? "0 4px 14px rgba(124, 77, 255, 0.3)"
                            : "none",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        overflow: "hidden",
                      }}
                    >
                      {msg.role !== "user" && (
                        <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
                          <EnergyOrb mode="background" />
                        </div>
                      )}
                      <div style={{ position: "relative", zIndex: 1 }}>
                        {msg.content}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Bottom Full Screen Input Bar (Max Width 860px Centered) */}
            <div
              style={{
                padding: "16px 28px",
                borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                background: "rgba(0, 0, 0, 0.4)",
              }}
            >
              <div
                style={{
                  maxWidth: 860,
                  width: "100%",
                  margin: "0 auto",
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                {/* Voice Mic Button */}
                <button
                  type="button"
                  onClick={toggleListening}
                  className="dock-action-btn"
                  title={isListening ? "Stop listening" : "Start voice input"}
                  style={{
                    background: isListening
                      ? "rgba(244, 67, 54, 0.4)"
                      : "rgba(255,255,255,0.06)",
                    borderColor: isListening
                      ? "rgba(244, 67, 54, 0.8)"
                      : "rgba(255,255,255,0.12)",
                    color: isListening ? "#ff8a80" : "#fff",
                    boxShadow: isListening ? "0 0 12px rgba(244, 67, 54, 0.6)" : "none",
                  }}
                >
                  {isListening ? <StopIcon size={13} /> : <MicIcon size={15} />}
                </button>

                <input
                  value={drawerInput}
                  onChange={(e) => setDrawerInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && drawerInput.trim()) {
                      e.preventDefault();
                      handleDrawerSubmit();
                    }
                  }}
                  placeholder={isListening ? "Listening..." : `Type your message to ${charName}...`}
                  style={{
                    flex: 1,
                    padding: "12px 16px",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    background: "rgba(20, 20, 28, 0.9)",
                    color: "#fff",
                    borderRadius: 12,
                    fontSize: 14,
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={handleDrawerSubmit}
                  disabled={!drawerInput.trim()}
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
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
