import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import CloseButton from "./CloseButton";

interface Props {
  imageUrl: string | null;
  promptText?: string;
  onClose: () => void;
  onEditPrompt?: (newPrompt: string) => void;
}

export default function ImageModal({ imageUrl, promptText, onClose, onEditPrompt }: Props) {
  const [downloadState, setDownloadState] = useState<"idle" | "downloading" | "completed">("idle");
  const [_savedFilePath, setSavedFilePath] = useState<string | null>(null);
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null);

  if (!imageUrl) return null;

  const handleDownload = async () => {
    if (downloadState === "downloading") return;
    if (downloadState === "completed") {
      // If completed, clicking "Open" opens the Downloads folder
      try {
        await invoke("open_folder_or_file_cmd", { target: "Downloads" });
      } catch {
        // fallback
      }
      return;
    }

    setDownloadState("downloading");
    setDownloadMsg("Saving to Downloads...");

    try {
      let base64Data = "";
      const fileName = `April_Image_${Date.now()}.png`;

      if (imageUrl.startsWith("data:")) {
        base64Data = imageUrl.split(",")[1] || "";
      } else {
        // Fetch remote image securely as blob
        const res = await fetch(imageUrl);
        const blob = await res.blob();
        base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const resStr = reader.result as string;
            resolve(resStr.split(",")[1] || "");
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }

      // 1. Invoke Tauri backend to save directly to Downloads folder
      let savedSuccess = false;
      try {
        if (base64Data) {
          const savedPath = await invoke<string>("save_generated_image", {
            pngBase64: base64Data,
            targetPath: fileName,
          });
          setSavedFilePath(savedPath || fileName);
          setDownloadMsg(`✓ Saved to Downloads (${fileName})`);
          savedSuccess = true;
        }
      } catch (err) {
        console.warn("[ImageModal] Native save error, falling back to local blob:", err);
      }

      // 2. Also trigger safe local blob download as secondary assurance
      if (!savedSuccess && base64Data) {
        const byteChars = atob(base64Data);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteNumbers[i] = byteChars.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "image/png" });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
        setDownloadMsg(`✓ Saved image (${fileName})`);
      }

      // Match the 3.5s animation duration to show "Open"
      setTimeout(() => {
        setDownloadState("completed");
      }, 3500);
    } catch (e) {
      setDownloadMsg(`⚠ Error: ${String(e)}`);
      setDownloadState("idle");
    }
  };

  const handleRemix = () => {
    if (onEditPrompt) {
      const base = promptText ? promptText.trim() : "this";
      onEditPrompt(`Generate an image of ${base}, modified: `);
    }
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          background: "rgba(8, 8, 16, 0.88)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <motion.div
          initial={{ scale: 0.92, y: 12 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.92, y: 12 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "relative",
            maxWidth: "90vw",
            maxHeight: "90vh",
            background: "rgba(22, 22, 32, 0.96)",
            border: "1px solid rgba(255, 255, 255, 0.14)",
            borderRadius: 16,
            boxShadow: "0 24px 48px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Clean Modern Header Bar (No Emojis) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 18px",
              background: "rgba(0, 0, 0, 0.35)",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#a78bfa"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
              <span
                style={{
                  color: "#f4f4f5",
                  fontWeight: 600,
                  fontSize: 13.5,
                  letterSpacing: "0.2px",
                }}
              >
                Image Preview
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "2px 7px",
                  borderRadius: 10,
                  background: "rgba(139, 92, 246, 0.16)",
                  color: "#c4b5fd",
                  border: "1px solid rgba(139, 92, 246, 0.28)",
                  letterSpacing: "0.4px",
                }}
              >
                High-Res
              </span>
            </div>

            <CloseButton onClick={onClose} title="Close Preview" size={30} />
          </div>

          {/* Image Display */}
          <div
            style={{
              overflow: "auto",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              padding: 16,
              background: "radial-gradient(circle at center, rgba(30, 30, 46, 0.5) 0%, rgba(12, 12, 18, 0.8) 100%)",
            }}
          >
            <img
              src={imageUrl}
              alt="Preview"
              style={{
                maxWidth: "100%",
                maxHeight: "65vh",
                objectFit: "contain",
                borderRadius: 10,
                boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
              }}
            />
          </div>

          {/* Bottom Action Bar */}
          <div
            style={{
              padding: "12px 18px",
              background: "rgba(0, 0, 0, 0.45)",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 140 }}>
              {downloadMsg && (
                <span style={{ color: "#34d399", fontSize: 12, fontWeight: 600 }}>
                  {downloadMsg}
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* New Modern Animated Edit Button (Rotating Pencil & Underline) */}
              <button
                type="button"
                className="editBtn"
                onClick={handleRemix}
                title="Edit / Remix Image"
              >
                <svg height="1em" viewBox="0 0 512 512">
                  <path d="M410.3 231l11.3-11.3-33.9-33.9-62.1-62.1L291.7 89.8l-11.3 11.3-22.6 22.6L58.6 322.9c-10.4 10.4-18 23.3-22.2 37.4L1 480.7c-2.5 8.4-.2 17.5 6.1 23.7s15.3 8.5 23.7 6.1l120.3-35.4c14.1-4.2 27-11.8 37.4-22.2L387.7 253.7 410.3 231zM160 399.4l-9.1 22.7c-4 3.1-8.5 5.4-13.3 6.9L59.4 452l23-78.1c1.4-4.9 3.8-9.4 6.9-13.3l22.7-9.1v32c0 8.8 7.2 16 16 16h32zM362.7 18.7L348.3 33.2 325.7 55.8 314.3 67.1l33.9 33.9 62.1 62.1 33.9 33.9 11.3-11.3 22.6-22.6 14.5-14.5c25-25 25-65.5 0-90.5L453.3 18.7c-25-25-65.5-25-90.5 0zm-47.4 168l-144 144c-6.2 6.2-16.4 6.2-22.6 0s-6.2-16.4 0-22.6l144-144c6.2-6.2 16.4-6.2 22.6 0s6.2 16.4 0 22.6z" />
                </svg>
              </button>

              {/* Animated Download Switch Component */}
              <div className="uiverse-download-wrapper">
                <div className="container">
                  <div
                    className={`dl-switch-label ${
                      downloadState === "downloading"
                        ? "is-downloading"
                        : downloadState === "completed"
                        ? "is-completed"
                        : ""
                    }`}
                    onClick={handleDownload}
                    role="button"
                    tabIndex={0}
                  >
                    <span className="dl-switch-circle">
                      {downloadState === "completed" ? (
                        <svg
                          className="dl-switch-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : downloadState === "downloading" ? (
                        <svg
                          className="dl-switch-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="12" y1="2" x2="12" y2="6" />
                          <line x1="12" y1="18" x2="12" y2="22" />
                          <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                          <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                          <line x1="2" y1="12" x2="6" y2="12" />
                          <line x1="18" y1="12" x2="22" y2="12" />
                          <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
                          <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                        </svg>
                      ) : (
                        <svg
                          className="dl-switch-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 19V5m0 14-4-4m4 4 4-4" />
                        </svg>
                      )}
                    </span>
                    <span className="dl-switch-title">
                      {downloadState === "completed" ? "Open" : "Download"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
