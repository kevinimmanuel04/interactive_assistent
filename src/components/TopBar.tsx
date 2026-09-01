import { getCurrentWindow } from "@tauri-apps/api/window";
import { CloseIcon, GearIcon } from "./icons";

export interface TopBarProps {
  onToggleSettings: () => void;
  onQuit: () => void;
  onToggleDrawer?: () => void;
}

/**
 * Clean Top-Right Control Bar: Chat History, Settings, Minimize, Close.
 */
export function TopBar(props: TopBarProps) {
  return (
    <div
      className="interactive"
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        display: "flex",
        gap: 6,
        alignItems: "center",
        fontSize: 11,
        color: "#fff",
        zIndex: 50,
      }}
    >
      {props.onToggleDrawer && (
        <button
          onClick={props.onToggleDrawer}
          style={iconBtn}
          title="Chat History"
          aria-label="Chat History"
        >
          <span style={{ fontSize: 13, lineHeight: 1 }}>💬</span>
        </button>
      )}

      <button
        onClick={props.onToggleSettings}
        style={iconBtn}
        title="Settings"
        aria-label="Settings"
      >
        <GearIcon size={13} />
      </button>

      <button
        onClick={() => {
          void getCurrentWindow().minimize();
        }}
        style={iconBtn}
        title="Minimize"
        aria-label="Minimize"
      >
        <span style={{ fontSize: 14, fontWeight: "bold", lineHeight: 1 }}>−</span>
      </button>

      <button
        onClick={props.onQuit}
        style={iconBtn}
        title="Quit Application"
        aria-label="Quit Application"
      >
        <CloseIcon size={13} />
      </button>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(20,20,28,0.7)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  position: "relative",
  padding: 0,
};
