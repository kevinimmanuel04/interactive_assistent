import { useState } from "react";
import {
  getElevenLabsKey,
  getElevenLabsVoiceId,
  setElevenLabsKey,
  setElevenLabsVoiceId,
  synthesizeElevenLabs,
} from "../../../../services/elevenlabs";
import { lipSync } from "../../../../lipsync";
import { cardTitleStyle, subCardStyle } from "../../styles";
import { toast } from "../../../Toast";

const POPULAR_VOICES = [
  { num: "01", name: "Playful & Energetic", label: "PLAYFUL & ENERGETIC", id: "cgSgspJ2msm6clMCkdW9" },
  { num: "02", name: "Seductive & Alluring", label: "SEDUCTIVE & ALLURING", id: "tQ4MEZFJOzsahSEEZtHK" },
  { num: "03", name: "Warm & Friendly", label: "WARM & FRIENDLY", id: "FGY2WhTYpPnrIDTdsKH5" },
  { num: "04", name: "Young & Emotional", label: "YOUNG & EMOTIONAL", id: "k9KXsQFJqzAoomTCOrJB" },
  { num: "05", name: "Soft & Whispery", label: "SOFT & WHISPERY", id: "i7vPmJ2yNcoEVAdpHcQa" },
  { num: "06", name: "Calm & Gentle", label: "CALM & GENTLE", id: "VUGQSU6BSEjkbudnJbOj" },
  { num: "07", name: "Bold & Expressive", label: "BOLD & EXPRESSIVE", id: "m7GHBtY0UEqljrKQw2JH" },
];

