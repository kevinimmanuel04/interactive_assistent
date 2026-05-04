import { useCallback, useEffect, useRef, useState } from "react";
import AvatarStage from "./components/AvatarStage";
import ChatBubble from "./components/ChatBubble";
import InputField from "./components/InputField";
import ModelWizard from "./components/ModelWizard";
import RegionPicker from "./components/RegionPicker";
import SettingsPanel from "./components/SettingsPanel";
import { listen } from "@tauri-apps/api/event";
import { exit as tauriExit } from "@tauri-apps/plugin-process";
import { invoke } from "@tauri-apps/api/core";
import { avatarState } from "./avatarState";
import { stripMoodTags } from "./emotion";
import { lipSync } from "./lipsync";
import { ListenController } from "./listen";
import { checkForUpdatesQuietly } from "./updater";
import { bootstrapLocale, t, useLocale } from "./i18n";
import {
  cancelGeneration,
  cancelImageGeneration,
  ChatEvent,
  enterRegionPickerMode,
  exitRegionPickerMode,
  feedbackRecord,
  generateImage,
  getRelationshipState,
  getSettings,
  getWeather,
  ImageEvent,
  onChat,
  onImage,
  onRelationshipStageChange,
  onRelationshipUpdated,
  PublicSettings,
  RelationshipState,
  resetChat,
  saveGeneratedImage,
  sendMessage,
  setListenEnabled,
  STAGE_LABELS,
  visionCaptureFull,
  visionWithImage,
} from "./api";

type Route = "local" | "cloud" | "skill";

