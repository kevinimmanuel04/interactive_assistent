import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
}

export default function InputField({ open, onClose, onSubmit }: Props) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue("");
      queueMicrotask(() => ref.current?.focus());
    }
  }, [open]);

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
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            width: 340,
            padding: "8px 10px",
            borderRadius: 12,
            background: "rgba(20, 20, 28, 0.82)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
          }}
        >
          <input
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
            placeholder="Ask anything…"
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#fff",
              fontSize: 14,
              padding: "6px 6px",
            }}
          />
        </motion.form>
      )}
    </AnimatePresence>
  );
}