export default function ElevenLabsVoiceSection() {
  const [apiKey, setApiKey] = useState(getElevenLabsKey);
  const [voiceId, setVoiceId] = useState(getElevenLabsVoiceId);
  const [testing, setTesting] = useState(false);

  // Active voice index (0 to 6)
  const initialIdx = POPULAR_VOICES.findIndex((v) => v.id === voiceId);
  const activeVoiceIdx = initialIdx !== -1 ? initialIdx : 0;
  const [wheelDiskAngle, setWheelDiskAngle] = useState(activeVoiceIdx * -30);

  const handleSaveKey = () => {
    setElevenLabsKey(apiKey);
    toast.success("ElevenLabs API key updated!");
  };

  const handleSelectVoiceByIndex = (newIdx: number) => {
    let diff = newIdx - activeVoiceIdx;
    if (diff > 3) diff -= 7;
    if (diff < -3) diff += 7;
    setWheelDiskAngle((prev) => prev - diff * 30);
    const targetVoice = POPULAR_VOICES[newIdx];
    setVoiceId(targetVoice.id);
    setElevenLabsVoiceId(targetVoice.id);
    toast.success(`Switched to ${targetVoice.name}!`);
  };

  const handleSaveVoiceId = (newId: string) => {
    const targetIdx = POPULAR_VOICES.findIndex((v) => v.id === newId);
    if (targetIdx !== -1) {
      handleSelectVoiceByIndex(targetIdx);
    } else {
      setVoiceId(newId);
      setElevenLabsVoiceId(newId);
      toast.success("April Voice Profile updated!");
    }
  };

  const handleTestVoice = async () => {
    setTesting(true);
    try {
      setElevenLabsKey(apiKey);
      setElevenLabsVoiceId(voiceId);
      const bytes = await synthesizeElevenLabs("Hello! This is April speaking with my custom voice profile.", voiceId, apiKey);
      await lipSync.playBytes(bytes, "audio/mp3");
      toast.success("Playing voice test!");
    } catch (err) {
      toast.error(`Voice test failed: ${String(err)}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <div style={cardTitleStyle}>
        <span>🗣️ Voice & Personality Engine</span>
      </div>

      <div style={{ ...subCardStyle, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* 3D Wheel Voice & Personality Selector */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <label style={{ fontSize: 12, fontWeight: 600, width: "100%", marginBottom: 4 }}>
            Voice & Personality Profile Wheel:
          </label>

          <div className="wheel-selector">
            <span className="hint-pop">CLICK BOX OR SCROLL TO ROTATE</span>
            <div
              className="radio-input"
              onClick={() => {
                const nextIdx = (activeVoiceIdx + 1) % POPULAR_VOICES.length;
                handleSelectVoiceByIndex(nextIdx);
              }}
              onWheel={(e) => {
                e.preventDefault();
                if (e.deltaY > 0) {
                  const nextIdx = (activeVoiceIdx + 1) % POPULAR_VOICES.length;
                  handleSelectVoiceByIndex(nextIdx);
                } else if (e.deltaY < 0) {
                  const prevIdx = (activeVoiceIdx - 1 + POPULAR_VOICES.length) % POPULAR_VOICES.length;
                  handleSelectVoiceByIndex(prevIdx);
                }
              }}
            >
              <div className="glass-overlay" />

              {/* Rotating Conic Wheel Disk */}
              <div
                className="wheel-disk"
                style={{
                  transform: `rotate(${wheelDiskAngle}deg)`,
                }}
              />

              {/* 7 Orbiting Voice Labels */}
              {POPULAR_VOICES.map((v, idx) => {
                let diff = idx - activeVoiceIdx;
                if (diff > 3) diff -= 7;
                if (diff < -3) diff += 7;
                const angle = diff * 30;
                const isActive = diff === 0;

                return (
                  <div
                    key={v.id}
                    className={`wheel-label ${isActive ? "wheel-label--active" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectVoiceByIndex(idx);
                    }}
                    style={{
                      transform: `rotate(${angle}deg) ${isActive ? "translateX(6px)" : ""}`,
                      opacity: isActive ? 1 : 0.22,
                      filter: isActive ? "blur(0px)" : "blur(1.5px)",
                      zIndex: isActive ? 50 : 20,
                    }}
                  >
                    <span className="num">{v.num} • APRIL VOICE</span>
                    <span
                      className="label"
                      style={{
                        color: isActive ? "#ffffff" : "rgba(255,255,255,0.6)",
                      }}
                    >
                      {v.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* API Key & Custom Voice Controls */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
            ElevenLabs Secret API Key (starts with sk_):
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="textInputWrapper" style={{ flex: 1 }}>
              <input
                type="password"
                className="textInput"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk_..."
              />
            </div>
            <button
              onClick={handleSaveKey}
              className="send-button"
              style={{ padding: "5px 12px", fontSize: 12 }}
            >
              <div className="svg-wrapper-1">
                <div className="svg-wrapper">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={14} height={14}>
                    <path fill="none" d="M0 0h24v24H0z" />
                    <path fill="currentColor" d="M1.946 9.315c-.522-.174-.527-.455.01-.634l19.087-6.362c.529-.176.832.12.684.638l-5.454 19.086c-.15.529-.455.547-.679.045L12 14l6-8-8 6-8.054-2.685z" />
                  </svg>
                </div>
              </div>
              <span>Save Key</span>
            </button>
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
            Custom Voice ID (Optional):
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <div className="textInputWrapper" style={{ flex: 1 }}>
              <input
                type="text"
                className="textInput"
                value={voiceId}
                onChange={(e) => handleSaveVoiceId(e.target.value)}
                placeholder="Enter ElevenLabs Voice ID (e.g. Kw9HMUes82uSa2hlywjI)"
              />
            </div>
            <button
              onClick={handleTestVoice}
              disabled={testing}
              className="send-button"
              style={{ padding: "5px 12px", fontSize: 12 }}
            >
              <div className="svg-wrapper-1">
                <div className="svg-wrapper">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={14} height={14}>
                    <path fill="none" d="M0 0h24v24H0z" />
                    <path fill="currentColor" d="M1.946 9.315c-.522-.174-.527-.455.01-.634l19.087-6.362c.529-.176.832.12.684.638l-5.454 19.086c-.15.529-.455.547-.679.045L12 14l6-8-8 6-8.054-2.685z" />
                  </svg>
                </div>
              </div>
              <span>{testing ? "Testing..." : "Test Voice"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
