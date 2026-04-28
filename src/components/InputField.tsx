import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { cancelRecording, startRecording, stopRecording } from "../api";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
  sttEnabled?: boolean;
}

export default function InputField({ open, onClose, onSubmit, sttEnabled = false }: Props) {
  const [value, setValue] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue("");
      setMicError(null);
      queueMicrotask(() => ref.current?.focus());
    } else if (recording) {
      // Closing while recording: discard.
      cancelRecording().catch(() => {});
      setRecording(false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMic = async () => {
    setMicError(null);
    if (recording) {
      setBusy(true);
      setRecording(false);
      setTranscribing(true);
      try {
        const text = await stopRecording();
        const trimmed = text.trim();
        if (trimmed) {
          // Auto-submit: user expectation is that speaking then tapping
          // "stop" sends the message. Pre-filling the text box and
          // requiring another Enter press is surprising.
          setValue("");
          onSubmit(trimmed);
        } else {
          setMicError("No speech detected");
          queueMicrotask(() => ref.current?.focus());
        }
      } catch (err) {
        setMicError(String(err));
      } finally {
        setTranscribing(false);
        setBusy(false);
      }
    } else {
      setBusy(true);
      try {
        await startRecording();
        setRecording(true);
      } catch (err) {
        setMicError(String(err));
      } finally {
        setBusy(false);
      }
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.form
          key="input"
          className="interactive"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          onSubmit={(e) => {
            e.preventDefault();
            const text = value.trim();
            if (text) onSubmit(text);
          }}
          style={{
            position: "absolute",
            bottom: 16,
            left: 12,
            right: 12,
            zIndex: 10,
            padding: "8px 10px",
            borderRadius: 12,
            background: "rgba(20, 20, 28, 0.88)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {sttEnabled && (
              <button
                type="button"
                onClick={toggleMic}
                disabled={busy}
                title={recording ? "Stop recording" : "Start recording (mic)"}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  border: "none",
                  cursor: busy ? "wait" : "pointer",
                  background: recording ? "#e24a4a" : "rgba(255,255,255,0.08)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  transition: "background 0.18s",
                }}
              >
                {recording ? "■" : "🎙"}
              </button>
            )}
            <input
              ref={ref}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && (e.target as HTMLInputElement).value === "") {
                  onClose();
                }
              }}
              placeholder={
                transcribing
                  ? "Transcribing…"
                  : recording
                  ? "Listening…"
                  : "Ask anything…"
              }
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "#fff",
                fontSize: 14,
                padding: "6px 6px",
              }}
            />
          </div>
          {micError && (
            <div style={{ fontSize: 11, color: "#ff8888", padding: "0 6px" }}>
              {micError}
            </div>
          )}
        </motion.form>
      )}
    </AnimatePresence>
  );
}
