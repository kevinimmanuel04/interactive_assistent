import { AnimatePresence, motion } from "framer-motion";

interface Props {
  text: string | null;
  route?: "local" | "cloud" | "skill" | null;
  thinking?: boolean;
}

export default function ChatBubble({ text, route, thinking }: Props) {
  const show = !!text || !!thinking;
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
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            maxWidth: 360,
            padding: "10px 14px",
            borderRadius: 14,
            background: "rgba(20, 20, 28, 0.78)",
            color: "#fff",
            fontSize: 14,
            lineHeight: 1.4,
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            boxShadow: "0 6px 24px rgba(0,0,0,0.3)",
            whiteSpace: "pre-wrap",
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
          {thinking && !text ? <span style={{ opacity: 0.7 }}>…</span> : text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
