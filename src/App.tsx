import { useEffect, useState } from "react";
import AvatarStage from "./components/AvatarStage";
import ChatBubble from "./components/ChatBubble";
import InputField from "./components/InputField";
import { listen } from "@tauri-apps/api/event";

export default function App() {
  const [inputOpen, setInputOpen] = useState(false);
  const [bubbleText, setBubbleText] = useState<string | null>(null);

  useEffect(() => {
    const unlistenPromise = listen<string>("hotkey:toggle-input", () => {
      setInputOpen((v) => !v);
    });
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  return (
    <>
      <AvatarStage />
      <ChatBubble text={bubbleText} />
      <InputField
        open={inputOpen}
        onClose={() => setInputOpen(false)}
        onSubmit={(text) => {
          setBubbleText(text);
          setInputOpen(false);
        }}
      />
    </>
  );
}
