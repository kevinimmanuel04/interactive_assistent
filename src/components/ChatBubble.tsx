import { AnimatePresence, motion } from "framer-motion";

interface Props {
  text: string | null;
  route?: "local" | "cloud" | "skill" | null;
  thinking?: boolean;
  userEcho?: string | null;
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
          {thinking && !text ? <span style={{ opacity: 0.7 }}>…</span> : text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
