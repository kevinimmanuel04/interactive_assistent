import { useEffect, useState } from "react";
import { onModelProgress, type DownloadEvent } from "../../api";
import type { ProgressState } from "./styles";

/**
 * Subscribes to the backend's per-file download progress events and
 * exposes a `{ [fileName]: ProgressState }` map plus a clear helper.
 *
 * `onFinished` fires once per finished asset so the parent can refresh
 * the asset list and re-pull settings (since installing a model may
 * implicitly activate it).
 */
export function useDownloadProgress(opts: {
  onFinished: () => void;
}): {
  progress: Record<string, ProgressState>;
  clearFor: (fileName: string) => void;
} {
  const { onFinished } = opts;
  const [progress, setProgress] = useState<Record<string, ProgressState>>({});

  useEffect(() => {
    const p = onModelProgress((e: DownloadEvent) => {
      setProgress((prev) => {
        const next = { ...prev };
        switch (e.kind) {
          case "started":
            next[e.file_name] = {
              fileName: e.file_name,
              downloaded: e.resumed_from,
              total: e.total,
              state: "downloading",
            };
            break;
          case "progress":
            next[e.file_name] = {
              fileName: e.file_name,
              downloaded: e.downloaded,
              total: e.total,
              state: "downloading",
            };
            break;
          case "verifying":
            next[e.file_name] = {
              ...(next[e.file_name] ?? {
                fileName: e.file_name,
                downloaded: 0,
                total: null,
                state: "downloading",
              }),
              state: "verifying",
            };
            break;
          case "finished":
            next[e.file_name] = {
              ...(next[e.file_name] ?? {
                fileName: e.file_name,
                downloaded: 0,
                total: null,
                state: "finished",
              }),
              state: "finished",
            };
            onFinished();
            break;
          case "failed":
            next[e.file_name] = {
              fileName: e.file_name,
              downloaded: 0,
              total: null,
              state: "failed",
              message: e.message,
            };
            break;
        }
        return next;
      });
    });
    return () => {
      p.then((fn) => fn());
    };
  }, [onFinished]);

  const clearFor = (fileName: string) =>
    setProgress((prev) => {
      const next = { ...prev };
      delete next[fileName];
      return next;
    });

  return { progress, clearFor };
}
