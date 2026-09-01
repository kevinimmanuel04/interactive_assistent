import { useCallback, useEffect, useRef, useState } from "react";
import AvatarStage from "./components/AvatarStage";
import ChatBubble from "./components/ChatBubble";

import InputField from "./components/InputField";
import ModelWizard from "./components/ModelWizard";
import RegionPicker from "./components/RegionPicker";
import SettingsPanel from "./components/SettingsPanel";
import { ToastHost, toast } from "./components/Toast";
import { saveMessage } from "./services/chatStorage";
import { exit as tauriExit } from "@tauri-apps/plugin-process";
import { avatarState } from "./avatarState";
import { checkForUpdatesQuietly } from "./updater";
import { bootstrapLocale, useLocale } from "./i18n";
import {
  cancelImageGeneration,
  desktopListScreens,
  desktopScreenshot,
  enterRegionPickerMode,
  exitRegionPickerMode,
  feedbackRecord,
  generateImage,
  getSettings,
  getWeather,
  saveGeneratedImage,
  sendMessage,
  visionCaptureFull,
  visionWithImage,
  type PublicSettings,
  type ScreenInfo,
} from "./api";
import { useHotkeys } from "./hooks/useHotkeys";
import { useTtsAudio } from "./hooks/useTtsAudio";
import { useTransientBubbles } from "./hooks/useTransientBubbles";
import { useChatStream, type LastTurn, type Route } from "./hooks/useChatStream";
import { useImageStream } from "./hooks/useImageStream";
import { useListenController } from "./hooks/useListenController";
import { useChatStore } from "./store/chatStore";
import { checkAndExecuteDirectIntent } from "./utils/intentHandler";

