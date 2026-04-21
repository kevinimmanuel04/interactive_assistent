# Komorebi

Кроссплатформенный (Windows-first, macOS далее) виртуальный ассистент с анимированным аниме-аватаром и гибридным Local/Cloud AI.

## Стек

- **Core:** Tauri 2 (Rust) + React + Vite + TypeScript
- **Avatar:** Live2D через PIXI.js (Phase 2)
- **Local LLM:** llama.cpp через FFI (`llama-cpp-2`) — Llama 3.2 / Phi-3.5 (GGUF)
- **Cloud:** OpenRouter (Claude, GPT-4o)
- **Voice:** Whisper.cpp (STT) + Piper (TTS) + openWakeWord
- **Платформы MVP:** Windows 10/11

## Структура

```
src/                          # React UI
src-tauri/                    # Rust backend (Tauri)
  src/                        # main.rs, lib.rs
  crates/
    llm/                      # llama.cpp FFI
    cloud/                    # OpenRouter client
    router/                   # Local vs Cloud vs Skill
    voice/                    # STT/TTS/VAD/WakeWord
    skills/                   # System integrations
    storage/                  # SQLite, keyring, config
  capabilities/               # Tauri permissions
  tauri.conf.json
models/                       # Downloaded on first run (gitignored)
```

## Разработка

```powershell
pnpm install
pnpm tauri dev
```

Требуется:
- Rust stable
- Node 20+, pnpm 9+
- Windows: Visual Studio Build Tools (C++) + WebView2 Runtime

### Локальный LLM (опционально)

Реальная интеграция llama.cpp живёт за Cargo feature `local-llm`. Сборка с ней требует C++-тулчейна и CMake:

- **Windows:** Visual Studio Build Tools 2022 с "Desktop development with C++" + CMake
- **Linux:** `cmake`, `clang`, `libclang-dev`
- **macOS:** Xcode Command Line Tools + `brew install cmake`

Запуск:
```powershell
pnpm tauri dev -- --features local-llm
# или для чистой проверки:
cd src-tauri; cargo check -p komorebi-llm --features local-llm
```

Без этого флага приложение использует заглушку для локального движка и маршрутизирует запросы на OpenRouter.

## Роадмап

- **Phase 0** — Скелет проекта, overlay-окно, hotkey Alt+Space. ✓
- **Phase 1 (MVP)** — Локальный LLM (FFI), OpenRouter, Piper TTS, авто-скачивание моделей.
- **Phase 2** — Live2D, Whisper STT, VAD, lip-sync, wake word.
- **Phase 3** — System skills (громкость, скриншот, плеер, буфер), RAG по локальным файлам, emotion detection.
- **Phase 4** — NSIS installer, auto-updater, code signing, macOS `.dmg`.

Полный план и решения — в `TZ.md`.

## Лицензия

Apache-2.0 OR MIT (код). Live2D Cubism SDK — см. EULA Live2D Inc.
