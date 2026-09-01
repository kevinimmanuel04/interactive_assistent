import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface ChatMessage {
  id: string;
  role: "user" | "ai" | "assistant";
  text: string;
  content?: string;
  timestamp: number;
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
  pinned?: boolean;
}

// Aliases for compatibility
export type ChatMessageItem = ChatMessage;
export type ChatSession = Session;

const DEFAULT_SESSION_ID = "session-default-1";

export const createInitialSession = (): Session => ({
  id: `session-${Date.now()}`,
  title: "New Conversation",
  createdAt: Date.now(),
  messages: [],
  pinned: false,
});

/* ── Native Disk Storage Helpers (Survives all dev restarts & browser reloads) ── */
async function saveSessionsToDisk(sessions: Session[]) {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_chat_sessions", {
      sessionsJson: JSON.stringify(sessions),
    });
  } catch (err) {
    console.warn("[chatStore] Failed to save sessions to disk:", err);
  }
}

export async function loadSessionsFromDisk(): Promise<Session[] | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const jsonStr = await invoke<string>("load_chat_sessions");
    if (jsonStr && jsonStr.trim() && jsonStr !== "[]") {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("[chatStore] Failed to load sessions from disk:", err);
  }
  return null;
}

interface ChatState {
  sessions: Session[];
  activeSessionId: string;
  isWorkspaceMode: boolean;
  isSpeaking: boolean;
  selectedRoute: "cloud" | "local" | "auto";

