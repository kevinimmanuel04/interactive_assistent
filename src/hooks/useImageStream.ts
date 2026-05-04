import { useEffect, type MutableRefObject } from "react";
import { avatarState } from "../avatarState";
import { onImage, type ImageEvent } from "../api";

type ImageStatus = "generating" | "done" | "error" | null;

/**
 * Bridges the backend `image:*` event stream onto the chat bubble's
 * image preview area, and best-effort copies the finished PNG to the
 * system clipboard.
 *
 * `activeImageIdRef` is the id returned by `generateImage`; we ignore
 * events for any other id (e.g. an older cancelled run). `activeIdRef`
 * is the shared chat-turn sentinel — cleared on done/error so the bubble
 * machinery doesn't think a chat turn is still in flight.
 */
export function useImageStream(opts: {
  activeImageIdRef: MutableRefObject<string | null>;
  activeIdRef: MutableRefObject<string | null>;
  setImageStatus: (s: ImageStatus) => void;
  setImageError: (s: string | null) => void;
  setImageBase64: (s: string | null) => void;
  setImageSavePath: (s: string | null) => void;
  setThinking: (v: boolean) => void;
}): void {
  const {
    activeImageIdRef,
    activeIdRef,
    setImageStatus,
    setImageError,
    setImageBase64,
    setImageSavePath,
    setThinking,
  } = opts;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
