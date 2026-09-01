import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStore } from "../store/chatStore";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ChatEvent } from "../api/types";
import { saveMessage } from "../services/chatStorage";
import EnergyOrb from "../components/EnergyOrb";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { synthesizeElevenLabs } from "../services/elevenlabs";
import PlayPauseToggle from "../components/PlayPauseToggle";
import ReadAloudButton from "../components/ReadAloudButton";
import VoiceToggle from "../components/VoiceToggle";
import ClearChatButton from "../components/ClearChatButton";
import SidebarSessionActions from "../components/SidebarSessionActions";
import CopyMessageButton from "../components/CopyMessageButton";
import NewChatButton from "../components/NewChatButton";
import ChatInputBar, { type AttachedFile } from "../components/ChatInputBar";
import ImageModal from "../components/ImageModal";
import { checkAndExecuteDirectIntent } from "../utils/intentHandler";
import { getActiveCharacter } from "../utils/characters";

/* ── Markdown-lite renderer with <think> tag stripper ────────────── */
function renderMarkdown(text: string): string {
  // Strip <think>...</think> reasoning blocks if present
  let clean = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  let html = clean
    // markdown images with click inspector listener
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<div class="cp-img-preview" style="cursor:pointer;" onclick="window.__openImageModal && window.__openImageModal(\'$2\', \'$1\')"><img src="$2" alt="$1" style="max-width:100%; max-height:400px; border-radius:12px; margin-top:8px; box-shadow:0 6px 20px rgba(0,0,0,0.5); object-fit:contain;" /><div style="font-size:11px; opacity:0.6; margin-top:4px; text-align:center;">🔍 Click to view full image, download, or edit</div></div>')
    // code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="cp-code"><code>$2</code></pre>')
    // inline code
    .replace(/`([^`]+)`/g, '<code class="cp-inline-code">$1</code>')
    // bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // strip mood tags
    .replace(/<mood:[^>]+>/g, "");

  // paragraphs
  html = html
    .split("\n\n")
    .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");

  return html;
}

/* ── Chat Mode Features Info Cards (Static, Chat-Exclusive Features) ── */
function getFeatureInfoCards(name: string) {
  return [
    {
      colorClass: "cyan",
      icon: "💻",
      title: "Smart AI Coding & Debug",
      desc: `Write, debug, refactor, and explain code in 20+ programming languages with ${name}.`,
    },
    {
      colorClass: "purple",
      icon: "🎨",
      title: "AI Art & Image Generation",
      desc: 'Type "Generate an image of [prompt]" to synthesize high-res digital artwork directly in chat.',
    },
    {
      colorClass: "blue",
      icon: "📎",
      title: "File, PDF & Vision Analysis",
      desc: "Attach images, screenshots, PDFs, code files, and documents for instant multi-modal analysis.",
    },
    {
      colorClass: "green",
      icon: "🔄",
      title: "In-Chat Model Switching",
      desc: 'Type "switch to gemini-3.5-flash", "use claude", or "switch to gpt-4o" to swap AI models on the fly.',
    },
    {
      colorClass: "amber",
      icon: "🔊",
      title: "Voice Read-Aloud (TTS)",
      desc: "Click the speaker icon next to any AI reply to hear it spoken aloud with ElevenLabs realistic voice.",
    },
    {
      colorClass: "rose",
      icon: "🗑️",
      title: "Chat Sessions & Shredder",
      desc: "Pin favorite threads, rename sessions, and use the animated shredder for secure instant chat clearing.",
    },
  ];
}

export default function ChatPage() {
  const {
    sessions,
    activeSessionId,
    getActiveSession,
    switchSession,
    createNewSession,
    deleteSession,
    renameSession,
    togglePinSession,
    clearActiveSessionMessages,
    addMessage,
  } = useChatStore();

  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [autoReadAloud, setAutoReadAloud] = useState(false);

  // File attachment & Image Inspector modal states
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [inspectImage, setInspectImage] = useState<{ url: string; prompt?: string } | null>(null);

  // Audio / ElevenLabs TTS playback state
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [isAudioPaused, setIsAudioPaused] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeIdRef = useRef<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Speech Recognition (Mic) hook
  const {
    isListening,
    transcript,
    startListening,
    stopListening,
  } = useSpeechRecognition();

  // Append mic transcript into input textarea
  useEffect(() => {
    if (transcript) {
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    }
  }, [transcript]);

  const [activeChar, setActiveChar] = useState(() => getActiveCharacter());

  useEffect(() => {
    const handleCharChange = () => setActiveChar(getActiveCharacter());
    window.addEventListener("april-character-changed", handleCharChange);
    window.addEventListener("storage", handleCharChange);
    return () => {
      window.removeEventListener("april-character-changed", handleCharChange);
      window.removeEventListener("storage", handleCharChange);
    };
  }, []);

  const activeSession = getActiveSession();
  const messages = activeSession ? activeSession.messages : [];

  // Focus rename input when editing starts
  useEffect(() => {
    if (editingSessionId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [editingSessionId]);

  const [isShredding, setIsShredding] = useState(false);

  const handleClearWithShredAnimation = () => {
    if (isShredding) return;
    handleStopSpeaking();
    setIsShredding(true);

    setTimeout(() => {
      clearActiveSessionMessages();
      setIsShredding(false);
    }, 1200);
  };

  /* ── Auto-scroll to bottom ──────────────────────────────────── */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  /* ── Stop speaking helper (reliable stop for Audio and SpeechSynthesis) ── */
  const handleStopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMsgId(null);
    setIsAudioPaused(false);
  }, []);

  /* ── Read Aloud via ElevenLabs Voice with full Pause / Resume / Stop ── */
  const handleReadAloud = useCallback(
    async (msgId: string, text: string) => {
      // If currently speaking this message, toggle pause / resume
      if (speakingMsgId === msgId) {
        if (isAudioPaused) {
          // Resume
          if (audioRef.current) {
            audioRef.current.play().catch(() => {});
          } else if ("speechSynthesis" in window) {
            window.speechSynthesis.resume();
          }
          setIsAudioPaused(false);
        } else {
          // Pause
          if (audioRef.current) {
            audioRef.current.pause();
          } else if ("speechSynthesis" in window) {
            window.speechSynthesis.pause();
          }
          setIsAudioPaused(true);
        }
        return;
      }

      // Stop any previous speech
      handleStopSpeaking();

      const cleanText = text
        .replace(/<mood:[^>]+>/g, "")
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/```[\s\S]*?```/g, "")
        .replace(/`([^`]+)`/g, "$1")
        .trim();

      if (!cleanText) return;

      setSpeakingMsgId(msgId);
      setIsAudioPaused(false);

      try {
        // 1. Synthesize audio with ElevenLabs (same model & voice as desktop widget)
        const audioBuffer = await synthesizeElevenLabs(cleanText);
        const blob = new Blob([audioBuffer], { type: "audio/mp3" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          setSpeakingMsgId(null);
          setIsAudioPaused(false);
          URL.revokeObjectURL(url);
        };
        audio.onerror = () => {
          setSpeakingMsgId(null);
          setIsAudioPaused(false);
        };

        await audio.play();
      } catch (err) {
        console.warn("[ElevenLabs Voice] Direct playback failed, falling back to Web Speech:", err);
        if ("speechSynthesis" in window) {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(cleanText);
          utter.onend = () => {
            setSpeakingMsgId(null);
            setIsAudioPaused(false);
          };
          utter.onerror = () => {
            setSpeakingMsgId(null);
            setIsAudioPaused(false);
          };
          window.speechSynthesis.speak(utter);
        } else {
          setSpeakingMsgId(null);
          setIsAudioPaused(false);
        }
      }
    },
    [speakingMsgId, isAudioPaused, handleStopSpeaking]
  );

  /* ── Listen for chat events from Rust backend ───────────────── */
  useEffect(() => {
    const unlisten = listen<ChatEvent>("chat", (evt) => {
      const e = evt.payload;
      if (activeIdRef.current === "pending") activeIdRef.current = e.id;
      if (e.id !== activeIdRef.current) return;

      switch (e.kind) {
        case "started":
          setIsStreaming(true);
          setStreamingText("");
          break;
        case "token":
          setStreamingText((prev) => prev + e.text);
          break;
        case "done": {
          setIsStreaming(false);
          const cleanText = e.full_text
            .replace(/<mood:[^>]+>/g, "")
            .replace(/<tool_call>[\s\S]*?(?:<\/tool_call>|$)/gi, "")
            .replace(/<tool_status>[\s\S]*?(?:<\/tool_status>|$)/gi, "")
            .trim();
          if (cleanText) {
            const saved = saveMessage("assistant", cleanText);
            // Auto read aloud via ElevenLabs if enabled, bound to actual saved message ID
            if (autoReadAloud) {
              void handleReadAloud(saved.id, cleanText);
            }
          }
          setStreamingText("");
          activeIdRef.current = null;
          break;
        }
        case "error":
          setIsStreaming(false);
          addMessage("ai", `⚠ ${e.message}`);
          setStreamingText("");
          activeIdRef.current = null;
          break;
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [addMessage, autoReadAloud, handleReadAloud]);

  /* ── Sync store & settings from widget via disk, storage & Tauri events ── */
  useEffect(() => {
    // Rehydrate persistent chat sessions directly from disk
    void useChatStore.getState().hydrateFromDisk();

    const sync = (e: StorageEvent) => {
      if (e.key === "april-chat-store") {
        useChatStore.persist.rehydrate();
      }
    };
    window.addEventListener("storage", sync);

    const unlisten = listen("elevenlabs_settings_updated", () => {
      console.log("[ChatPage] ElevenLabs settings updated in real time!");
    });

    return () => {
      window.removeEventListener("storage", sync);
      unlisten.then((fn) => fn());
    };
  }, []);

  /* ── Keyboard shortcut: Ctrl+B or Cmd+B to toggle sidebar & Global Image Modal ──── */
  useEffect(() => {
    (window as any).__openImageModal = (src: string, alt: string) => {
      setInspectImage({ url: src, prompt: alt });
    };

    const handleGlobalKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleGlobalKey);
    return () => {
      window.removeEventListener("keydown", handleGlobalKey);
      delete (window as any).__openImageModal;
    };
  }, []);

  const handleSendPrompt = useCallback(
    async (promptToSend?: string, fileToAttach?: AttachedFile | null) => {
      const file = fileToAttach || attachedFile;
      const text = (promptToSend || input).trim();
      if (!text && !file) return;
      if (isStreaming) return;
      if (!promptToSend) setInput("");

      // Stop speech recognition if active
      if (isListening) stopListening();

      // 0. File & Image Upload Analysis (Vision AI or Text/Document Context)
      if (file) {
        setAttachedFile(null);
        if (file.isImage) {
          const userMsg = `![${file.name}](${file.dataUrl})\n\n${text || "Analyze this image for me."}`;
          saveMessage("user", userMsg);
          setIsStreaming(true);
          setStreamingText("👁️ Analyzing uploaded image with Vision AI...");
          activeIdRef.current = "pending";
          try {
            const id = await invoke<string>("vision_with_image", {
              prompt: text || "Describe and analyze this image in detail.",
              pngBase64: file.base64,
            });
            if (activeIdRef.current === "pending") activeIdRef.current = id;
            return;
          } catch (err) {
            activeIdRef.current = null;
            setIsStreaming(false);
            setStreamingText("");
            addMessage("ai", `⚠ Vision analysis error: ${String(err)}`);
            return;
          }
        } else if (file.textContent) {
          const docPrompt = `[Attached File: ${file.name}]\n\`\`\`\n${file.textContent.slice(0, 8000)}\n\`\`\`\n\nUser Question: ${text || "Please analyze and explain this uploaded file."}`;
          saveMessage("user", `📄 **Attached File: ${file.name}**\n\n${text || "Analyze this file."}`);
          setIsStreaming(true);
          setStreamingText("📄 Reading and analyzing uploaded file...");
          activeIdRef.current = "pending";
          try {
            const id = await invoke<string>("send_message", { prompt: docPrompt });
            if (activeIdRef.current === "pending") activeIdRef.current = id;
            return;
          } catch (err) {
            activeIdRef.current = null;
            setIsStreaming(false);
            addMessage("ai", `⚠ ${String(err)}`);
            return;
          }
        }
      }

      // Intercept Direct OS Commands (Open App, Search Browser, Window Controls)
      const handled = await checkAndExecuteDirectIntent(text, {
        setBubbleText: (reply) => {
          if (reply) {
            saveMessage("user", text);
            saveMessage("assistant", reply);
            if (autoReadAloud) void handleReadAloud("cmd", reply);
          }
        },
      });
      if (handled) return;

      const lower = text.toLowerCase();

      // 2. In-Chat Image Generation & Remix Trigger
      const isImageGen =
        lower.startsWith("generate image") ||
        lower.startsWith("generate an image") ||
        lower.startsWith("draw a") ||
        lower.startsWith("create an image") ||
        lower.startsWith("create a picture") ||
        lower.includes("generate an image of") ||
        lower.startsWith("edit this image") ||
        lower.startsWith("modify this image") ||
        lower.startsWith("remix this image") ||
        lower.startsWith("edit the image") ||
        lower.startsWith("modify the image") ||
        lower.includes("edit this image to add") ||
        lower.includes("modify this image to add");

      if (isImageGen) {
        saveMessage("user", text);
        setIsStreaming(true);
        setStreamingText("🎨 Generating / editing image for your prompt...");

        try {
          // Clean prompt for image generator
          let cleanPrompt = text
            .replace(/^(edit this image to add:|edit this image to:|edit this image:|modify this image to add:|modify this image:|remix this image:|generate an image of:?|generate image of:?|generate image:?|draw a|create an image of:?|create a picture of:?)/i, "")
            .trim() || text;

          // If this is an edit/remix prompt, check for previous image prompt in session:
          if (
            lower.includes("edit this image") ||
            lower.includes("modify this image") ||
            lower.includes("remix this image") ||
            lower.includes("edit the image")
          ) {
            const lastImgMsg = [...messages].reverse().find(
              (m) => m.role === "assistant" && m.content?.includes("![")
            );
            if (lastImgMsg && lastImgMsg.content) {
              const match = lastImgMsg.content.match(/!\[(.*?)\]/);
              if (match && match[1]) {
                const prevSubject = match[1].trim();
                if (!cleanPrompt.toLowerCase().includes(prevSubject.toLowerCase())) {
                  cleanPrompt = `${prevSubject}, ${cleanPrompt}`;
                }
              }
            }
          }

          // High-res Image URL via Pollinations AI / OpenRouter
          const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 1000000)}`;

          try {
            void invoke<string>("generate_image", { prompt: cleanPrompt, width: 1024, height: 1024 });
          } catch {
            console.log("[ImageGen] Using Pollinations fallback stream for inline rendering.");
          }

          setIsStreaming(false);
          setStreamingText("");
          const imgMarkdown = `Here is your generated image:\n\n![${cleanPrompt}](${imageUrl})`;
          saveMessage("assistant", imgMarkdown);
          if (autoReadAloud) void handleReadAloud("imgGen", `Here is your image of ${cleanPrompt}`);
          return;
        } catch (err) {
          setIsStreaming(false);
          setStreamingText("");
          addMessage("ai", `⚠ Image generation error: ${String(err)}`);
          return;
        }
      }

      // 3. Screen Vision Capture Trigger
      const normText = text.toLowerCase();
      if (
        normText.includes("what is on my screen") ||
        normText.includes("look at my screen") ||
        normText.includes("read my screen") ||
        normText.includes("see my screen") ||
        normText.includes("what am i looking at") ||
        normText.includes("what's on my screen") ||
        normText.includes("screen vision")
      ) {
        saveMessage("user", text);
        setIsStreaming(true);
        setStreamingText("👁️ Capturing desktop screen & analyzing...");
        try {
          const id = await invoke<string>("vision_capture_full", { prompt: text });
          if (activeIdRef.current === "pending") activeIdRef.current = id;
          return;
        } catch (err) {
          setIsStreaming(false);
          setStreamingText("");
          addMessage("ai", `⚠ Vision analysis error: ${String(err)}`);
          return;
        }
      }

      // 4. Save user message & call Chat Engine
      saveMessage("user", text);
      activeIdRef.current = "pending";

      try {
        const id = await invoke<string>("send_message", { prompt: text });
        if (activeIdRef.current === "pending") activeIdRef.current = id;
      } catch (err) {
        activeIdRef.current = null;
        setIsStreaming(false);
        addMessage("ai", `⚠ ${String(err)}`);
      }
    },
    [input, isStreaming, isListening, stopListening, saveMessage, addMessage, autoReadAloud, handleReadAloud]
  );



  /* ── Auto-resize textarea cleanly without showing scrollbars ── */
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const newHeight = Math.min(textareaRef.current.scrollHeight, 160);
      textareaRef.current.style.height = `${Math.max(newHeight, 36)}px`;
    }
  }, [input]);

  /* ── Close chat window (back to widget) ─────────────────────── */
  const handleClose = async () => {
    try {
      const win = getCurrentWindow();
      await win.close();
    } catch {
      window.close();
    }
  };

  /* ── Session management ─────────────────────────────────────── */
  const handleNewChat = () => {
    handleStopSpeaking();
    createNewSession();
  };

  const handleStartRename = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(id);
    setEditingTitle(currentTitle);
  };

  const handleSaveRename = (id: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (editingTitle.trim()) {
      renameSession(id, editingTitle.trim());
    }
    setEditingSessionId(null);
  };

  const handleCancelRename = () => {
    setEditingSessionId(null);
  };

  const handleTogglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    togglePinSession(id);
  };

  // Filter history: Only show conversations that actually have messages!
  // Empty draft sessions do NOT show up in the history until you send a message!
  const historySessions = [...sessions]
    .filter((s) => s.messages && s.messages.length > 0)
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.createdAt - a.createdAt;
    });

  /* ── Copy message text ──────────────────────────────────────── */
  const handleCopyText = (msgId: string, text: string) => {
    const cleanText = text.replace(/<mood:[^>]+>/g, "").trim();
    navigator.clipboard.writeText(cleanText);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  return (
    <div className="cp-root">
      {/* ── Collapsible Sidebar ─────────────────────────────── */}
      <aside className={`cp-sidebar ${sidebarOpen ? "" : "cp-sidebar--hidden"}`}>
        <div className="cp-sidebar-inner">
          <div className="cp-sidebar-header">
            {/* Animated Laser Border & Rotating Plus New Chat Button */}
            <NewChatButton onClick={handleNewChat} />
          </div>

          {/* Sessions list */}
          <div className="cp-session-list">
            {historySessions.length === 0 ? (
              <div className="cp-no-sessions-hint">
                <span style={{ fontSize: 20 }}>💬</span>
                <p style={{ margin: "6px 0 2px 0", fontWeight: 600, fontSize: 12.5, color: "#999" }}>
                  No chat history yet
                </p>
                <span style={{ fontSize: 11, color: "#666" }}>
                  Start chatting to save conversations
                </span>
              </div>
            ) : (
              historySessions.map((s) => {
                const isEditing = editingSessionId === s.id;
                const isActive = s.id === activeSessionId;

                return (
                  <div
                    key={s.id}
                    className={`cp-session-item ${isActive ? "cp-session-item--active" : ""} ${s.pinned ? "cp-session-item--pinned" : ""}`}
                    onClick={() => {
                      if (!isEditing) {
                        handleStopSpeaking();
                        switchSession(s.id);
                      }
                    }}
                  >
                    {isEditing ? (
                      <form
                        className="cp-rename-form"
                        onSubmit={(e) => handleSaveRename(s.id, e)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          ref={renameInputRef}
                          type="text"
                          className="cp-rename-input"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") handleCancelRename();
                          }}
                          onBlur={() => handleSaveRename(s.id)}
                        />
                        <button type="submit" className="cp-rename-btn cp-rename-btn--save" title="Save">
                          ✓
                        </button>
                        <button
                          type="button"
                          className="cp-rename-btn cp-rename-btn--cancel"
                          onClick={handleCancelRename}
                          title="Cancel"
                        >
                          ✕
                        </button>
                      </form>
                    ) : (
                      <>
                        <div className="cp-session-left">
                          {s.pinned ? (
                            <span className="cp-pin-badge" title="Pinned chat">📌</span>
                          ) : (
                            <svg className="cp-chat-icon" width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                          <span className="cp-session-title" title={s.title}>{s.title}</span>
                        </div>

                        {/* Animated Expandable Action Card (Pin, Rename, Delete) */}
                        <SidebarSessionActions
                          isPinned={!!s.pinned}
                          canDelete={true}
                          onTogglePin={(e) => handleTogglePin(s.id, e)}
                          onStartRename={(e) => handleStartRename(s.id, s.title, e)}
                          onDeleteSession={(e) => {
                            e.stopPropagation();
                            deleteSession(s.id);
                          }}
                        />
                      </>
                    )}
                </div>
              );
            })
          )}
        </div>

          {/* Sidebar Footer */}
          <div className="cp-sidebar-footer">
            <div className="cp-footer-brand">
              <img
                src="/app-icon.png"
                alt="App Logo"
                style={{ width: 20, height: 20, borderRadius: 6, objectFit: "cover" }}
              />
              <span className="cp-brand-name">{activeChar.name} AI</span>
            </div>
            <button className="cp-return-btn" onClick={handleClose} title="Return to Desktop Widget">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Widget</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Chat Area ──────────────────────────────────── */}
      <main className="cp-main">
        {/* Top Header Bar */}
        <header className="cp-topbar">
          <div className="cp-topbar-left">
            {/* The single permanent sidebar toggle icon button */}
            <button
              className={`cp-icon-btn cp-sidebar-toggle-btn ${!sidebarOpen ? "cp-sidebar-toggle-btn--closed" : ""}`}
              onClick={() => setSidebarOpen((v) => !v)}
              title={sidebarOpen ? "Collapse Sidebar (Ctrl+B)" : "Expand Sidebar (Ctrl+B)"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
                <path d="M9 3v18" stroke="currentColor" strokeWidth="2" />
              </svg>
            </button>

            <div className="cp-topbar-title-row">
              <span className="cp-topbar-title">{activeSession ? activeSession.title : "Chat"}</span>
              {activeSession?.pinned && <span className="cp-pin-badge">📌</span>}
              <span className="cp-status-pill">
                <span className="cp-status-dot" />
                <span>{activeChar.name} • Online</span>
              </span>
            </div>
          </div>

          <div className="cp-topbar-right">
            {/* Animated SVG Voice ON/OFF Toggle */}
            <VoiceToggle
              isVoiceOn={autoReadAloud}
              onToggle={() => setAutoReadAloud((v) => !v)}
            />

            {/* Document Shredder Clear Chat Button */}
            {messages.length > 0 && (
              <ClearChatButton
                isShredding={isShredding}
                onClick={handleClearWithShredAnimation}
              />
            )}
          </div>
        </header>

        {/* Messages scroll area */}
        <div className={`cp-messages ${isShredding ? "cp-chat-shredding-fade" : ""}`} ref={scrollRef}>
          {/* Empty state with interactive starter prompts */}
          {messages.length === 0 && !streamingText && (
            <div className="cp-empty-state">
              <div className="cp-empty-avatar-wrap">
                <div className="cp-empty-orb-glow">
                  <EnergyOrb size={38} mode="icon" />
                </div>
              </div>
              <h2 className="cp-empty-heading">How can I help you today?</h2>
              <p className="cp-empty-subheading">
                Ask anything, brainstorm creative ideas, or code together with {activeChar.name}.
              </p>

              <div className="cp-starter-cards-wrap cards">
                {getFeatureInfoCards(activeChar.name).map((card, idx) => (
                  <div key={idx} className={`card ${card.colorClass}`}>
                    <div className="card-icon">{card.icon}</div>
                    <p className="tip">{card.title}</p>
                    <p className="second-text">{card.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Render messages */}
          {messages.map((msg) => {
            const isUser = msg.role === "user";
            const isSpeakingThis = speakingMsgId === msg.id;

            return (
              <div
                key={msg.id}
                className={`cp-msg ${isUser ? "cp-msg--user" : "cp-msg--ai"}`}
                style={{ position: "relative", overflow: "hidden" }}
              >
                {!isUser && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      overflow: "hidden",
                      pointerEvents: "none",
                      borderRadius: 12,
                      zIndex: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <EnergyOrb size={28} mode="background" />
                  </div>
                )}

                <div className="cp-msg-avatar" style={{ position: "relative", zIndex: 1 }}>
                  {isUser ? "You" : activeChar.name}
                </div>

                <div className="cp-msg-content" style={{ position: "relative", zIndex: 1 }}>
                  <div
                    className="cp-msg-body"
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(msg.text || msg.content || ""),
                    }}
                  />

                  {/* Action bar for Assistant messages */}
                  {!isUser && (
                    <div className="cp-msg-toolbar">
                      {/* Dynamic swap: Custom animated Read Aloud button when idle -> Play/Pause morph toggle when speaking */}
                      {isSpeakingThis ? (
                        <PlayPauseToggle
                          isChecked={!isAudioPaused}
                          onClick={() => handleReadAloud(msg.id, msg.text || msg.content || "")}
                          title={isAudioPaused ? "Resume voice" : "Pause voice"}
                        />
                      ) : (
                        <ReadAloudButton
                          onClick={() => handleReadAloud(msg.id, msg.text || msg.content || "")}
                          title="Read this message aloud with ElevenLabs voice"
                        />
                      )}

                      {/* Animated Dual-Document Flying Copy Button */}
                      <CopyMessageButton
                        isCopied={copiedMsgId === msg.id}
                        onCopy={() => handleCopyText(msg.id, msg.text || msg.content || "")}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Active Streaming / Thinking Message (EXACTLY ONE ORB) */}
          {isStreaming && (
            <div
              className="cp-msg cp-msg--ai cp-msg--streaming"
              style={{ position: "relative", overflow: "hidden" }}
            >
              {/* Only render background EnergyOrb when text is streaming */}
              {streamingText && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    overflow: "hidden",
                    pointerEvents: "none",
                    borderRadius: 12,
                    zIndex: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <EnergyOrb size={28} mode="background" />
                </div>
              )}
              <div className="cp-msg-avatar" style={{ position: "relative", zIndex: 1 }}>{activeChar.name}</div>
              <div className="cp-msg-content" style={{ position: "relative", zIndex: 1 }}>
                <div className="cp-msg-body">
                  {streamingText ? (
                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingText) }} />
                  ) : (
                    /* EXACTLY ONE ORB during thinking */
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "2px 0" }}>
                      <EnergyOrb size={26} mode="icon" />
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: "#c4b5fd" }}>{activeChar.name} is thinking...</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Input Area ────────────────────────────────────── */}
        <div className="cp-input-area">
          <ChatInputBar
            input={input}
            setInput={setInput}
            onSend={(file) => handleSendPrompt(undefined, file)}
            isListening={isListening}
            onToggleListening={() => {
              if (isListening) stopListening();
              else startListening();
            }}
            isStreaming={isStreaming}
            attachedFile={attachedFile}
            setAttachedFile={setAttachedFile}
          />

          <div className="cp-disclaimer-row">
            <span className="cp-disclaimer">April can make mistakes. Consider checking important info.</span>
            {isListening && <span className="cp-listening-indicator">🎙️ Listening... speak clearly</span>}
          </div>
        </div>
      </main>

      {/* Fullscreen Image Inspector & Download Modal */}
      {inspectImage && (
        <ImageModal
          imageUrl={inspectImage.url}
          promptText={inspectImage.prompt}
          onClose={() => setInspectImage(null)}
          onEditPrompt={(remix) => {
            setInput(remix);
            if (textareaRef.current) textareaRef.current.focus();
          }}
        />
      )}
    </div>
  );
}
