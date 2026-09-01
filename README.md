# 🌸 April — Virtual Desktop Assistant & AI Companion

<p align="center">
  <img src="public/app-icon.png" width="120" height="120" alt="April Logo" style="border-radius: 24px;" />
</p>

<p align="center">
  <b>April</b> is an interactive virtual assistant desktop application built with <b>Tauri 2.0</b>, <b>Rust</b>, <b>React</b>, <b>Three.js 3D VRM</b>, and <b>Live2D</b>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2.0-blue.svg?style=flat-square&logo=tauri" alt="Tauri" />
  <img src="https://img.shields.io/badge/React-v19.0-61dafb.svg?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-blue.svg?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Rust-2021-orange.svg?style=flat-square&logo=rust" alt="Rust" />
  <img src="https://img.shields.io/badge/Platform-Windows-0078D6.svg?style=flat-square&logo=windows" alt="Windows" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg?style=flat-square" alt="License" />
</p>

---

## 📥 How to Download & Install

### Step 1: Download the Installer
Go to the **[Releases Page](https://github.com/kevinimmanuel04/interactive_assistent/releases/latest)** and download the latest Windows setup installer:
- 📦 **`April_2.0.10_x64-setup.exe`** (Recommended)
- 📦 **`April_2.0.10_x64_en-US.msi`** (Alternative MSI package)

### Step 2: Install April
1. Double-click **`April_2.0.10_x64-setup.exe`**.
2. If Windows SmartScreen displays a warning, click **"More info"** → **"Run anyway"**.
3. Follow the setup wizard to complete installation.

### Step 3: Launch
Once installed, launch April directly from your **Desktop Shortcut** or **Start Menu**!

---

## 🔄 How Updates Work & Checking for Updates

April includes built-in update detection so you always stay up to date:

1. **Automatic Update Detection**:
   When you open April, the app connects to GitHub Releases to check if a newer version is available. If an update is found, a prompt will appear letting you update with one click.

2. **Manual Update Check**:
   - Open **Settings** (⚙️ icon in the top right).
   - Scroll to **App Version & Updates**.
   - Click **"Check for Updates"**.

3. **Manual Re-installation**:
   You can also visit the [Releases Page](https://github.com/kevinimmanuel04/interactive_assistent/releases/latest) anytime to download the newest `.exe` installer. Running the new installer will automatically upgrade your existing installation without deleting your preferences!

---

## ✨ Key Features

- 🎭 **Interactive 3D VRM & Live2D Avatar**:
  - Full 360° mouse tracking (head pitch/yaw & eye gaze).
  - Dynamic hair & ribbon sway physics when rotating the avatar.
  - Interactive VRMA motion animations ("Looking Around after rotation", Spin, Peace sign, Blush, Jump, etc.).
- 💬 **Smart Dual Chat Engine**:
  - Full-screen ChatGPT-style interface + compact desktop widget.
  - Hybrid LLM streaming (OpenRouter, Gemini, Pollinations free tier, local models).
  - Character personalities with custom personas.
- 🖼️ **AI Image Generation & Inspector**:
  - Generate high-quality AI images inside chat.
  - Image Inspector with full-screen preview, high-res download, and prompt remix editing.
- 🎙️ **Voice & Lip-Sync**:
  - Real-time ElevenLabs TTS & EdgeTTS speech synthesis.
  - Precise mouth lip-sync animation synchronized to audio output.
  - Hands-free 24/7 "Hey April" voice activation toggle.
- 🎯 **Region Screen Inspector**:
  - Select and capture region snapshots on your screen for AI vision analysis.

---

## ⚙️ Initial Setup & API Keys

April works right out of the box with free AI providers. For premium features:

1. Open **Settings** (⚙️ icon).
2. Enter optional keys:
   - **OpenRouter API Key**: For access to GPT-4o, Claude 3.5, DeepSeek, and Gemini.
   - **ElevenLabs API Key & Voice ID**: For hyper-realistic AI voice synthesis.

---

## 💻 Developer Guide & Building from Source

### Prerequisites
- **[Node.js](https://nodejs.org/)** (v20+)
- **[pnpm](https://pnpm.io/)**
- **[Rust Toolchain](https://www.rust-lang.org/tools/install)**
- **[C++ Build Tools for Windows](https://v2.tauri.app/start/prerequisites/)**

### Development Mode
```bash
# Install dependencies
pnpm install

# Launch Tauri Dev Environment
pnpm tauri dev
```

### Build `.exe` Standalone Installer
```bash
pnpm tauri build
```
Output location:
`src-tauri/target/release/bundle/nsis/April_2.0.10_x64-setup.exe`

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.
