// Game coach: an experimental feature that injects an additional turn
// from a vision-capable model when the user is playing a game (detected
// elsewhere). Disabled by default — only activates when an OpenRouter
// key is configured.

import { type PublicSettings } from "../../../api";
import { useLocale } from "../../../i18n";

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export default function GameCoachSection(_props: Props) {
  useLocale();

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ opacity: 0.9, fontWeight: 600, fontSize: 13, marginBottom: 6, color: "#c4b5fd" }}>
        💻 PC Desktop Automation & System Commands
      </div>
      <div
        style={{
          padding: 10,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8,
        }}
      >
        <div style={{ fontSize: 12, color: "#fff", marginBottom: 6 }}>
          April can execute PC commands (launch apps, open browser search, control active windows, and inspect system processes).
        </div>
        <div style={{ color: "#a78bfa", fontSize: 11.5, marginBottom: 8, background: "rgba(124,77,255,0.1)", padding: 6, borderRadius: 6 }}>
          ⚡ <strong>User Control Override:</strong> You can override keyboard and mouse control anytime by moving your cursor or typing.
        </div>
      </div>
    </div>
  );
}