export default function App() {
  const [inputOpen, setInputOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [bubbleText, setBubbleText] = useState<string | null>(null);
  const [userEcho, setUserEcho] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [route, setRoute] = useState<Route | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [listening, setListening] = useState(false);
  const [heardHint, setHeardHint] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerInitialPrompt, setPickerInitialPrompt] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageSavePath, setImageSavePath] = useState<string | null>(null);
  const [imageStatus, setImageStatus] = useState<
    "generating" | "done" | "error" | null
  >(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [relationship, setRelationship] = useState<RelationshipState | null>(null);
  const activeImageIdRef = useRef<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  // Accumulated *raw* token stream including any `<mood:X>` markers, used
  // for emotion classification. The visible bubble text strips the markers
  // before display, so we can't re-derive the raw text from it.
  const rawTextRef = useRef<string>("");
  const bubbleTimer = useRef<number | null>(null);
  const controllerRef = useRef<ListenController | null>(null);
  const settingsRef = useRef<PublicSettings | null>(null);
  const handleSubmitRef = useRef<((text: string) => void) | null>(null);
  // Tracks the most recent assistant turn so the feedback buttons can
  // attach the right prompt/response pair to a 👍/👎 click. Lives in a
  // ref because the chat-event handler closure mustn't depend on it.
  const lastTurnRef = useRef<{
    id: string | number;
    prompt: string;
    response: string;
    route: "local" | "cloud" | "skill";
    modelLabel: string;
  } | null>(null);
  const [feedbackKey, setFeedbackKey] = useState<number>(0);

  // Load settings on mount.
  const refreshSettings = useCallback(() => {
    getSettings().then(setSettings).catch(() => {});
  }, []);
  useEffect(() => {
    refreshSettings();
    void bootstrapLocale();
  }, [refreshSettings]);

  // Re-bootstrap locale whenever the language preference changes.
  useEffect(() => {
    if (settings?.language !== undefined) void bootstrapLocale();
  }, [settings?.language]);

  // Subscribe to locale changes so all `t(...)` calls re-render.
  useLocale();

  // Check for app updates in the background on startup.
  useEffect(() => {
    checkForUpdatesQuietly();
  }, []);

  // Global hotkey toggles input.
  useEffect(() => {
    const p = listen<string>("hotkey:toggle-input", () => {
      setInputOpen((v) => !v);
    });
    return () => {
      p.then((fn) => fn());
    };
  }, []);

  // Alt+V hotkey: open the region picker overlay regardless of which UI
  // panel is active. Lets the user ask about anything on screen without
  // first opening the chat input field.
  useEffect(() => {
    const p = listen<string>("hotkey:vision-region", () => {
      void openPickerWithPrompt("");
    });
    return () => {
      p.then((fn) => fn());
    };
  }, []);

  const openPickerWithPrompt = useCallback(async (prompt: string) => {
    try {
      setPickerInitialPrompt(prompt);
      await enterRegionPickerMode(prompt);
      setPickerOpen(true);
    } catch (err) {
      setBubbleText(`⚠ ${String(err)}`);
      scheduleBubbleHide(5000);
    }
  }, []);

  const closePicker = useCallback(async () => {
    setPickerOpen(false);
    try {
      await exitRegionPickerMode();
    } catch {
      // best effort restore
    }
  }, []);

  // Apply output-device preference: browsers identify outputs by deviceId
  // (MediaDevices), not cpal's device name. Resolve by matching the label.
  useEffect(() => {
    const want = settings?.audio_output_device;
    if (!want) {
      lipSync.setSinkId(null);
      return;
    }
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((devs) => {
        const match = devs.find(
          (d) => d.kind === "audiooutput" && d.label === want,
        );
        lipSync.setSinkId(match?.deviceId ?? null);
      })
      .catch(() => {});
  }, [settings?.audio_output_device]);

  // Apply TTS volume from settings to the shared lip-sync audio element.
  useEffect(() => {
    lipSync.setVolume(settings?.tts_volume ?? 1);
  }, [settings?.tts_volume]);

  // Backend-synthesized TTS audio: play via Web Audio + drive Live2D mouth.
  useEffect(() => {
    const p = listen<string>("tts:play", (evt) => {
      console.log("[tts:play] event received:", typeof evt.payload, evt.payload?.slice?.(0, 80));
      lipSync.play(evt.payload).catch((e) => {
        console.warn("[tts] playback failed:", e);
      });
    });
    return () => {
      p.then((fn) => fn());
    };
  }, []);

  // Proactive suggestions and game-coach tips both surface as transient
  // bubbles. Skip them if a real reply is currently streaming so we don't
  // stomp on the active conversation.
  useEffect(() => {
    const showTransient = (text: string) => {
      if (activeIdRef.current) return;
      setBubbleText(text);
      if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
      bubbleTimer.current = window.setTimeout(() => {
        setBubbleText(null);
        bubbleTimer.current = null;
      }, 8000);
    };
    const p1 = listen<{ hint: string }>("proactive:suggest", (evt) => {
      const hint = evt.payload?.hint?.trim();
      if (hint) showTransient(hint);
    });
    const p2 = listen<{ game: string; hint: string }>("coach:tip", (evt) => {
      const hint = evt.payload?.hint?.trim();
      if (hint) showTransient(hint);
    });
    return () => {
      p1.then((fn) => fn());
      p2.then((fn) => fn());
    };
  }, []);

  // Auto-listen: when enabled, keep the continuous-listen switch on so the
  // assistant can hear the next prompt without a mic click. The existing
  // ListenController already handles VAD + re-arming between utterances.
  useEffect(() => {
    if (settings?.auto_listen && !settings?.listen_enabled) {
      setListenEnabled(true).catch(() => {});
      refreshSettings();
    }
  }, [settings?.auto_listen, settings?.listen_enabled, refreshSettings]);

  // Continuous-listen controller: lazily created, attached to live settings
  // through a ref callback so wake-word changes propagate without restart.
  useEffect(() => {
    if (!controllerRef.current) {
      controllerRef.current = new ListenController({
        getWakeWord: () => settingsRef.current?.wake_word ?? null,
        getInputDevice: () =>
          settingsRef.current?.audio_input_device ?? null,
        onSpeechStart: () => {
          setHeardHint(true);
          avatarState.setListening(true);
          setBubbleText(null);
          setUserEcho("🎙 Listening…");
        },
        onSpeechEnd: () => {
          setHeardHint(false);
          avatarState.setListening(false);
          setUserEcho("⏳ Transcribing…");
        },
        onTranscript: (text) => {
          // Route the transcript through the normal chat pipeline so the
          // rest of the UI (route badge, streaming tokens) works identically
          // to keyboard input.
          handleSubmitRef.current?.(text);
        },
        onIgnored: (_text, reason) => {
          if (reason === "wake-word") {
            // Wake-word required but absent — clear the hint silently.
            setUserEcho(null);
          } else {
            // Empty transcription — let the user know nothing was heard.
            setUserEcho(null);
          }
        },
        onError: (err) => {
          console.warn("[listen]", err);
          setUserEcho(`⚠ ${String(err)}`);
        },
      });
    }
    const wantEnabled = settings?.listen_enabled === true;
    const ctrl = controllerRef.current;
    const running = ctrl.isEnabled();
    if (wantEnabled && !running) {
      ctrl.enable().then(() => setListening(true)).catch((err) => {
        console.warn("[listen] enable failed:", err);
        setListenEnabled(false).catch(() => {});
      });
    } else if (!wantEnabled && running) {
      ctrl.disable().then(() => setListening(false));
    }
  }, [settings?.listen_enabled]);

  // Keep a ref of the latest settings so the listen controller (created once)
  // always reads the current wake-word.
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Tear down mic stream on unmount.
  useEffect(() => {
    return () => {
      controllerRef.current?.disable().catch(() => {});
    };
  }, []);

  const handleToggleListen = useCallback(async () => {
    const next = !(settings?.listen_enabled ?? false);
    await setListenEnabled(next);
    refreshSettings();
  }, [settings?.listen_enabled, refreshSettings]);

  // Stream chat events.
  useEffect(() => {
    const p = onChat((e: ChatEvent) => {
      // Race-free id matching: the backend starts emitting events on a
      // spawned task before `sendMessage` returns the id. Reserve the slot
      // with the sentinel "pending" on submit; the first event adopts its
      // real id.
      if (activeIdRef.current === "pending") activeIdRef.current = e.id;
      if (e.id !== activeIdRef.current) return;
      switch (e.kind) {
        case "started":
          setRoute(e.route);
          setBubbleText("");
          rawTextRef.current = "";
          setThinking(true);
          // Open a fresh feedback turn. Prompt was stashed in `lastTurnRef`
          // by handleSubmit; record route + model_label here when known.
          if (lastTurnRef.current) {
            const s = settingsRef.current;
            const modelLabel =
              e.route === "cloud"
                ? `openrouter:${s?.openrouter_model ?? "?"}`
                : e.route === "local"
                ? `local:${(s?.local_model_path ?? "").split(/[\\/]/).pop() || "?"}`
                : `skill:${e.route}`;
            lastTurnRef.current = {
              ...lastTurnRef.current,
              id: e.id,
              route: e.route,
              modelLabel,
              response: "",
            };
          }
          break;
        case "token":
          setThinking(false);
          rawTextRef.current += e.text;
          avatarState.onToken(rawTextRef.current);
          setBubbleText(stripMoodTags(rawTextRef.current));
          break;
        case "done":
          setThinking(false);
          avatarState.onDone();
          // Freeze the response text for feedback before scheduling hide.
          if (lastTurnRef.current && lastTurnRef.current.id === e.id) {
            lastTurnRef.current.response = stripMoodTags(rawTextRef.current);
            setFeedbackKey((k) => k + 1);
          }
          scheduleBubbleHide();
          activeIdRef.current = null;
          rawTextRef.current = "";
          break;
        case "error":
          setThinking(false);
          avatarState.onDone(500);
          setBubbleText(`⚠ ${e.message}`);
          scheduleBubbleHide(6000);
          activeIdRef.current = null;
          rawTextRef.current = "";
          // Cancel the pending feedback turn — no usable reply.
          lastTurnRef.current = null;
          break;
      }
    });
    return () => {
      p.then((fn) => fn());
    };
  }, []);

  // Stream image-generation events.
  useEffect(() => {
    const p = onImage(async (e: ImageEvent) => {
      if (e.kind === "started") {
        if (activeImageIdRef.current !== e.id) return;
        setImageStatus("generating");
        setImageError(null);
        setImageBase64(null);
        setImageSavePath(null);
        return;
      }
      if (activeImageIdRef.current !== e.id) return;
      if (e.kind === "done") {
        setImageStatus("done");
        setImageBase64(e.png_base64);
        setImageSavePath(e.save_path);
        setThinking(false);
        avatarState.onDone();
        activeIdRef.current = null;
        // Auto-copy PNG to clipboard (best-effort).
        try {
          const bin = atob(e.png_base64);
          const buf = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
          const blob = new Blob([buf], { type: "image/png" });
          // ClipboardItem is not in lib.dom typings on all targets.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const CI: any = (window as any).ClipboardItem;
          if (CI && navigator.clipboard?.write) {
            await navigator.clipboard.write([new CI({ "image/png": blob })]);
          }
        } catch {
          // Clipboard may be denied; non-fatal.
        }
      } else if (e.kind === "error") {
        setImageStatus("error");
        setImageError(e.message);
        setThinking(false);
        avatarState.onDone(500);
        activeIdRef.current = null;
        activeImageIdRef.current = null;
      }
    });
    return () => {
      p.then((fn) => fn());
    };
  }, []);

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
      }
    } catch (err) {
      setImageError(String(err));
    }
  }, [imageBase64]);

  const handleCopyImage = useCallback(async () => {
    if (!imageBase64) return;
    try {
      const bin = atob(imageBase64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const blob = new Blob([buf], { type: "image/png" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const CI: any = (window as any).ClipboardItem;
      if (CI && navigator.clipboard?.write) {
        await navigator.clipboard.write([new CI({ "image/png": blob })]);
      }
    } catch (err) {
      setImageError(String(err));
    }
  }, [imageBase64]);

  const handleCancelImage = useCallback(async () => {
    try {
      await cancelImageGeneration();
    } catch {
      // best-effort
    }
  }, []);

  // Weather slash command — always emits a chat-style bubble in response.
  const handleWeatherSlash = useCallback(async (city: string) => {
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
      const parts = [`${r.icon} ${loc}: ${Math.round(r.temperature)}${tempUnit}`];
      if (r.feels_like != null) parts.push(`ощущается ${Math.round(r.feels_like)}${tempUnit}`);
      parts.push(r.description);
      if (r.wind_speed != null) parts.push(`ветер ${r.wind_speed.toFixed(1)} ${windUnit}`);
      if (r.humidity != null) parts.push(`влажность ${Math.round(r.humidity)}%`);
      setBubbleText(parts.join(" · "));
    } catch (err) {
      setBubbleText(`⚠ Не удалось получить погоду: ${String(err)}`);
    } finally {
      setThinking(false);
      avatarState.onDone();
      scheduleBubbleHide(12000);
    }
  }, []);

  // Initial relationship state + live updates.
  useEffect(() => {
    let cancelled = false;
    void getRelationshipState().then((s) => {
      if (!cancelled) setRelationship(s);
    }).catch(() => {});
    const updP = onRelationshipUpdated((s) => setRelationship(s));
    const stageP = onRelationshipStageChange((e) => {
      const next = STAGE_LABELS[e.current];
      const up =
        Object.keys(STAGE_LABELS).indexOf(e.current) >
        Object.keys(STAGE_LABELS).indexOf(e.previous);
      const stageName = (s: typeof e.current) => t(`stage.${s}` as any);
      const msg = up
        ? `${next.emoji} ${t("rel.stage_up")}: ${stageName(e.previous)} → ${stageName(e.current)}`
        : `${next.emoji} ${stageName(e.previous)} → ${stageName(e.current)}`;
      setBubbleText(msg);
      scheduleBubbleHide(6000);
    });
    return () => {
      cancelled = true;
      updP.then((fn) => fn());
      stageP.then((fn) => fn());
    };
  }, []);

  const scheduleBubbleHide = (ms = 8000) => {
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => {
      setBubbleText(null);
      setUserEcho(null);
      setRoute(null);
    }, ms);
  };

  const handleSubmit = async (text: string) => {
    if (text.trim().toLowerCase().startsWith("/img ") || text.trim().toLowerCase() === "/img") {
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
    setBubbleText("");
    setUserEcho(text);
    setThinking(true);
    setRoute(null);
    setImageBase64(null);
    setImageSavePath(null);
    setImageStatus(null);
    setImageError(null);
    avatarState.setThinking();
    activeIdRef.current = "pending";
    // Stash the prompt now; route + modelLabel are filled in once the
    // backend emits "started" with the resolved route.
    lastTurnRef.current = {
      id: "pending",
      prompt: text,
      response: "",
      route: "local",
      modelLabel: "",
    };
    try {
      // Auto screen-watch mode: every text turn implicitly attaches a
      // fresh screenshot, so the assistant is "looking" at the desktop
      // throughout the conversation. Costs an OpenRouter vision request
      // per message — gated behind an explicit setting + key.
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

  // Generic vision dispatcher: kicks the chat-state machine the same way
  // handleSubmit does, then awaits the chosen invoke. Backend emits the
  // normal `chat:*` event stream so the bubble, route badge, emotion tags,
  // and TTS pipeline all work without further wiring.
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
    activeIdRef.current = "pending";
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

  const handleVisionFull = (prompt: string) =>
    runVision("👁 screen", prompt, () => visionCaptureFull(prompt));
  const handleVisionImage = (prompt: string, pngBase64: string) =>
    runVision("🖼 image", prompt, () => visionWithImage(prompt, pngBase64));

  const handleReset = async () => {
    await cancelGeneration();
    await resetChat();
    lipSync.stop();
    avatarState.reset();
    setBubbleText(null);
    setUserEcho(null);
    setRoute(null);
    setThinking(false);
  };

  return (
    <>
      <AvatarStage
        modelUrl={
          settings?.live2d_model_url ?? "/live2d/mao_pro/mao_pro.model3.json"
        }
        zoom={settings?.avatar_zoom ?? 1}
        offsetX={settings?.avatar_offset_x ?? 0}
        offsetY={settings?.avatar_offset_y ?? 0}
      />
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
          }).catch(() => {});
        }}
      />
      <InputField
        open={inputOpen && !settingsOpen && !wizardOpen}
        onClose={() => setInputOpen(false)}
        onSubmit={handleSubmit}
        onVisionFull={handleVisionFull}
        onOpenVisionRegionPicker={(prompt) => {
          void openPickerWithPrompt(prompt);
        }}
        onVisionImage={handleVisionImage}
        onImagePrompt={(prompt) => void handleImagePrompt(prompt)}
        visionEnabled={Boolean(settings?.has_openrouter_key)}
        sttEnabled={Boolean(
          (settings?.stt_available && settings?.whisper_model_path) ||
            (settings?.openrouter_stt_enabled && settings?.has_openrouter_key) ||
            settings?.faster_whisper_enabled ||
            (settings?.deepgram_enabled && settings?.has_deepgram_key)
        )}
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
      <TopBar
        mode={settings?.mode ?? "auto"}
        hasKey={settings?.has_openrouter_key ?? false}
        listenEnabled={settings?.listen_enabled ?? false}
        listenReady={Boolean(
          (settings?.stt_available && settings?.whisper_model_path) ||
            (settings?.openrouter_stt_enabled && settings?.has_openrouter_key) ||
            settings?.faster_whisper_enabled ||
            (settings?.deepgram_enabled && settings?.has_deepgram_key)
        )}
        listening={listening}
        heard={heardHint}
        onToggleListen={handleToggleListen}
        onToggleSettings={() => {
          setWizardOpen(false);
          setSettingsOpen((v) => !v);
        }}
        onToggleWizard={() => {
          setSettingsOpen(false);
          setWizardOpen((v) => !v);
        }}
        onReset={handleReset}
        onQuit={() => tauriExit(0)}
        autoWatch={settings?.auto_screen_watch_enabled === true}
        autoWatchAvailable={Boolean(settings?.has_openrouter_key)}
        onToggleAutoWatch={async () => {
          const next = !(settings?.auto_screen_watch_enabled ?? false);
          await invoke("set_auto_screen_watch_enabled", { enabled: next });
          refreshSettings();
        }}
        relationship={relationship}
        showRelationshipBadge={(settings?.relationship_visibility ?? "indicator") !== "hidden"}
      />
      <RegionPicker
        open={pickerOpen}
        initialPrompt={pickerInitialPrompt}
        onCancel={() => {
          void closePicker();
        }}
        onSubmit={(s) => {
          void closePicker();
          // Composited PNG already includes every region rectangle and
          // its importance tag, so route through `visionWithImage` rather
          // than asking the backend to re-crop a single rect.
          handleVisionImage(s.prompt, s.imageBase64);
        }}
        onGenerateVariant={(prompt, size) => {
          void closePicker();
          void handleImagePrompt(prompt, size);
        }}
      />
    </>
  );
}

