import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// NOTE: React.StrictMode is intentionally OFF. In dev it double-mounts effects,
// which double-subscribes to Tauri's `tts:play` event and caused overlapping
// audio playback ("flanger/echo/unintelligible" TTS).
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

