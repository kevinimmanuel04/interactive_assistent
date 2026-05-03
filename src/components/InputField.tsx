import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { cancelRecording, startRecording, stopRecording } from "../api";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
  /// Vision callbacks. Each takes the current question text (may be empty).
  onVisionFull?: (prompt: string) => void;
  onOpenVisionRegionPicker?: (prompt: string) => void;
  onVisionImage?: (prompt: string, pngBase64: string) => void;
  onImagePrompt?: (prompt: string) => void;
  sttEnabled?: boolean;
  visionEnabled?: boolean;
}

export default function InputField({
  open,
  onClose,
  onSubmit,
  onVisionFull,
  onOpenVisionRegionPicker,
  onVisionImage,
  onImagePrompt,
  sttEnabled = false,
  visionEnabled = false,
}: Props) {
  const [value, setValue] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [visionMenuOpen, setVisionMenuOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
            {onImagePrompt && (
              <button
                type="button"
                onClick={() => {
                  const prompt = value.trim();
                  if (!prompt) return;
                  onImagePrompt(prompt);
                  setValue("");
                }}
                title="Generate image from prompt"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  border: "none",
                  cursor: "pointer",
                  background: "rgba(179,157,219,0.25)",
                  color: "#fff",
                  fontSize: 14,
                  marginRight: 4,
                }}
              >
                🎨
              </button>
            )}
            {visionEnabled && (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setVisionMenuOpen((v) => !v)}
                  title="Show me — capture screen / region / image"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    border: "none",
                    cursor: "pointer",
                    background: visionMenuOpen
                      ? "rgba(111,174,90,0.6)"
                      : "rgba(255,255,255,0.08)",
                    color: "#fff",
                    fontSize: 14,
                  }}
                >
                  👁
                </button>
                {visionMenuOpen && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: 36,
                      right: 0,
                      minWidth: 180,
                      padding: 4,
                      borderRadius: 8,
                      background: "rgba(20,20,28,0.96)",
                      boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      zIndex: 20,
                    }}
                  >
                    <button
                      type="button"
                      style={menuBtn}
                      onClick={() => {
                        setVisionMenuOpen(false);
                        onVisionFull?.(value.trim());
                        setValue("");
                      }}
                    >
                      🖥 Full screen
                    </button>
                    <button
                      type="button"
                      style={menuBtn}
                      onClick={() => {
                        setVisionMenuOpen(false);
                        onOpenVisionRegionPicker?.(value.trim());
                        setValue("");
                      }}
                    >
                      ▭ Select region…
                    </button>
                    <button
                      type="button"
                      style={menuBtn}
                      onClick={() => {
                        setVisionMenuOpen(false);
                        fileRef.current?.click();
                      }}
                    >
                      🖼 Attach image…
                    </button>
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    const buf = await file.arrayBuffer();
                    const png = await convertToPngBase64(buf, file.type);
                    onVisionImage?.(value.trim(), png);
                    setValue("");
                  }}
                />
              </div>
            )}
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

const menuBtn: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  background: "transparent",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
};

/// Re-encode an arbitrary uploaded image (jpeg/webp/etc.) to PNG base64.
/// Keeps the backend pipeline simple — vision_with_image expects PNG bytes.
async function convertToPngBase64(
  buf: ArrayBuffer,
  mime: string,
): Promise<string> {
  const blob = new Blob([buf], { type: mime || "image/png" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("image decode failed"));
      i.src = url;
    });
    // Cap at 1600px wide to keep base64 payloads small.
    const maxW = 1600;
    const scale = img.width > maxW ? maxW / img.width : 1;
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/png");
    return dataUrl.replace(/^data:image\/png;base64,/, "");
  } finally {
    URL.revokeObjectURL(url);
  }
}