function TopBar(props: {
  mode: string;
  hasKey: boolean;
  listenEnabled: boolean;
  listenReady: boolean;
  listening: boolean;
  heard: boolean;
  onToggleListen: () => void;
  onToggleSettings: () => void;
  onToggleWizard: () => void;
  onReset: () => void;
  onQuit: () => void;
  autoWatch: boolean;
  autoWatchAvailable: boolean;
  onToggleAutoWatch: () => void;
  relationship: RelationshipState | null;
  showRelationshipBadge: boolean;
}) {
  useLocale(); // re-render on language change
  const listenIcon = props.heard ? "👂•" : "👂";
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
      }}
    >
      <span
        style={{
          padding: "3px 8px",
          borderRadius: 8,
          background: "rgba(20,20,28,0.7)",
          opacity: 0.85,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
        title={props.hasKey ? t("topbar.key_saved") : t("topbar.no_key")}
      >
        {props.mode}
        {!props.hasKey && props.mode !== "local" && " ⚠"}
      </span>
      {props.showRelationshipBadge && props.relationship && (
        <RelationshipBadge state={props.relationship} />
      )}
      <button
        onClick={props.onToggleListen}
        disabled={!props.listenReady}
        style={iconBtnStyle(props.listening)}
        title={
          !props.listenReady
            ? t("topbar.listen.tip_setup")
            : props.listening
            ? t("topbar.listen.tip_listening")
            : t("topbar.listen.tip_idle")
        }
      >
        {listenIcon}
      </button>
      <button
        onClick={props.onToggleAutoWatch}
        disabled={!props.autoWatchAvailable}
        style={iconBtnStyle(props.autoWatch)}
        title={
          !props.autoWatchAvailable
            ? t("topbar.watch.tip_setup")
            : props.autoWatch
            ? t("topbar.watch.tip_on")
            : t("topbar.watch.tip_off")
        }
      >
        👁
      </button>
      <button onClick={props.onReset} style={iconBtn} title={t("topbar.reset")}>
        ↺
      </button>
      <button onClick={props.onToggleWizard} style={iconBtn} title={t("topbar.downloads")}>
        ⬇
      </button>
      <button onClick={props.onToggleSettings} style={iconBtn} title={t("topbar.settings")}>
        ⚙
      </button>
      <button onClick={props.onQuit} style={iconBtn} title={t("topbar.quit")}>
        ✕
      </button>
    </div>
  );
}

