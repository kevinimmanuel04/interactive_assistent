import { getActiveCharacter } from "../../../utils/characters";

interface ManualItem {
  icon: string;
  badge: string;
  title: string;
  subtitle: string;
  details: Array<{ icon: string; title: string; text: string }>;
  proTip: string;
}

export default function UserManualSection() {
  const activeChar = getActiveCharacter();

  const manualItems: ManualItem[] = [
    {
      icon: "🎭",
      badge: "3D Companions",
      title: "Change 3D Characters",
      subtitle: "Switch models, custom voices & dynamic personas",
      details: [
        {
          icon: "🌸",
          title: "3 Built-In Models",
          text: "Choose between April (Cyberpunk AI), Yvette (Maid), or Chang-Li (Counselor) in the Characters tab.",
        },
        {
          icon: "🔄",
          title: "Dynamic Identity",
          text: `Current character is ${activeChar.name}. Name, persona, and wake words update automatically.`,
        },
        {
          icon: "📐",
          title: "Scale & Rotate Switch",
          text: "Use dock toggle to switch between moving window and spinning 3D avatar. Adjust scale in settings.",
        },
      ],
      proTip: "Click the hamburger switch on the bottom dock to rotate her in full 3D!",
    },
    {
      icon: "✨",
      badge: "Animations & Emotes",
      title: "Double-Click Animations",
      subtitle: "Double-click her directly to trigger dance & emotes",
      details: [
        {
          icon: "💃",
          title: "Instant Reactions",
          text: "Double-click anywhere on the 3D avatar on your desktop to trigger lively dance moves and cute poses.",
        },
        {
          icon: "🌟",
          title: "Random Animation Clips",
          text: "Cycles through custom dance routines, cheerful waves, greetings, and playful cat gestures.",
        },
        {
          icon: "👀",
          title: "Interactive Expressions",
          text: "Accompanied by facial smile morphs, natural eye blinks, and dynamic spring bone hair physics.",
        },
      ],
      proTip: "Double-click her anytime while listening to music or chatting to see her dance!",
    },
    {
      icon: "🎙️",
      badge: "Voice & Speech",
      title: "Make Her Talk & Voice Mode",
      subtitle: "24/7 hands-free speech recognition & auto-voice",
      details: [
        {
          icon: "⚡",
          title: "Wake Call Activation",
          text: `Say "Hey ${activeChar.name}" or "${activeChar.name}" out loud to wake her hands-free 24/7.`,
        },
        {
          icon: "🗣️",
          title: "Real-Time Typing",
          text: "Your spoken speech appears in real-time right inside the bottom dock bar.",
        },
        {
          icon: "🔊",
          title: "Auto-Reply Voice",
          text: "She synthesizes every reply back with ElevenLabs high-fidelity human speech.",
        },
      ],
      proTip: "Click the glowing Energy Orb on the dock for instant push-to-talk voice mode!",
    },
    {
      icon: "🚀",
      badge: "Desktop Automation",
      title: "App Opener, Search & Typer",
      subtitle: "Direct OS commands for apps, web & typing",
      details: [
        {
          icon: "📂",
          title: "App & Folder Opener",
          text: 'Say "Open Chrome", "Launch Spotify", "Open Notepad", or "Open Downloads Folder" to start anything.',
        },
        {
          icon: "🌐",
          title: "Instant Web Searcher",
          text: 'Say "Search for [topic]" or "Google [query]" to automatically launch your default browser with results.',
        },
        {
          icon: "⌨️",
          title: "Automated Typer",
          text: 'Say "Type [message]" or "Type for me [text]" to have her type directly into your active window or input bar.',
        },
      ],
      proTip: "These OS automation commands execute instantly without any cloud API latency!",
    },
    {
      icon: "🔑",
      badge: "Keys & Customization",
      title: "API Keys, Voice & Persona",
      subtitle: "Configure AI providers, ElevenLabs & nickname",
      details: [
        {
          icon: "🧠",
          title: "OpenCode Zen / OpenRouter",
          text: "Paste your API key in Keys & Voice tab to unlock 60+ ultra-fast AI models.",
        },
        {
          icon: "🎙️",
          title: "ElevenLabs Voice & Wheel",
          text: "Enter your ElevenLabs secret key and Voice ID, or rotate the 3D voice wheel to pick a voice.",
        },
        {
          icon: "🏷️",
          title: "Custom Nickname",
          text: "Change what she calls you in the Features tab; her conversation style personalizes to you.",
        },
      ],
      proTip: "Use OpenCode Zen models for fast replies with zero rate-limit hassles!",
    },
    {
      icon: "💬",
      badge: "Chat Workspace",
      title: "Using the Chat Window",
      subtitle: "Full-screen AI workspace for complex tasks",
      details: [
        {
          icon: "🚀",
          title: "Open Workspace",
          text: "Click the Chat History icon on the dock or the Energy Orb to open the comprehensive chat window.",
        },
        {
          icon: "💻",
          title: "What You Can Do",
          text: "Ask coding questions, write software, solve math problems, draft documents, and brainstorm ideas.",
        },
        {
          icon: "⌨️",
          title: "Sidebar & Shortcuts",
          text: "Press Ctrl + B to toggle session sidebar. Press Enter to send, Shift + Enter for new lines.",
        },
      ],
      proTip: "Click the animated paper shredder icon to cleanly wipe and reset chat history!",
    },
    {
      icon: "🎨",
      badge: "Multimodal Power",
      title: "AI Images & Model Switching",
      subtitle: "File attachments, image generation & commands",
      details: [
        {
          icon: "🖼️",
          title: "AI Image Generation",
          text: 'Say "Generate an image of [prompt]" in chat to create digital artwork on demand.',
        },
        {
          icon: "📎",
          title: "File & Image Attachments",
          text: "Attach screenshots, PDFs, code files, and photos for immediate multi-modal analysis.",
        },
        {
          icon: "🔄",
          title: "In-Chat Model Switch",
          text: 'Type "switch to gemini-3.5-flash" or "use claude-sonnet-4-5" directly in chat to change models instantly.',
        },
      ],
      proTip: "Drag her window anywhere across multi-monitor setups; click '−' to minimize to taskbar!",
    },
  ];

  return (
    <div className="user-manual-section">
      <div className="user-manual-header">
        <h2 className="user-manual-title">📖 Interactive Assistant User Manual</h2>
        <p className="user-manual-subtitle">
          Hover over any card below to reveal complete guides, voice commands, animations, and pro-tips!
        </p>
      </div>

      <div className="manual-grid">
        {manualItems.map((item, idx) => (
          <div key={idx} className="manual-package">
            <div className="manual-card">
              {/* Front View (Shown when idle) */}
              <div className="manual-front">
                <span className="manual-badge">{item.badge}</span>
                <div className="manual-icon">{item.icon}</div>
                <h3 className="manual-card-title">{item.title}</h3>
                <p className="manual-card-desc">{item.subtitle}</p>
                <div className="manual-hint-pill">
                  <span>Hover to View Guide</span>
                  <span className="manual-hint-arrow">➜</span>
                </div>
              </div>

              {/* Back View (Revealed when hovered on glowing neon gradient) */}
              <div className="manual-back">
                <div className="manual-back-header">
                  <span className="manual-back-icon">{item.icon}</span>
                  <h4 className="manual-back-title">{item.title}</h4>
                </div>

                <div className="manual-back-list">
                  {item.details.map((d, dIdx) => (
                    <div key={dIdx} className="manual-back-item">
                      <span className="manual-item-bullet">{d.icon}</span>
                      <div className="manual-item-text">
                        <strong>{d.title}: </strong>
                        <span>{d.text}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="manual-back-tip">
                  <span className="manual-tip-tag">PRO TIP</span>
                  <p className="manual-tip-text">{item.proTip}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
