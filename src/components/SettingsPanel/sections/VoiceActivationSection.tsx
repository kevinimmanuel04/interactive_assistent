import { useEffect, useState } from "react";
import { getAutoWakeWordEnabled, setAutoWakeWordEnabled } from "../../../services/elevenlabs";
import ToggleSwitch from "../lib/ToggleSwitch";
import { toast } from "../../Toast";
import { cardTitleStyle, subCardStyle } from "../styles";
import { getActiveCharacter } from "../../../utils/characters";

export default function VoiceActivationSection() {
  const [autoWakeWord, setAutoWakeWord] = useState(getAutoWakeWordEnabled);
  const [charName, setCharName] = useState(() => getActiveCharacter().name);

  useEffect(() => {
    const handleCharChange = () => setCharName(getActiveCharacter().name);
    window.addEventListener("april-character-changed", handleCharChange);
    return () => window.removeEventListener("april-character-changed", handleCharChange);
  }, []);

  const handleToggleWakeWord = (enabled: boolean) => {
    setAutoWakeWord(enabled);
    setAutoWakeWordEnabled(enabled);
    toast.success(enabled ? "24/7 Voice Activation Enabled!" : "24/7 Voice Activation Disabled!");
  };

  return (
    <div>
      <div style={cardTitleStyle}>
        <span>🎙️ 24/7 Hands-Free Voice Activation</span>
      </div>

      <div style={{ ...subCardStyle, display: "flex", flexDirection: "column", gap: 10 }}>
        <ToggleSwitch
          checked={autoWakeWord}
          onChange={handleToggleWakeWord}
          label={`24/7 Hands-Free 'Hey ${charName}' Voice Activation`}
          sublabel={`Continuously listen in Desktop Widget mode for 'Hey ${charName}' and speak replies automatically.`}
        />
      </div>
    </div>
  );
}