function RelationshipBadge({ state }: { state: RelationshipState }) {
  useLocale();
  const meta = STAGE_LABELS[state.stage];
  const stages = Object.keys(STAGE_LABELS) as (keyof typeof STAGE_LABELS)[];
  const idx = stages.indexOf(state.stage);
  const thresholds = [0, 50, 150, 300, 500, 750, 1000];
  const lo = thresholds[idx] ?? 0;
  const hi = thresholds[idx + 1] ?? state.score + 1;
  const pct = Math.max(0, Math.min(1, (state.score - lo) / (hi - lo))) * 100;
  const stageName = t(`stage.${state.stage}` as any);
  return (
    <span
      title={`${stageName} · ${t("rel.score", { score: state.score })} · ${t("rel.interactions", { count: state.total_interactions, streak: state.daily_streak })}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 8,
        background: "rgba(20,20,28,0.7)",
        fontSize: 11,
      }}
    >
      <span>{meta.emoji}</span>
      <span style={{ opacity: 0.95 }}>{stageName}</span>
      <span
        style={{
          width: 28,
          height: 4,
          borderRadius: 2,
          background: "rgba(255,255,255,0.18)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            position: "absolute",
            inset: 0,
            width: `${pct}%`,
            background: "rgba(255,255,255,0.55)",
          }}
        />
      </span>
    </span>
  );
}

const iconBtn: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(20,20,28,0.7)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

/** Same neutral icon button, with a subtle white border when "active". */
function iconBtnStyle(active: boolean): React.CSSProperties {
  return {
    ...iconBtn,
    border: active ? "1px solid rgba(255,255,255,0.55)" : iconBtn.border,
  };
}