  // Core Actions
  createNewSession: () => string;
  clearActiveSessionMessages: () => void;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, newTitle: string) => void;
  togglePinSession: (id: string) => void;
  addMessage: (role: "user" | "ai" | "assistant", text: string) => void;
  addMessageToActiveSession: (role: "user" | "ai" | "assistant", text: string) => void;
  updateStreamingMessage: (msgId: string, role: "user" | "ai" | "assistant", text: string) => void;

  setWorkspaceMode: (mode: boolean) => void;
  toggleWorkspaceMode: () => void;
  setSelectedRoute: (route: "cloud" | "local" | "auto") => void;
  setIsSpeaking: (speaking: boolean) => void;

  // Computed / Getter helpers
  getActiveSession: () => Session;

  // Backward compatibility fields
  messages: ChatMessage[];
  clearMessages: () => void;
  setMessages: (messages: ChatMessage[]) => void;
  hydrateFromDisk: () => Promise<void>;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      sessions: [createInitialSession()],
      activeSessionId: DEFAULT_SESSION_ID,
      isWorkspaceMode: false,
      isSpeaking: false,
      selectedRoute: "cloud",

      hydrateFromDisk: async () => {
        const diskSessions = await loadSessionsFromDisk();
        if (diskSessions && diskSessions.length > 0) {
          set((state) => {
            // Pick active ID from disk sessions or keep current if valid
            const activeValid = diskSessions.some((s) => s.id === state.activeSessionId);
            return {
              sessions: diskSessions,
              activeSessionId: activeValid ? state.activeSessionId : diskSessions[0].id,
            };
          });
        }
      },

      getActiveSession: () => {
        const { sessions, activeSessionId } = get();
        let found = sessions.find((s) => s.id === activeSessionId);
        if (!found) {
          found = sessions[0] || createInitialSession();
        }
        return found;
      },

      get messages() {
        const active = get().getActiveSession();
        return active ? active.messages : [];
      },

      createNewSession: () => {
        const currentActive = get().getActiveSession();
        // If current active session is already an unstarted empty canvas, just reuse it!
        if (currentActive && currentActive.messages.length === 0) {
          return currentActive.id;
        }

        // Clean up any empty abandoned draft sessions so we don't pollute history
        const filtered = get().sessions.filter((s) => s.messages.length > 0);

        const newId = `session-${Date.now()}`;
        const newSession: Session = {
          id: newId,
          title: "New Conversation",
          createdAt: Date.now(),
          messages: [],
          pinned: false,
        };

        const updated = [newSession, ...filtered];
        set({
          sessions: updated,
          activeSessionId: newId,
        });
        saveSessionsToDisk(updated);
        return newId;
      },

      switchSession: (id: string) => {
        set((state) => {
          const exists = state.sessions.some((s) => s.id === id);
          return exists ? { activeSessionId: id } : state;
        });
      },

      deleteSession: (id: string) => {
        set((state) => {
          const updatedSessions = state.sessions.filter((s) => s.id !== id);
          let newActiveId = state.activeSessionId;

          if (updatedSessions.length === 0) {
            const fallback = createInitialSession();
            saveSessionsToDisk([fallback]);
            return {
              sessions: [fallback],
              activeSessionId: fallback.id,
            };
          }

          if (state.activeSessionId === id) {
            newActiveId = updatedSessions[0].id;
          }

          saveSessionsToDisk(updatedSessions);
          return {
            sessions: updatedSessions,
            activeSessionId: newActiveId,
          };
        });
      },

      renameSession: (id: string, newTitle: string) => {
        set((state) => {
          const updated = state.sessions.map((s) =>
            s.id === id ? { ...s, title: newTitle.trim() || s.title } : s
          );
          saveSessionsToDisk(updated);
          return { sessions: updated };
        });
      },

      togglePinSession: (id: string) => {
        set((state) => {
          const updated = state.sessions.map((s) =>
            s.id === id ? { ...s, pinned: !s.pinned } : s
          );
          saveSessionsToDisk(updated);
          return { sessions: updated };
        });
      },

      addMessage: (role, text) => {
        const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const newItem: ChatMessage = {
          id: msgId,
          role,
          text,
          content: text,
          timestamp: Date.now(),
        };

        set((state) => {
          let activeId = state.activeSessionId;
          let sessions = [...state.sessions];

          // If no active session exists, create one
          let activeIdx = sessions.findIndex((s) => s.id === activeId);
          if (activeIdx < 0) {
            const newSess = createInitialSession();
            sessions = [newSess, ...sessions];
            activeId = newSess.id;
            activeIdx = 0;
          }

          const target = sessions[activeIdx];
          const updatedMessages = [...target.messages, newItem];

          // Auto-generate title from first user message
          let title = target.title;
          if (
            role === "user" &&
            (target.title === "New Conversation" || target.messages.length === 0)
          ) {
            title = text.replace(/<[^>]+>/g, "").trim().slice(0, 32) || "New Conversation";
          }

          sessions[activeIdx] = {
            ...target,
            title,
            messages: updatedMessages,
          };

          saveSessionsToDisk(sessions);
          return {
            sessions,
            activeSessionId: activeId,
          };
        });
      },

      addMessageToActiveSession: (role, text) => {
        get().addMessage(role, text);
      },

      updateStreamingMessage: (msgId, role, text) => {
        set((state) => {
          const activeId = state.activeSessionId;
          const updatedSessions = state.sessions.map((session) => {
            if (session.id === activeId) {
              const msgIndex = session.messages.findIndex((m) => m.id === msgId);
              let updatedMessages: ChatMessage[];
              if (msgIndex >= 0) {
                updatedMessages = session.messages.map((m) =>
                  m.id === msgId ? { ...m, text, content: text } : m
                );
              } else {
                const newMsg: ChatMessage = {
                  id: msgId,
                  role,
                  text,
                  content: text,
                  timestamp: Date.now(),
                };
                updatedMessages = [...session.messages, newMsg];
              }
              return {
                ...session,
                messages: updatedMessages,
              };
            }
            return session;
          });
          return { sessions: updatedSessions };
        });
      },

      clearActiveSessionMessages: () => {
        set((state) => {
          const activeId = state.activeSessionId;
          const updatedSessions = state.sessions.map((session) => {
            if (session.id === activeId) {
              return {
                ...session,
                messages: [],
              };
            }
            return session;
          });
          saveSessionsToDisk(updatedSessions);
          return { sessions: updatedSessions };
        });
      },

      clearMessages: () => {
        get().clearActiveSessionMessages();
      },

      setMessages: (newMessages) => {
        set((state) => {
          const activeId = state.activeSessionId;
          const updatedSessions = state.sessions.map((session) => {
            if (session.id === activeId) {
              return { ...session, messages: newMessages };
            }
            return session;
          });
          saveSessionsToDisk(updatedSessions);
          return { sessions: updatedSessions };
        });
      },

      setWorkspaceMode: (isWorkspaceMode) => set({ isWorkspaceMode }),
      toggleWorkspaceMode: () => set((state) => ({ isWorkspaceMode: !state.isWorkspaceMode })),
      setSelectedRoute: (selectedRoute) => set({ selectedRoute }),
      setIsSpeaking: (isSpeaking) => set({ isSpeaking }),
    }),
    {
      name: "april-chat-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
        selectedRoute: state.selectedRoute,
      }),
    }
  )
);

// Initial disk load on startup
if (typeof window !== "undefined") {
  loadSessionsFromDisk().then((diskSessions) => {
    if (diskSessions && diskSessions.length > 0) {
      useChatStore.setState((state) => {
        const activeValid = diskSessions.some((s) => s.id === state.activeSessionId);
        return {
          sessions: diskSessions,
          activeSessionId: activeValid ? state.activeSessionId : diskSessions[0].id,
        };
      });
    }
  });
}
