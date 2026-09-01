import ReactDOM from "react-dom/client";
import ChatPage from "./pages/ChatPage";
import "./pages/chat-styles.css";
import { initGlobalTooltips } from "./utils/tooltipManager";

initGlobalTooltips();

ReactDOM.createRoot(document.getElementById("root")!).render(<ChatPage />);
