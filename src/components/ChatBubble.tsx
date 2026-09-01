import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, type JSX } from "react";
import { t, useLocale } from "../i18n";
import EnergyOrb from "./EnergyOrb";
import { ThumbDownIcon, ThumbUpIcon } from "./icons";
import { getActiveCharacter } from "../utils/characters";

const imgButtonStyle: React.CSSProperties = {
  fontSize: 11,
  padding: "3px 10px",
  borderRadius: 6,
  background: "rgba(20,20,28,0.7)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.12)",
  cursor: "pointer",
};

const feedbackBtn: React.CSSProperties = {
  width: 26,
  height: 24,
  padding: 0,
  borderRadius: 6,
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.12)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

interface Props {
  text: string | null;
  route?: "local" | "cloud" | "skill" | null;
  thinking?: boolean;
  userEcho?: string | null;
  imageBase64?: string | null;
  imageSavePath?: string | null;
  imageStatus?: "generating" | "done" | "error" | null;
  imageError?: string | null;
  onSaveImage?: () => void;
  onCopyImage?: () => void;
  onCancelImage?: () => void;
  onFeedback?: (rating: 1 | -1) => void;
  feedbackKey?: string | number | null;
}

function renderMarkdown(src: string): JSX.Element[] {
  const out: JSX.Element[] = [];
  const fence = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(src)) !== null) {
    if (m.index > lastIndex) {
      out.push(
        <span key={key++}>{renderInline(src.slice(lastIndex, m.index), key)}</span>
      );
      key += 100;
    }
    const lang = m[1] || "";
    const code = m[2].replace(/\n+$/, "");
    out.push(
      <pre
        key={key++}
        style={{
          margin: "6px 0",
          padding: "8px 10px",
          borderRadius: 8,
          background: "rgba(0,0,0,0.45)",
          border: "1px solid rgba(255,255,255,0.08)",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: 12,
          lineHeight: 1.45,
          overflowX: "auto",
          whiteSpace: "pre",
        }}
      >
        {lang && (
          <div
            style={{
              fontSize: 9,
              opacity: 0.55,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            {lang}
          </div>
        )}
        <code>{code}</code>
      </pre>
    );
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < src.length) {
    out.push(<span key={key++}>{renderInline(src.slice(lastIndex), key)}</span>);
  }
  return out;
}

function renderInline(src: string, baseKey: number): JSX.Element[] {
  const out: JSX.Element[] = [];
  const re = /`([^`\n]+)`|\*\*([^*\n]+)\*\*/g;
  let last = 0;
  let k = baseKey;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) {
      out.push(<span key={k++}>{src.slice(last, m.index)}</span>);
    }
    if (m[1] !== undefined) {
      out.push(
        <code
          key={k++}
          style={{
            padding: "1px 5px",
            borderRadius: 4,
            background: "rgba(0,0,0,0.4)",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: 12.5,
          }}
        >
          {m[1]}
        </code>
      );
    } else if (m[2] !== undefined) {
      out.push(
        <strong key={k++}>{m[2]}</strong>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push(<span key={k++}>{src.slice(last)}</span>);
  return out;
}

export default function ChatBubble({
  text,
  route: _route,
  thinking,
  userEcho,
  imageBase64,
  imageSavePath,
  imageStatus,
  imageError,
  onSaveImage,
  onCopyImage,
  onCancelImage,
  onFeedback,
  feedbackKey,
}: Props) {
  useLocale();
  const [rated, setRated] = useState<1 | -1 | null>(null);
  const [charName, setCharName] = useState(() => getActiveCharacter().name);

  useEffect(() => {
    const handleCharChange = () => setCharName(getActiveCharacter().name);
    window.addEventListener("april-character-changed", handleCharChange);
    return () => window.removeEventListener("april-character-changed", handleCharChange);
  }, []);

  useEffect(() => {
    setRated(null);
  }, [feedbackKey]);
  const handleRate = (r: 1 | -1) => {
    if (rated || !onFeedback) return;
    setRated(r);
    try {
      onFeedback(r);
    } catch {}
  };

  const showFeedback = false;
  const show =
    !!text ||
    !!thinking ||
    !!userEcho ||
    !!imageBase64 ||
    imageStatus === "generating" ||
    imageStatus === "error";
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text, userEcho, thinking]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="bubble"
          ref={scrollRef}
          className="interactive"
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          style={{
            position: "absolute",
            bottom: 82,
            left: 12,
            right: 12,
            zIndex: 10,
            padding: "12px 16px",
            borderRadius: 14,
            background: "rgba(18, 18, 26, 0.94)",
            color: "#fff",
            fontSize: 13.5,
            lineHeight: 1.4,
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
            border: "1px solid rgba(255,255,255,0.12)",
            whiteSpace: "pre-wrap",
            maxHeight: 140,
            overflowY: "auto",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {/* EXACTLY ONE Smooth Morphing Energy Orb (Icon when thinking/typing -> Ambient Glow when talking) */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              overflow: "hidden",
              pointerEvents: "none",
              borderRadius: 14,
              zIndex: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <EnergyOrb size={28} mode={text ? "background" : "icon"} />
          </div>

          <div style={{ position: "relative", zIndex: 1 }}>
            {userEcho && (
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: "#e0e7ff",
                  opacity: 0.95,
                  padding: "4px 8px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.06)",
                  marginBottom: text || thinking ? 6 : 0,
                }}
              >
                {userEcho}
              </div>
            )}

            {thinking && !text ? (
              <div style={{ padding: "4px 0" }}>
                <span style={{ opacity: 0.9, fontSize: 13, fontWeight: 600, color: "#c4b5fd" }}>
                  {charName} is thinking...
                </span>
              </div>
            ) : text ? (
              <div>{renderMarkdown(text)}</div>
            ) : null}
          </div>

          {showFeedback && (
            <div
              style={{
                display: "flex",
                gap: 6,
                marginTop: 8,
                alignItems: "center",
              }}
            >
              <button
                type="button"
                onClick={() => handleRate(1)}
                disabled={!!rated}
                title={t("bubble.feedback.up")}
                aria-label={t("bubble.feedback.up")}
                style={{
                  ...feedbackBtn,
                  background:
                    rated === 1
                      ? "rgba(120,200,140,0.22)"
                      : "rgba(255,255,255,0.05)",
                  borderColor:
                    rated === 1
                      ? "rgba(160,220,170,0.45)"
                      : "rgba(255,255,255,0.12)",
                  cursor: rated ? "default" : "pointer",
                  opacity: rated && rated !== 1 ? 0.4 : 1,
                }}
              >
                <ThumbUpIcon size={13} />
              </button>
              <button
                type="button"
                onClick={() => handleRate(-1)}
                disabled={!!rated}
                title={t("bubble.feedback.down")}
                aria-label={t("bubble.feedback.down")}
                style={{
                  ...feedbackBtn,
                  background:
                    rated === -1
                      ? "rgba(220,140,140,0.22)"
                      : "rgba(255,255,255,0.05)",
                  borderColor:
                    rated === -1
                      ? "rgba(240,170,170,0.45)"
                      : "rgba(255,255,255,0.12)",
                  cursor: rated ? "default" : "pointer",
                  opacity: rated && rated !== -1 ? 0.4 : 1,
                }}
              >
                <ThumbDownIcon size={13} />
              </button>
              {rated && (
                <span style={{ fontSize: 11, opacity: 0.6 }}>
                  {t("bubble.feedback.thanks")}
                </span>
              )}
            </div>
          )}

          {imageStatus === "generating" && !imageBase64 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: text ? 8 : 0 }}>
              <span style={{ opacity: 0.75 }}>{t("bubble.image.generating")}</span>
              {onCancelImage && (
                <button
                  onClick={onCancelImage}
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 6,
                    background: "rgba(255,255,255,0.08)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.18)",
                    cursor: "pointer",
                  }}
                >
                  {t("bubble.image.cancel")}
                </button>
              )}
            </div>
          )}

          {imageStatus === "error" && imageError && (
            <div style={{ marginTop: 6, color: "#ff8080", fontSize: 12 }}>
              {t("bubble.image.error")} {imageError}
            </div>
          )}

          {imageBase64 && (
            <div style={{ marginTop: text || userEcho ? 8 : 0 }}>
              <img
                src={`data:image/png;base64,${imageBase64}`}
                alt="generated"
                style={{
                  maxWidth: "100%",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.12)",
                  display: "block",
                }}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                {onSaveImage && (
                  <button onClick={onSaveImage} style={imgButtonStyle}>
                    {t("bubble.image.save_as")}
                  </button>
                )}
                {onCopyImage && (
                  <button onClick={onCopyImage} style={imgButtonStyle}>
                    {t("bubble.image.copy")}
                  </button>
                )}
                {imageSavePath && (
                  <span style={{ fontSize: 10, opacity: 0.55, alignSelf: "center" }}>
                    {t("bubble.image.saved")} {imageSavePath}
                  </span>
                )}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
