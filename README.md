# Komorebi

> An anime-avatar virtual assistant that lives on your desktop — local by default, cloud when you need it, with eyes, ears, and hands.

![status](https://img.shields.io/badge/status-v1.0.0-blue)
![license](https://img.shields.io/badge/license-Apache--2.0%20OR%20MIT-informational)
![platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![stack](https://img.shields.io/badge/stack-Tauri%202%20%7C%20Rust%20%7C%20React-orange)

Komorebi is a desktop companion built around a Live2D avatar that can **see your screen, hear you, talk back, and take real actions** on your machine when you ask it to. It is designed to run fully offline with local models (llama.cpp, Piper, Whisper) and to fall back to OpenRouter cloud models when you want extra power — with a smart router that picks between them automatically.

Think of it as a cute, always-on pair-programmer / study buddy / game-coach that lives in your system tray.

---

## Table of contents

- [Highlights](#highlights)
- [Screenshots & concept](#screenshots--concept)
- [Architecture](#architecture)
- [Feature tour](#feature-tour)
- [Installing from a release](#installing-from-a-release)
- [Developer setup](#developer-setup)
- [Configuration](#configuration)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Desktop automation & safety](#desktop-automation--safety)
- [Privacy](#privacy)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Highlights

- **Anime avatar, not a chat box.** A Live2D model (Cubism 2 + Cubism 4 both supported) with blinking, eye-tracking, tap-to-react motions, emotion-driven expressions, and proper lip-sync tied to the active voice.
- **Dual LLM routing.** Local models via `llama.cpp` (GGUF) for privacy/offline, OpenRouter for frontier quality, plus a small classifier that auto-picks the best backend per message.
- **Two TTS engines, plus cloud.** [Piper](https://github.com/rhasspy/piper) (fast, local, MIT) and [GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS) (HTTP voice cloning) for offline use, **OpenRouter audio models** (`openai/gpt-4o-audio-preview`, `openai/gpt-audio`, …) for cloud TTS with selectable voices. Prosody (pitch, speed, noise) and volume are fully tunable from the UI.
- **Four STT backends.** Bundled **Whisper.cpp** (offline, free), self-hosted **Faster-Whisper** server (~4× faster, free, fully offline), **OpenRouter** audio models (cloud, generic), and **Deepgram Nova-3** (cloud, ~$0.004/min — cheapest realtime tier). Picks one transparently per the order Deepgram → Faster-Whisper → OpenRouter → local Whisper.
- **RAG over your folders.** Drop in directories; Komorebi indexes them locally (SQLite + embeddings) and cites them when answering.
- **Desktop automation.** Screenshots, cursor control, keyboard input, process / active-window awareness, and sandboxed file read/write — exposed both as Tauri commands and as LLM-callable tools.
- **Proactive agent.** Opt-in background loop that notices when you've been idle, when you've opened a game, when you've been stuck in an IDE — and offers help instead of waiting to be asked.
- **Tray-first.** Closing the window hides to tray; left-click toggles; menu has Show/Hide and a proper Quit.
- **Single binary release** for Windows (NSIS), macOS (Intel + Apple Silicon, DMG), and Linux (AppImage + .deb) built by GitHub Actions on every tag.

---

## Screenshots & concept

The avatar floats on top of everything, draggable and pinnable. Clicking its head or body plays a short motion and speaks a localized reaction (`ru` / `ja` / `zh` / `en`). Chat opens as a side panel; the avatar's mouth animates in sync with whichever voice (Piper or SoVITS) is active.

> *(Add your own screenshots under `docs/screenshots/` and reference them here.)*

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Frontend (React + Vite)                    │
│   Live2D canvas · chat panel · settings · voice controls · RAG UI   │
└────────────────────────────────────┬────────────────────────────────┘
                                     │  Tauri IPC (invoke / events)
┌────────────────────────────────────▼────────────────────────────────┐
│                     Rust core (komorebi / tauri 2)                  │
│                                                                     │
│   ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌────────────────┐   │
│   │   chat    │  │  router   │  │ proactive │  │  desktop cmds  │   │
│   │  service  │◀▶│  (local/  │  │   loop    │  │  + tool dispat │   │
│   │           │  │  cloud)   │  │           │  │                │   │
│   └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └───────┬────────┘   │
│         ▼              ▼              ▼                ▼            │
│   ┌──────────┐  ┌────────────┐  ┌───────────┐  ┌───────────────┐    │
│   │  voice   │  │    llm     │  │  storage  │  │    desktop    │    │
│   │ (piper,  │  │ (llama.cpp │  │  (RAG:    │  │   (xcap,      │    │
│   │  sovits, │  │  + openrou │  │   sqlite+ │  │   enigo,      │    │
│   │  whisper)│  │   ter)     │  │   embeds) │  │   sysinfo)    │    │
│   └──────────┘  └────────────┘  └───────────┘  └───────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

Workspace layout:

```
src/                        # React UI
src-tauri/
  src/                      # Tauri commands, chat, settings, proactive, tools
  crates/
    llm/                    # llama.cpp wrapper (feature: local-llm)
    cloud/                  # OpenRouter client
    router/                 # Local-vs-cloud classifier
    voice/                  # Piper TTS, SoVITS TTS, Whisper STT
    storage/                # RAG index (sqlite + embeddings)
    skills/                 # Pluggable skill system
    desktop/                # Screenshots, input, processes, sandboxed files
.github/workflows/          # CI + release matrix
```

---

## Feature tour

### LLM routing

- **Local mode** — GGUF model via `llama.cpp` (feature `local-llm`). Configure the path and GPU-layer count in Settings.
- **Cloud mode** — any OpenRouter model. Paste your key once; the model picker shows live pricing.
- **Smart mode** — a tiny classifier model decides local vs. cloud per message (fast chit-chat stays local; long reasoning goes to the frontier).

### Voice

TTS engines:

| Engine             | Kind        | Strengths                                                |
|--------------------|-------------|----------------------------------------------------------|
| Piper              | Local TTS   | Instant, offline, tiny footprint                         |
| GPT-SoVITS         | HTTP TTS    | Voice cloning, any supported language                    |
| OpenRouter audio   | Cloud TTS   | `openai/gpt-4o-audio-preview` etc., 11 selectable voices |

STT engines (selection priority highest → lowest, first enabled wins):

| Engine             | Kind                | Strengths                                                  |
|--------------------|---------------------|------------------------------------------------------------|
| Deepgram Nova-3    | Cloud STT           | Best accuracy, ~$0.004/min, near-realtime, 30+ languages   |
| Faster-Whisper     | Self-hosted local   | ~4× faster than bundled Whisper, free, fully offline      |
| OpenRouter STT     | Cloud STT           | Any audio-input LLM (`gpt-4o-audio`, `gemini-2.5-flash`, …) |
| Whisper.cpp        | Bundled local STT   | Offline transcription, wake-word, auto-listen              |

Features shared across STT: wake-word + push-to-talk, continuous-listen with VAD, per-device audio I/O selection. The Settings panel filters OpenRouter model dropdowns to only show audio-capable models, lets you paste & validate a Deepgram key, and can ping the Faster-Whisper server to confirm reachability.

All prosody knobs (length scale, noise, noise-w) and a master volume slider are live-applied to both local engines.

### Live2D avatar

- Cubism **2**, **4**, and **5** runtimes, all first-class. `.model3.json` files exported from Cubism Editor 5 load through the same path as Cubism 4 (the SDK Core 5.x is backward compatible).
- Komorebi ships with **`mao_pro`** as the default Cubism 5 model under `public/live2d/mao_pro/` — no manual download needed for first run.
- Runtime-specific parameter maps (`PARAM_MOUTH_OPEN_Y` vs `ParamMouthOpenY`, etc).
- Random blink (2.5–6.5 s), pointer-based eye-tracking.
- **Tap to react**: head taps and body taps pick different motion groups and canned voice lines (ru / ja / zh / en).
- **Emotion → motion** fallback for models without expression files (e.g., the legacy Shizuku Cubism 2 sample).
- Draggable, pin-to-edge, resizable; empty space around the avatar is click-through so your desktop still works.

### RAG

Add folders in Settings → RAG. Files are chunked, embedded, and stored in `app_data_dir/rag.db`. Queries are answered with inline citations.

### Desktop automation

Exposed Tauri commands (also callable by the LLM via the tool layer):

| Command                  | Purpose                                      |
|--------------------------|----------------------------------------------|
| `desktop_screenshot`     | Full-screen PNG of a monitor                 |
| `desktop_screenshot_region` | Sub-rectangle PNG                         |
| `desktop_list_screens`   | Enumerate monitors                           |
| `desktop_click`          | Click at `(x, y)` with left/right/middle/double |
| `desktop_move_cursor`    | Absolute cursor move                         |
| `desktop_type`           | Type arbitrary Unicode text                  |
| `desktop_key`            | Press a key or chord (`Ctrl+Shift+P`)        |
| `desktop_scroll`         | Vertical / horizontal scroll                 |
| `desktop_top_processes`  | Top-CPU process list, classified             |
| `desktop_active_window`  | Title + process of the foreground window     |
| `desktop_context_snapshot` | `{is_gaming, active_window, top_processes}` |
| `desktop_{read,write,list}` | Sandboxed filesystem under a workspace dir |
| `run_tool`               | JSON-driven dispatcher used by the LLM       |

### Proactive agent

When **Proactive mode** is enabled (off by default), a background task polls every ~30 s:

- If you've been idle ≥ 3 min *and* a game is running → offers tips / break reminders.
- In an IDE for a long time with no activity → offers help.
- Browsing for a while → offers to summarize.
- Long general idle → gentle "I'm still here" ping.

Cooldown is 10 minutes between nudges. Hints are emitted as `proactive:suggest` Tauri events the frontend surfaces through the avatar's voice and chat bubble.

---

## Installing from a release

1. Go to [Releases](../../releases).
2. Download the bundle for your OS:
   - **Windows** — `Komorebi_1.0.0_x64-setup.exe` (NSIS).
   - **macOS Apple Silicon** — `Komorebi_1.0.0_aarch64.dmg`.
   - **macOS Intel** — `Komorebi_1.0.0_x64.dmg`.
   - **Linux** — `Komorebi_1.0.0_amd64.AppImage` or `.deb`.
3. Launch. On first run, open Settings to:
   - point Komorebi at a GGUF model (optional, for local LLM),
   - paste an OpenRouter API key (optional, for cloud LLM, cloud TTS, and OpenRouter STT),
   - pick a TTS provider — Piper voice, SoVITS endpoint, or OpenRouter audio model + voice,
   - pick an STT provider — bundled Whisper, self-hosted Faster-Whisper, OpenRouter, or Deepgram.

### Optional STT providers

**Faster-Whisper** (free, fully offline once running):

```bash
# CPU
docker run -d -p 8000:8000 ghcr.io/speaches-ai/speaches:latest-cpu
# CUDA
docker run -d --gpus all -p 8000:8000 ghcr.io/speaches-ai/speaches:latest-cuda
```

In Settings → STT → "Use Faster-Whisper": enter the URL (`http://localhost:8000` by default), pick a model (`Systran/faster-whisper-base` is a good start; switch to `large-v3` for highest accuracy), and click **Test connection**.

**Deepgram** (cloud, $200 of free credits at sign-up):

1. Create a key at <https://console.deepgram.com>.
2. Settings → STT → Deepgram block: paste the key → **Save & test** (the app validates against `/v1/projects` before persisting).
3. Toggle the checkbox on. Pick `nova-3` (default) or `nova-2`, plus a language (`multi`, `en`, `ru`, …).
4. Use **Remove** to clear a saved key.

Updates are delivered via Tauri's updater (`latest.json` attached to every signed release).

---

## Developer setup

### Prerequisites

| Tool          | Version             | Notes                                       |
|---------------|---------------------|---------------------------------------------|
| Node          | 20+ (24 recommended)| Matches CI                                  |
| pnpm          | 9+                  | Used everywhere; `npm` / `yarn` not tested  |
| Rust          | stable 1.80+        | via `rustup`                                |
| CMake         | 3.20+               | Needed by `llama.cpp` and bundling          |
| Clang / LLVM  | any recent          | Only required for the `local-llm` feature   |
| Platform deps | see below           | Linux: `libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libasound2-dev patchelf` |

### Get started

```powershell
pnpm install
pnpm fetch:piper          # downloads the bundled Piper binary
pnpm tauri dev            # chat-only dev build (fastest)
pnpm tauri dev -- --features full   # with local-llm + stt
```

### Useful scripts

| Command                                                | What it does                                |
|--------------------------------------------------------|---------------------------------------------|
| `pnpm tauri dev`                                       | Run the app in dev mode                     |
| `pnpm tauri build`                                     | Release bundle (no local-llm)               |
| `pnpm tauri build -- --features full`                  | Full bundle (adds llama.cpp + whisper)      |
| `pnpm tauri build -- --profile release-fast`           | Faster local release iterations             |
| `pnpm tsc --noEmit`                                    | TypeScript typecheck                        |
| `cargo check --workspace --all-targets` (in `src-tauri/`) | Rust check across every crate            |

### Tests & checks the CI runs

- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets`
- `cargo test --workspace`
- `pnpm tsc --noEmit`
- Release job builds the full bundle on Windows, macOS (x64 + arm64), and Linux.

---

## Configuration

Settings persist in `tauri-plugin-store`. Most are editable from the Settings panel; here are the important keys:

| Key                          | Meaning                                         |
|------------------------------|-------------------------------------------------|
| `openrouter_api_key`         | OpenRouter bearer token                         |
| `openrouter_model`           | Chosen model id                                 |
| `local_model_path`           | GGUF path for llama.cpp                         |
| `llm_gpu_layers`             | Layers offloaded to GPU                         |
| `mode`                       | `local` / `cloud` / `smart`                     |
| `tts_provider`               | `piper`, `sovits`, or `openrouter`              |
| `tts_length`, `tts_noise`, `tts_noise_w`, `tts_volume` | Piper prosody + master vol     |
| `sovits_endpoint`, `sovits_ref_audio`, `sovits_prompt_text`, `sovits_prompt_lang`, `sovits_text_lang`, `sovits_speed` | SoVITS config |
| `piper_binary`, `piper_voice`| Paths                                           |
| `openrouter_tts_enabled`, `openrouter_tts_model`, `openrouter_tts_voice` | Cloud TTS via OpenRouter (PCM16 streaming, WAV-wrapped) |
| `whisper_model_path`         | Bundled Whisper GGML model                      |
| `openrouter_stt_enabled`, `openrouter_stt_model` | OpenRouter cloud STT (audio-input LLMs) |
| `faster_whisper_enabled`, `faster_whisper_url`, `faster_whisper_model`, `faster_whisper_language` | Self-hosted [speaches / faster-whisper-server](https://github.com/speaches-ai/speaches) |
| `deepgram_api_key`, `deepgram_enabled`, `deepgram_model`, `deepgram_language` | Deepgram cloud STT (`nova-3` default) |
| `wake_word`                  | Optional wake phrase                            |
| `listen_enabled`, `auto_listen` | STT behavior                                 |
| `live2d_model_url`           | Live2D `model3.json` / `model.json`             |
| `rag_enabled`                | Toggle retrieval                                |
| `agent_workspace`            | Sandbox root for `desktop_{read,write,list}`    |
| `proactive_enabled`          | Background-agent opt-in                         |
| `desktop_automation_enabled` | Master switch for LLM-callable tools            |

---

## Keyboard shortcuts

| Shortcut      | Action                               |
|---------------|--------------------------------------|
| `Alt + Space` | Toggle the chat input (global)       |
| Tray left-click | Show / hide the window             |
| Tray → Quit   | Real exit (close button only hides)  |

---

## Desktop automation & safety

Letting an LLM move your mouse and type into your machine is powerful and dangerous. Komorebi takes a conservative approach:

1. **Off by default.** `desktop_automation_enabled` must be flipped on before the tool dispatcher (`run_tool`) executes anything.
2. **Filesystem sandbox.** `desktop_write_file` / `desktop_read_file` / `desktop_list_dir` canonicalize the target path and reject anything outside the configured `agent_workspace` (default: `<Documents>/Komorebi`).
3. **No silent elevation.** The assistant never runs with admin rights; only what your user session can already do is exposed.
4. **Confirmation hooks.** The frontend gates destructive tool calls behind explicit user approval — the Rust layer exposes primitives; policy lives in the UI.
5. **Kill switch.** Closing the tray's "Quit Komorebi" fully terminates the background loop and any pending input simulation.

Please audit the `src-tauri/crates/desktop/` crate before trusting the automation layer on sensitive machines.

---

## Privacy

- Local mode → no network calls for inference. Piper, Whisper, and llama.cpp all run on your machine.
- Cloud mode → prompts and responses go to OpenRouter only (no telemetry to the Komorebi authors).
- RAG index is a local SQLite file under the OS app-data dir.
- The updater fetches `latest.json` from your GitHub release page; it can be disabled by removing the updater plugin.

No analytics, no crash reporting, no "home-calling".

---

## Roadmap

- OCR + vision-aware tool calls (pass screenshot regions to the LLM).
- More skills: calendar, clipboard, browser control.
- Per-persona voice + motion packs.
- macOS + Linux active-window detection parity with Windows.
- Multi-avatar scenes.

Contributions welcome — see below.

---

## Contributing

1. Fork + branch off `main`.
2. Keep PRs focused; run `cargo fmt`, `cargo clippy`, `pnpm tsc --noEmit` before opening.
3. Add tests or a short manual-QA note for non-trivial behavior.
4. For new dependencies, prefer permissively-licensed crates (MIT / Apache-2.0 / BSD).

By contributing you agree to license your changes under Apache-2.0 OR MIT.

---

## License

Dual-licensed under **Apache-2.0 OR MIT**, at your option. Third-party models and voices ship under their own licenses — see each asset's upstream project.

Komorebi uses: Tauri 2, React, Vite, pixi.js, pixi-live2d-display-lipsyncpatch, llama.cpp, Whisper.cpp, Piper, GPT-SoVITS, xcap, enigo, sysinfo, rusqlite. Huge thanks to all of them.
