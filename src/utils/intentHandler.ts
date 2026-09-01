/**
 * Direct PC OS Command Intent Interceptor.
 * Matches user voice/text commands (open app, search browser, window control)
 * and executes them instantly via Tauri without sending to the LLM model.
 */
export async function checkAndExecuteDirectIntent(
  text: string,
  callbacks?: {
    setBubbleText?: (text: string | null) => void;
    speak?: (text: string) => void;
  }
): Promise<boolean> {
  const clean = text.trim();
  if (!clean) return false;

  // Never intercept attached files, code snippets, or vision triggers
  if (
    clean.includes("[Attached File:") ||
    clean.includes("Attached File") ||
    clean.includes("[Attached Document:") ||
    clean.startsWith("📄") ||
    clean.startsWith("![") ||
    clean.startsWith("👁️")
  ) {
    return false;
  }

  const norm = clean.toLowerCase().replace(/[^\w\s]/g, "").trim();

  // 1. Minimize Window
  if (norm.includes("minimize") || norm.includes("hide window")) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("minimize_window");
      const reply = "Minimizing window!";
      callbacks?.setBubbleText?.(reply);
      if (callbacks?.speak) callbacks.speak(reply);
      return true;
    } catch {
      return false;
    }
  }

  // 2. Maximize / Open Window
  if (
    norm.includes("maximize") ||
    norm.includes("fullscreen") ||
    norm.includes("full screen") ||
    norm === "open window" ||
    norm === "show window"
  ) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("maximize_window");
      const reply = "Opening window!";
      callbacks?.setBubbleText?.(reply);
      if (callbacks?.speak) callbacks.speak(reply);
      return true;
    } catch {
      return false;
    }
  }

  // 3. Automated Keyboard Typing ("type hello world", "type in search bar lofi beats")
  if (norm.startsWith("type ") || norm.includes("type in ") || norm.includes("type for me")) {
    const textToType = clean
      .replace(/^(hey|hi|ok|okay|april|please|can|could|you|would|to|type|in|search|bar|for|me|\s)+/gi, " ")
      .trim();
    if (textToType) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("type_text_cmd", { text: textToType });
        const reply = `Typing "${textToType}" for you!`;
        callbacks?.setBubbleText?.(reply);
        if (callbacks?.speak) callbacks.speak(reply);
        return true;
      } catch (err) {
        console.warn("[IntentHandler] Failed to type text:", err);
      }
    }
  }

  // 4. Pinpoint Folder, Drive & File Opener ("open c drive", "open downloads folder", "open documents", "find file project")
  if (
    norm.includes("drive") ||
    norm.includes("disk") ||
    norm.includes("folder") ||
    norm.includes("file") ||
    norm.includes("downloads") ||
    norm.includes("documents") ||
    norm.includes("pictures") ||
    norm.includes("photos") ||
    norm.includes("videos") ||
    norm.includes("desktop")
  ) {
    const folderTarget = clean
      .replace(/^(hey|hi|ok|okay|april|please|can|could|you|would|to|open|find|show|locate|my|\s)+/gi, " ")
      .replace(/[^\w\s]/g, "")
      .trim();

    if (folderTarget && folderTarget.toLowerCase() !== "window") {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("open_folder_or_file_cmd", { target: folderTarget });
        const reply = `Yes, opening ${folderTarget}!`;
        callbacks?.setBubbleText?.(reply);
        if (callbacks?.speak) callbacks.speak(reply);
        return true;
      } catch (err) {
        console.warn("[IntentHandler] Failed to open folder/file:", err);
      }
    }
  }

  // 5. Open App or Tool (matches "open...", "launch...", "open up...", "can you open...")
  if (/\b(open|launch)\b/i.test(norm)) {
    const appTarget = clean
      .replace(/^(hey|hi|ok|okay|april|please|can|could|you|would|to|open|launch|up|the|a|an|\s)+/gi, " ")
      .replace(/^(open|launch|up|the|a|an|\s)+/gi, " ")
      .replace(/[^\w\s]/g, "")
      .trim();

    if (appTarget && appTarget.toLowerCase() !== "window") {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("open_app_cmd", { name: appTarget });
        const reply = `Yes, opening ${appTarget}!`;
        callbacks?.setBubbleText?.(reply);
        if (callbacks?.speak) callbacks.speak(reply);
        return true;
      } catch (err) {
        console.warn("[IntentHandler] Failed to open app:", err);
        return false;
      }
    }
  }

  // 6. Browser & YouTube Search (matches "search for...", "search...", "google...")
  if (/\b(search|google)\b/i.test(norm)) {
    const query = clean
      .replace(/^(hey|hi|ok|okay|april|please|can|could|you|search|for|google|on|\s)+/gi, " ")
      .replace(/[^\w\s]/g, "")
      .trim();

    if (query) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("open_url_cmd", { url: query });
        const reply = `Searching for ${query}...`;
        callbacks?.setBubbleText?.(reply);
        if (callbacks?.speak) callbacks.speak(reply);
        return true;
      } catch (err) {
        console.warn("[IntentHandler] Failed to open search URL:", err);
        return false;
      }
    }
  }

  return false;
}
