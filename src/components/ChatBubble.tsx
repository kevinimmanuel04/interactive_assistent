import { AnimatePresence, motion } from "framer-motion";

interface Props {
  text: string | null;
  route?: "local" | "cloud" | "skill" | null;
  thinking?: boolean;
  userEcho?: string | null;
}

// Minimal markdown renderer: triple-backtick fenced code blocks (with
// optional language), inline `code`, and **bold**. Anything else passes
// through as plain text with whitespace preserved.
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
  // Tokenize on inline backticks and **bold**.
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

export default function ChatBubble({ text, route, thinking, userEcho }: Props) {
  const show = !!text || !!thinking || !!userEcho;
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="bubble"
          className="interactive"
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          style={{
            position: "absolute",
            top: 44,
            left: 12,
            right: 12,
            zIndex: 10,
            padding: "10px 14px",
            borderRadius: 14,
            background: "rgba(20, 20, 28, 0.88)",
            color: "#fff",
            fontSize: 14,
            lineHeight: 1.4,
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
            border: "1px solid rgba(255,255,255,0.1)",
            whiteSpace: "pre-wrap",
            maxHeight: "45vh",
            overflowY: "auto",
          }}
        >
          {route && (
            <div
              style={{
                fontSize: 10,
                opacity: 0.65,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              {route}
            </div>
          )}
          {userEcho && (
            <div
              style={{
                fontSize: 12,
                opacity: 0.85,
                padding: "4px 8px",
                borderRadius: 8,
                background: "rgba(179,157,219,0.18)",
                border: "1px solid rgba(179,157,219,0.3)",
                marginBottom: text || thinking ? 8 : 0,
              }}
            >
              <span style={{ opacity: 0.6, marginRight: 4 }}>You:</span>
              {userEcho}
            </div>
          )}
          {thinking && !text ? (
            <span style={{ opacity: 0.7 }}>…</span>
          ) : text ? (
            <div>{renderMarkdown(text)}</div>
          ) : null}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
