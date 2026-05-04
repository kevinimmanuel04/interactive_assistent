// Loads the right Live2D runtime for a given model URL:
//   * `.model.json`   → Cubism 2 (`live2d.min.js`)
//   * `.model3.json`  → Cubism 3 / 4 / 5 (`live2dcubismcore.min.js`)
//
// First tries the file served out of `public/`, then falls back to the
// canonical CDN so first-run with a remote model just works out of the
// box. Resolves with `true` on success.

export type Runtime = "cubism2" | "cubism4";

export function detectRuntime(modelUrl: string): Runtime {
  // Strip query / hash before extension check
  const clean = modelUrl.split(/[?#]/)[0].toLowerCase();
  return clean.endsWith(".model3.json") ? "cubism4" : "cubism2";
}

const runtimePromises: Partial<Record<Runtime, Promise<boolean>>> = {};

function loadScript(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

export function ensureRuntime(runtime: Runtime): Promise<boolean> {
  const cached = runtimePromises[runtime];
  if (cached) return cached;

  const p = (async () => {
    const w = window as unknown as {
      Live2DCubismCore?: unknown;
      Live2D?: unknown;
    };
    if (runtime === "cubism4" && w.Live2DCubismCore) return true;
    if (runtime === "cubism2" && w.Live2D) return true;

    const sources =
      runtime === "cubism4"
        ? [
            "/live2dcubismcore.min.js",
            "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js",
          ]
        : [
            "/live2d.min.js",
            "https://cdn.jsdelivr.net/gh/dylanNew/live2d/webgl/Live2D/lib/live2d.min.js",
          ];

    for (const src of sources) {
      const ok = await loadScript(src);
      if (!ok) continue;
      const loaded =
        runtime === "cubism4"
          ? !!(window as unknown as { Live2DCubismCore?: unknown })
              .Live2DCubismCore
          : !!(window as unknown as { Live2D?: unknown }).Live2D;
      if (loaded) return true;
    }
    return false;
  })();

  runtimePromises[runtime] = p;
  return p;
}
