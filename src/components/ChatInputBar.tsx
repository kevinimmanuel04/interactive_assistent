import { useRef, useEffect, useState } from "react";
import { getActiveCharacter } from "../utils/characters";

export interface AttachedFile {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  base64: string;
  isImage: boolean;
  textContent?: string;
}

interface ChatInputBarProps {
  input: string;
  setInput: (val: string) => void;
  onSend: (attachedFile?: AttachedFile | null) => void;
  isListening: boolean;
  onToggleListening: () => void;
  isStreaming?: boolean;
  attachedFile?: AttachedFile | null;
  setAttachedFile?: (file: AttachedFile | null) => void;
}

export default function ChatInputBar({
  input,
  setInput,
  onSend,
  isListening,
  onToggleListening,
  isStreaming,
  attachedFile,
  setAttachedFile,
}: ChatInputBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [charName, setCharName] = useState(() => getActiveCharacter().name);

  useEffect(() => {
    const handleCharChange = () => setCharName(getActiveCharacter().name);
    window.addEventListener("april-character-changed", handleCharChange);
    return () => window.removeEventListener("april-character-changed", handleCharChange);
  }, []);

  // Auto-focus input on load
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if ((input.trim() || attachedFile) && !isStreaming) {
        onSend(attachedFile);
      }
    }
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !setAttachedFile) return;

    const isImage = file.type.startsWith("image/");
    const reader = new FileReader();

    if (isImage) {
      reader.onload = (evt) => {
        const dataUrl = evt.target?.result as string;
        const base64 = dataUrl.split(",")[1] || "";
        setAttachedFile({
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl,
          base64,
          isImage: true,
        });
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = (evt) => {
        const textContent = evt.target?.result as string;
        setAttachedFile({
          name: file.name,
          type: file.type || "document",
          size: file.size,
          dataUrl: "",
          base64: "",
          isImage: false,
          textContent,
        });
      };
      reader.readAsText(file);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", maxWidth: 720, margin: "0 auto" }}>
      {/* File Attachment Chip / Preview Badge */}
      {attachedFile && setAttachedFile && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "6px 12px",
            background: "rgba(167, 139, 250, 0.15)",
            border: "1px solid rgba(167, 139, 250, 0.3)",
            borderRadius: 8,
            backdropFilter: "blur(10px)",
            fontSize: 12,
            color: "#fff",
            maxWidth: "100%",
          }}
        >
          {attachedFile.isImage ? (
            <img
              src={attachedFile.dataUrl}
              alt="attachment preview"
              style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover" }}
            />
          ) : (
            <span style={{ fontSize: 16 }}>📄</span>
          )}
          <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <strong>{attachedFile.name}</strong>{" "}
            <span style={{ opacity: 0.6, fontSize: 10.5 }}>
              ({(attachedFile.size / 1024).toFixed(1)} KB)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setAttachedFile(null)}
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "none",
              color: "#fff",
              borderRadius: "50%",
              width: 20,
              height: 20,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
            }}
            title="Remove attachment"
          >
            ✕
          </button>
        </div>
      )}

      <div className={`container-ia-chat ${isListening ? "container-ia-chat--voice-active" : ""}`}>
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*,.pdf,.txt,.md,.js,.ts,.py,.json,.csv,.html,.css,.doc,.docx"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {/* Input Text Field (MUST be first so CSS ~ sibling selectors work on all elements after it) */}
        <input
          ref={inputRef}
          type="text"
          name="input-text"
          id="input-text"
          placeholder={isListening ? "Listening to your voice..." : `Ask ${charName}...`}
          className="input-text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          required
        />

        {/* Upload Files Icons (Gallery & Folder) */}
        <div className="container-upload-files">
          <span title="Upload image / media" onClick={handleFileClick}>
            <svg
              className="upload-file"
              xmlns="http://www.w3.org/2000/svg"
              width={22}
              height={22}
              viewBox="0 0 24 24"
            >
              <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}>
                <rect width={18} height={18} x={3} y={3} rx={2} ry={2} />
                <circle cx={9} cy={9} r={2} />
                <path d="m21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </g>
            </svg>
          </span>

          <span title="Attach documents" onClick={handleFileClick}>
            <svg
              className="upload-file"
              xmlns="http://www.w3.org/2000/svg"
              width={22}
              height={22}
              viewBox="0 0 24 24"
            >
              <path
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="m6 14l1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"
              />
            </svg>
          </span>
        </div>

        {/* Plus / Files Label */}
        <div className="label-files" onClick={handleFileClick} title="Add attachment">
          <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} viewBox="0 0 24 24">
            <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-7-7v14" />
          </svg>
        </div>

        {/* Voice Dictation Button & AI Orb overlay */}
        <div
          className={`label-voice ${isListening ? "label-voice--active" : ""}`}
          onClick={onToggleListening}
          title={isListening ? "Click to stop listening" : "Click for voice dictation"}
        >
          <svg className="icon-voice" xmlns="http://www.w3.org/2000/svg" width={22} height={22} viewBox="0 0 24 24">
            <path fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={2} d="M12 4v16m4-13v10M8 7v10m12-6v2M4 11v2" />
          </svg>
          <div className="ai">
            <div className="container">
              <div className="c c4" />
              <div className="c c1" />
              <div className="c c2" />
              <div className="c c3" />
              <div className="rings" />
            </div>
            <div className="glass" />
          </div>
          <div className="text-voice">
            <p>Voice Dictation Active</p>
            <p>Press to cancel or send</p>
          </div>
        </div>

        {/* Animated Flying Paper Plane Send Button inside extreme right of search bar */}
        <button
          type="button"
          className="send-button label-text"
          onClick={() => {
            if ((input.trim() || attachedFile) && !isStreaming) onSend(attachedFile);
          }}
          disabled={(!input.trim() && !attachedFile) || isStreaming}
          title="Send message"
          style={{ padding: "4px 12px", fontSize: 12, borderRadius: 20 }}
        >
          <div className="svg-wrapper-1">
            <div className="svg-wrapper">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={14} height={14}>
                <path fill="none" d="M0 0h24v24H0z" />
                <path fill="currentColor" d="M1.946 9.315c-.522-.174-.527-.455.01-.634l19.087-6.362c.529-.176.832.12.684.638l-5.454 19.086c-.15.529-.455.547-.679.045L12 14l6-8-8 6-8.054-2.685z" />
              </svg>
            </div>
          </div>
          <span>Send</span>
        </button>
      </div>
    </div>
  );
}