export default function App() {
  useEffect(() => {
    const syncAcrossTabs = (e: StorageEvent) => {
      if (e.key === "april-chat-store") {
        useChatStore.persist.rehydrate();
      }
    };
    window.addEventListener("storage", syncAcrossTabs);
    return () => window.removeEventListener("storage", syncAcrossTabs);
  }, []);

  // ── UI panels ──────────────────────────────────────────────────────
  const [_inputOpen, setInputOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [isRotateMode, setIsRotateMode] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // ── Open Chat Window (separate native window) ──────────────────────
  const openChatWindow = useCallback(async () => {
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      // If chat window already exists, just focus it
      const existing = await WebviewWindow.getByLabel("chat");
      if (existing) {
        await existing.show();
        await existing.setFocus();
        return;
      }
      // Create new chat window
      new WebviewWindow("chat", {
        url: "chat.html",
        title: "April Chat",
        width: 1200,
        height: 800,
        minWidth: 600,
        minHeight: 400,
        center: true,
        decorations: true,
        transparent: false,
        alwaysOnTop: false,
        resizable: true,
        focus: true,
      });
    } catch (err) {
      console.warn("[App] Failed to open chat window:", err);
    }
  }, []);
  const [pickerInitialPrompt, setPickerInitialPrompt] = useState("");
  const [pickerPrebuilt, setPickerPrebuilt] = useState<{
    bytes: Uint8Array;
    screen: ScreenInfo | null;
  } | null>(null);

  // ── Bubble / chat-turn state ───────────────────────────────────────
  const [bubbleText, setBubbleText] = useState<string | null>(null);
  const [userEcho, setUserEcho] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [route, setRoute] = useState<Route | null>(null);
  const [modelLabel, setModelLabel] = useState<string | null>(null);
  const [feedbackKey, setFeedbackKey] = useState<number>(0);

  // ── Image generation state ─────────────────────────────────────────
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageSavePath, setImageSavePath] = useState<string | null>(null);
  const [imageStatus, setImageStatus] = useState<
    "generating" | "done" | "error" | null
  >(null);
  const [imageError, setImageError] = useState<string | null>(null);

  // ── Backend snapshot ───────────────────────────────────────────────
  const [settings, setSettings] = useState<PublicSettings | null>(null);

  // ── Refs ───────────────────────────────────────────────────────────
  const activeImageIdRef = useRef<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const rawTextRef = useRef<string>("");
  const bubbleTimer = useRef<number | null>(null);
  const settingsRef = useRef<PublicSettings | null>(null);
  const handleSubmitRef = useRef<((text: string) => void) | null>(null);
  const lastTurnRef = useRef<LastTurn | null>(null);

  // ── Settings refresh ───────────────────────────────────────────────
  const refreshSettings = useCallback(() => {
    getSettings().then(setSettings).catch(() => {});
  }, []);
  useEffect(() => {
    refreshSettings();
    void bootstrapLocale();
  }, [refreshSettings]);

  useEffect(() => {
    if (settings?.language !== undefined) void bootstrapLocale();
  }, [settings?.language]);
  useLocale();

  useEffect(() => {
    checkForUpdatesQuietly();
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // ── Helpers shared by handlers and effects ────────────────────────
  const scheduleBubbleHide = useCallback((ms = 20000) => {
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => {
      setBubbleText(null);
      setUserEcho(null);
      setRoute(null);
      setImageBase64(null);
      setImageSavePath(null);
      setImageStatus(null);
      setImageError(null);
    }, ms);
  }, []);

  const openPickerWithPrompt = useCallback(
    async (prompt: string) => {
      try {
        setPickerInitialPrompt(prompt);
        const screens = await desktopListScreens();
        const primary = screens.find((s) => s.is_primary) ?? screens[0] ?? null;
        const bytes = await desktopScreenshot(0);
        setPickerPrebuilt({ bytes, screen: primary });
        await enterRegionPickerMode(prompt);
        setPickerOpen(true);
      } catch (err) {
        setBubbleText(`⚠ ${String(err)}`);
        scheduleBubbleHide(5000);
      }
    },
    [scheduleBubbleHide],
  );

  const closePicker = useCallback(async () => {
    setPickerOpen(false);
    setPickerPrebuilt(null);
    try {
      await exitRegionPickerMode();
    } catch {
      // best effort restore
    }
  }, []);

  // ── Hooks ──────────────────────────────────────────────────────────
  useHotkeys({
    onToggleInput: useCallback(() => setInputOpen((v) => !v), []),
    onVisionRegion: useCallback(
      () => void openPickerWithPrompt(""),
      [openPickerWithPrompt],
    ),
  });

  useTtsAudio({
    outputDevice: settings?.audio_output_device,
    volume: settings?.tts_volume,
  });

  useTransientBubbles({ activeIdRef, setBubbleText, bubbleTimer });

  useListenController({
    settings,
    settingsRef,
    refreshSettings,
    handleSubmitRef,
    setBubbleText,
    setUserEcho,
  });

  useChatStream({
    activeIdRef,
    lastTurnRef,
    settingsRef,
    rawTextRef,
    setRoute,
    setModelLabel,
    setBubbleText,
    setThinking,
    setFeedbackKey,
    scheduleBubbleHide,
    onGenerateImage: (prompt) => void handleImagePrompt(prompt),
  });

  useImageStream({
    activeImageIdRef,
    activeIdRef,
    setImageStatus,
    setImageError,
    setImageBase64,
    setImageSavePath,
    setThinking,
    scheduleBubbleHide,
  });

  const handleImagePrompt = useCallback(
    async (prompt: string, size?: { width: number; height: number }) => {
      if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
      setBubbleText(null);
      setUserEcho(`🎨 ${prompt}`);
      setRoute(null);
      setImageBase64(null);
      setImageSavePath(null);
      setImageError(null);
      setImageStatus("generating");
      setThinking(true);
      avatarState.setThinking();
      try {
        const id = await generateImage(prompt, size);
        activeImageIdRef.current = id;
        activeIdRef.current = id;
      } catch (err) {
        setImageStatus("error");
        setImageError(String(err));
        setThinking(false);
        avatarState.onDone(500);
      }
    },
    [],
  );

  const handleSaveImage = useCallback(async () => {
    if (!imageBase64) return;
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const target = await save({
        defaultPath: `image-${Date.now()}.png`,
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (typeof target === "string" && target.trim()) {
        await saveGeneratedImage(imageBase64, target);
        setImageSavePath(target);
        toast.success(`Saved to ${target}`);
      }
    } catch (err) {
      setImageError(String(err));
      toast.error(`Save failed: ${String(err)}`);
    }
  }, [imageBase64]);

  const handleCopyImage = useCallback(async () => {
    if (!imageBase64) return;
    try {
      const bin = atob(imageBase64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const blob = new Blob([buf], { type: "image/png" });
      const CI: any = (window as any).ClipboardItem;
      if (CI && navigator.clipboard?.write) {
        await navigator.clipboard.write([new CI({ "image/png": blob })]);
        toast.success("Copied to clipboard");
      }
    } catch (err) {
      setImageError(String(err));
      toast.error(`Copy failed: ${String(err)}`);
    }
  }, [imageBase64]);

  const handleCancelImage = useCallback(async () => {
    try {
      await cancelImageGeneration();
    } catch {
      // best-effort
    }
  }, []);

  const handleWeatherSlash = useCallback(
    async (city: string) => {
      if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
      setUserEcho(city ? `🌤️ /weather ${city}` : "🌤️ /weather");
      setBubbleText("");
      setRoute("skill");
      setThinking(true);
      avatarState.setThinking();
      try {
        const r = await getWeather(city || undefined);
        const loc = r.location.country
          ? `${r.location.name}, ${r.location.country}`
          : r.location.name;
        const tempUnit = r.units === "imperial" ? "°F" : "°C";
        const windUnit = r.units === "imperial" ? "mph" : "м/с";
        const parts = [
          `${r.icon} ${loc}: ${Math.round(r.temperature)}${tempUnit}`,
        ];
        if (r.feels_like != null)
          parts.push(`ощущается ${Math.round(r.feels_like)}${tempUnit}`);
        parts.push(r.description);
        if (r.wind_speed != null)
          parts.push(`ветер ${r.wind_speed.toFixed(1)} ${windUnit}`);
        if (r.humidity != null)
          parts.push(`влажность ${Math.round(r.humidity)}%`);
        setBubbleText(parts.join(" · "));
      } catch (err) {
        setBubbleText(`⚠ Не удалось получить погоду: ${String(err)}`);
      } finally {
        setThinking(false);
        avatarState.onDone();
        scheduleBubbleHide(12000);
      }
    },
    [scheduleBubbleHide],
  );

  const handleSubmit = async (text: string) => {
    // 0. Intercept Direct OS Commands (Open App, Search Browser, Window Controls)
    const handled = await checkAndExecuteDirectIntent(text, { setBubbleText });
    if (handled) return;
    if (
      text.trim().toLowerCase().startsWith("/img ") ||
      text.trim().toLowerCase() === "/img"
    ) {
      const prompt = text.trim().replace(/^\/img\s*/i, "").trim();
      if (!prompt) {
        setBubbleText("Usage: /img <prompt>");
        scheduleBubbleHide(4000);
        return;
      }
      void handleImagePrompt(prompt);
      return;
    }
    if (
      text.trim().toLowerCase().startsWith("/weather") ||
      text.trim().toLowerCase() === "/weather"
    ) {
      const city = text.trim().replace(/^\/weather\s*/i, "").trim();
      void handleWeatherSlash(city);
      return;
    }
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
    saveMessage("user", text);
    setBubbleText("");
    setUserEcho(text);
    setThinking(true);
    setRoute(null);
    setImageBase64(null);
    setImageSavePath(null);
    setImageStatus(null);
    setImageError(null);
    avatarState.setThinking();
    avatarState.setUserPrompt(text);
    activeIdRef.current = "pending";
    lastTurnRef.current = {
      id: "pending",
      prompt: text,
      response: "",
      route: "local",
      modelLabel: "",
    };
    try {
      const id =
        settings?.auto_screen_watch_enabled && settings?.has_openrouter_key
          ? await visionCaptureFull(text)
          : await sendMessage(text);
      if (activeIdRef.current === "pending") activeIdRef.current = id;
    } catch (err) {
      activeIdRef.current = null;
      setThinking(false);
      avatarState.onDone(500);
      setBubbleText(`⚠ ${String(err)}`);
      scheduleBubbleHide(6000);
    }
  };
  handleSubmitRef.current = handleSubmit;

  const runVision = async (
    label: string,
    prompt: string,
    invoker: () => Promise<string>,
  ) => {
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
    setBubbleText("");
    setUserEcho(prompt ? `${label}: ${prompt}` : label);
    setThinking(true);
    setRoute(null);
    avatarState.setThinking();
    try {
      const id = await invoker();
      if (activeIdRef.current === "pending") activeIdRef.current = id;
    } catch (err) {
      activeIdRef.current = null;
      setThinking(false);
      avatarState.onDone(500);
      setBubbleText(`⚠ ${String(err)}`);
      scheduleBubbleHide(6000);
    }
  };

  const handleVisionImage = (prompt: string, pngBase64: string) =>
    runVision("🖼 image", prompt, () => visionWithImage(prompt, pngBase64));

  const activeModelUrl =
    localStorage.getItem("april_model_url") ||
    localStorage.getItem("april_model_url") ||
    settings?.live2d_model_url ||
    "/april.vrm";

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          top: 0,
          left: 0,
        }}
      >
        <AvatarStage
          modelUrl={activeModelUrl}
          zoom={settings?.avatar_zoom ?? 1}
          offsetX={settings?.avatar_offset_x ?? 0}
          offsetY={settings?.avatar_offset_y ?? 0}
          isRotateMode={isRotateMode}
        />
      </div>

      <ChatBubble
        text={bubbleText}
        route={route}
        thinking={thinking}
        userEcho={userEcho}
        imageBase64={imageBase64}
        imageSavePath={imageSavePath}
        imageStatus={imageStatus}
        imageError={imageError}
        onSaveImage={handleSaveImage}
        onCopyImage={handleCopyImage}
        onCancelImage={handleCancelImage}
        feedbackKey={feedbackKey}
        onFeedback={(rating) => {
          const turn = lastTurnRef.current;
          if (!turn || !turn.response) return;
          const lang = settingsRef.current?.language || "en";
          void feedbackRecord({
            modelLabel: turn.modelLabel,
            route: turn.route,
            prompt: turn.prompt,
            response: turn.response,
            rating,
            lang,
          });
          toast.success("Feedback saved — thanks!");
        }}
      />
      <InputField
        open={true}
        onClose={() => {}}
        onSubmit={handleSubmit}
        sttEnabled={true}
        modelLabel={modelLabel}
        isRotateMode={isRotateMode}
        onToggleRotateMode={setIsRotateMode}
        onToggleDrawer={openChatWindow}
        onToggleSettings={() => {
          setWizardOpen(false);
          setSettingsOpen((v) => !v);
        }}
        onQuit={() => tauriExit(0)}
        onSpeechUpdate={(text) => setUserEcho(text)}
      />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onChanged={refreshSettings}
      />
      <ModelWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSettingsChanged={refreshSettings}
        settings={settings}
      />

      <RegionPicker
        open={pickerOpen}
        initialPrompt={pickerInitialPrompt}
        prebuilt={pickerPrebuilt ?? undefined}
        onCancel={() => {
          void closePicker();
        }}
        onSubmit={(s) => {
          void closePicker();
          handleVisionImage(s.prompt, s.imageBase64);
        }}
        onGenerateVariant={(prompt, size) => {
          void closePicker();
          void handleImagePrompt(prompt, size);
        }}
      />
      <ToastHost />
    </div>
  );
}
