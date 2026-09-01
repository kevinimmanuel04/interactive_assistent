export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

const STORAGE_KEY = "april_persistent_chat_history_v1";

export function loadHistory(): StoredMessage[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data) as StoredMessage[];
  } catch (err) {
    console.warn("[chatStorage] Failed to load chat history:", err);
    return [];
  }
}

import { useChatStore } from "../store/chatStore";

export function saveMessage(role: "user" | "assistant", content: string): StoredMessage {
  const history = loadHistory();
  const cleanContent = content
    .replace(/<mood:[^>]+>/g, "")
    .replace(/<tool_call>[\s\S]*?(?:<\/tool_call>|$)/gi, "")
    .replace(/<tool_status>[\s\S]*?(?:<\/tool_status>|$)/gi, "")
    .trim();
  const newMessage: StoredMessage = {
    id: crypto.randomUUID(),
    role,
    content: cleanContent,
    timestamp: Date.now(),
  };

  history.push(newMessage);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (err) {
    console.warn("[chatStorage] Failed to save chat message:", err);
  }

  try {
    const store = useChatStore.getState();
    const active = store.getActiveSession();
    // Only append if the last message isn't already identical to avoid duplicates
    const lastMsg = active.messages[active.messages.length - 1];
    if (!lastMsg || lastMsg.content !== cleanContent || lastMsg.role !== role) {
      store.addMessageToActiveSession(role, cleanContent);
    }
  } catch {
    // ignore
  }

  return newMessage;
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn("[chatStorage] Failed to clear chat history:", err);
  }
}

export function getRecentContext(limit = 15): Array<{ role: string; content: string }> {
  const history = loadHistory();
  const recent = history.slice(-limit);
  return recent.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}
