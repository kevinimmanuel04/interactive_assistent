import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { desktopListScreens, desktopScreenshot, ScreenInfo } from "../../api";
import { t, useLocale } from "../../i18n";
import { composeAnnotated } from "./compose";
import { DimMask } from "./DimMask";
import { btnStyle, clampMul8, inputStyle, labelStyle } from "./styles";
import {
  COLORS,
  IMPORTANCE_META,
  type Importance,
  type OverlayRegion,
  type PickerRegion,
  type PickerSubmission,
} from "./types";

export type {
  Importance,
  PickerRegion,
  PickerSubmission,
} from "./types";

interface Props {
  open: boolean;
  initialPrompt?: string;
  /// When provided, the picker uses this screenshot/screen info directly
  /// instead of capturing again from inside the (already-fullscreen)
  /// overlay window. This is the recommended path — capturing while
  /// the assistant covers the screen produces a black image whenever
  /// another app (e.g. Discord) is also screen-sharing the desktop.
  prebuilt?: {
    bytes: Uint8Array;
    screen: ScreenInfo | null;
  };
  onCancel: () => void;
  onSubmit: (s: PickerSubmission) => void;
  onGenerateVariant?: (
    prompt: string,
    size: { width: number; height: number },
  ) => void;
}

/// Fullscreen, snipping-tool style region picker. Supports multiple regions
/// with per-region color and importance, dimming outside selection,
/// keyboard shortcuts (Enter to submit, Esc to cancel, Del to remove,
/// Ctrl+C to copy), and a clipboard fallback that copies the composed PNG.
export default function RegionPicker({
  open,
  initialPrompt = "",
  prebuilt,
  onCancel,
  onSubmit,
  onGenerateVariant,
}: Props) {
  useLocale();
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgBitmap, setImgBitmap] = useState<HTMLImageElement | null>(null);
  const [screen, setScreen] = useState<ScreenInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [regions, setRegions] = useState<PickerRegion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentColor, setCurrentColor] = useState<string>(COLORS[0].value);
  const [currentImportance, setCurrentImportance] =
    useState<Importance>("normal");
  const [copied, setCopied] = useState<null | "ok" | "err">(null);

  const [drawing, setDrawing] = useState<{
    sx: number;
    sy: number;
    ex: number;
    ey: number;
  } | null>(null);
  const drawingRef = useRef<{
    sx: number;
    sy: number;
    ex: number;
    ey: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Ref to the prompt input so we can yank focus back after the user
  // finishes dragging a region — without this, focus stays on the
  // overlay and Enter / typing does nothing until they manually click
  // the input. That tripped users into hitting Send with an empty
  // prompt, which is the whole point of the picker.
  const promptRef = useRef<HTMLInputElement>(null);

  const scaleRef = useRef<{ sx: number; sy: number }>({ sx: 1, sy: 1 });

  // Reset on open.
  useEffect(() => {
    if (!open) return;
    let revoked: string | null = null;
    setImgUrl(null);
    setImgBitmap(null);
    setError(null);
    setDrawing(null);
    setRegions([]);
    setSelectedId(null);
    setPrompt(initialPrompt);
    setCopied(null);
    (async () => {
      try {
        let screen: ScreenInfo | null;
        let bytes: Uint8Array;
        if (prebuilt) {
          screen = prebuilt.screen;
          bytes = prebuilt.bytes;
        } else {
          const screens = await desktopListScreens();
          screen = screens.find((s) => s.is_primary) ?? screens[0] ?? null;
          bytes = await desktopScreenshot(0);
        }
        setScreen(screen);
        const blob = new Blob([new Uint8Array(bytes)], { type: "image/png" });
        const url = URL.createObjectURL(blob);
        revoked = url;
        setImgUrl(url);
        const img = new Image();
        img.src = url;
        await img.decode().catch(() => {});
        setImgBitmap(img);
      } catch (e) {
        setError(String(e));
      }
    })();
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
    // `prebuilt` is intentionally read from the closure at open-time only;
    // re-running on prebuilt change would clobber any in-progress regions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPrompt]);

  const recomputeScale = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !screen || rect.width === 0 || rect.height === 0) return;
    scaleRef.current = {
      sx: screen.width / rect.width,
      sy: screen.height / rect.height,
    };
  }, [screen]);

  useEffect(() => {
    if (!open) return;
    recomputeScale();
    const onResize = () => recomputeScale();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, recomputeScale, imgUrl]);

  const overlayRegions: OverlayRegion[] = useMemo(() => {
    const { sx, sy } = scaleRef.current;
    if (!sx || !sy) {
      return regions.map((r) => ({ ...r, ox: 0, oy: 0, ow: 0, oh: 0 }));
    }
    return regions.map((r) => ({
      ...r,
      ox: r.x / sx,
      oy: r.y / sy,
      ow: r.width / sx,
      oh: r.height / sy,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions, screen, imgUrl]);

  const drawingOverlay = drawing
    ? {
        x: Math.min(drawing.sx, drawing.ex),
        y: Math.min(drawing.sy, drawing.ey),
        w: Math.abs(drawing.ex - drawing.sx),
        h: Math.abs(drawing.ey - drawing.sy),
      }
    : null;

  const clampPoint = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.max(0, Math.min(clientX - rect.left, rect.width)),
      y: Math.max(0, Math.min(clientY - rect.top, rect.height)),
    };
  };

  const hitTest = (px: number, py: number): string | null => {
    for (let i = overlayRegions.length - 1; i >= 0; i--) {
      const r = overlayRegions[i];
      if (px >= r.ox && px <= r.ox + r.ow && py >= r.oy && py <= r.oy + r.oh) {
        return r.id;
      }
    }
    return null;
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const point = clampPoint(e.clientX, e.clientY);
    if (!point) return;
    const hit = hitTest(point.x, point.y);
    if (hit) {
      setSelectedId(hit);
      return;
    }
    setSelectedId(null);
    const next = { sx: point.x, sy: point.y, ex: point.x, ey: point.y };
    drawingRef.current = next;
    setDrawing(next);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    const point = clampPoint(e.clientX, e.clientY);
    if (!point) return;
    const next = { ...drawingRef.current, ex: point.x, ey: point.y };
    drawingRef.current = next;
    setDrawing(next);
  };

  const finishDrag = (e?: React.PointerEvent) => {
    const cur = drawingRef.current;
    drawingRef.current = null;
    if (!cur) return;
    if (e) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    const w = Math.abs(cur.ex - cur.sx);
    const h = Math.abs(cur.ey - cur.sy);
    if (w < 8 || h < 8) {
      setDrawing(null);
      return;
    }
    recomputeScale();
    const { sx, sy } = scaleRef.current;
    const x0 = Math.min(cur.sx, cur.ex);
    const y0 = Math.min(cur.sy, cur.ey);
    const region: PickerRegion = {
      id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      x: Math.round(x0 * sx),
      y: Math.round(y0 * sy),
      width: Math.max(1, Math.round(w * sx)),
      height: Math.max(1, Math.round(h * sy)),
      color: currentColor,
      importance: currentImportance,
    };
    setRegions((rs) => [...rs, region]);
    setSelectedId(region.id);
    setDrawing(null);
    // Hand focus back to the prompt input so the user can immediately
    // type the question ("что тут видно?") without an extra click.
    // requestAnimationFrame to let the bottom bar render the enabled
    // state before we focus.
    requestAnimationFrame(() => promptRef.current?.focus());
  };

  const updateSelected = (patch: Partial<PickerRegion>) => {
    if (!selectedId) return;
    setRegions((rs) =>
      rs.map((r) => (r.id === selectedId ? { ...r, ...patch } : r)),
    );
  };

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setRegions((rs) => rs.filter((r) => r.id !== selectedId));
    setSelectedId(null);
  }, [selectedId]);

  const clearAll = () => {
    setRegions([]);
    setSelectedId(null);
  };

  const compose = useCallback(
    () => composeAnnotated(imgBitmap, screen, regions),
    [imgBitmap, regions, screen],
  );

  const importanceSummary = useMemo(() => {
    if (regions.length === 0) return "";
    const lines = regions.map((r, i) => {
      const m = IMPORTANCE_META[r.importance];
      return `#${i + 1} ${m.label}${r.label ? ` "${r.label}"` : ""}`;
    });
    return `Selected ${regions.length} region${
      regions.length === 1 ? "" : "s"
    }: ${lines.join(", ")}.`;
  }, [regions]);

  const submit = useCallback(async () => {
    if (regions.length === 0) return;
    const composed = await compose();
    if (!composed) return;
    const userPrompt = prompt.trim();
    const finalPrompt = userPrompt
      ? `${importanceSummary}\n\n${userPrompt}`
      : importanceSummary;
    onSubmit({
      prompt: finalPrompt,
      imageBase64: composed.base64,
      regions,
      unionBox: composed.unionBox,
      monitor: 0,
    });
  }, [regions, compose, prompt, importanceSummary, onSubmit]);

  const copyToClipboard = useCallback(async () => {
    try {
      const composed = await compose();
      if (!composed) {
        setCopied("err");
        return;
      }
      // Browser Clipboard API works inside Tauri's WebView2.
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": composed.blob }),
      ]);
      setCopied("ok");
      window.setTimeout(() => setCopied(null), 1800);
    } catch (e) {
      console.warn("[picker] clipboard failed:", e);
      setCopied("err");
      window.setTimeout(() => setCopied(null), 2200);
    }
  }, [compose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA";
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        if (regions.length > 0) {
          e.preventDefault();
          void submit();
        }
        return;
      }
      if (!inField && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        deleteSelected();
        return;
      }
      if (
        !inField &&
        (e.key === "c" || e.key === "C") &&
        (e.ctrlKey || e.metaKey)
      ) {
        e.preventDefault();
        void copyToClipboard();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, submit, deleteSelected, copyToClipboard, regions.length]);

  if (!open) return null;

  const selected = regions.find((r) => r.id === selectedId) ?? null;
  const activeColor = selected ? selected.color : currentColor;
  const activeImportance = selected ? selected.importance : currentImportance;

  const setActiveColor = (c: string) => {
    if (selected) updateSelected({ color: c });
    else setCurrentColor(c);
  };
  const setActiveImportance = (imp: Importance) => {
    if (selected) updateSelected({ importance: imp });
    else setCurrentImportance(imp);
  };

  const stopBubble = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onPointerMove: (e: React.PointerEvent) => e.stopPropagation(),
    onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
  };

  return (
    <div
      className="interactive"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#0c0c12",
        userSelect: "none",
        pointerEvents: "auto",
        color: "#fff",
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        ref={containerRef}
        className="interactive"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={(e) => finishDrag(e)}
        onPointerCancel={(e) => finishDrag(e)}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          overflow: "hidden",
          cursor: "crosshair",
          background: "#111",
          pointerEvents: "auto",
          touchAction: "none",
        }}
      >
        {error && <div style={{ color: "#ff8888", padding: 12 }}>{error}</div>}
        {imgUrl && (
          <img
            src={imgUrl}
            alt="screen"
            draggable={false}
            onLoad={recomputeScale}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "fill",
              pointerEvents: "none",
              userSelect: "none",
            }}
          />
        )}

        <DimMask regions={overlayRegions} drawing={drawingOverlay} />

        {overlayRegions.map((r, i) => {
          const isSelected = r.id === selectedId;
          const meta = IMPORTANCE_META[r.importance];
          return (
            <div
              key={r.id}
              style={{
                position: "absolute",
                left: r.ox,
                top: r.oy,
                width: r.ow,
                height: r.oh,
                border: `${isSelected ? 3 : 2}px solid ${r.color}`,
                boxShadow: isSelected
                  ? `0 0 0 1px rgba(0,0,0,0.6), 0 0 14px ${r.color}55`
                  : "0 0 0 1px rgba(0,0,0,0.4)",
                background: r.color + "1a",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: -28,
                  left: -2,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(0,0,0,0.78)",
                  borderLeft: `4px solid ${r.color}`,
                  padding: "3px 8px",
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ opacity: 0.7 }}>#{i + 1}</span>
                <span style={{ color: meta.color }}>{meta.tag}</span>
                <span>{meta.label}</span>
                {r.label && (
                  <span style={{ opacity: 0.7 }}>· {r.label}</span>
                )}
              </div>
            </div>
          );
        })}

        {drawingOverlay && drawingOverlay.w > 0 && drawingOverlay.h > 0 && (
          <div
            style={{
              position: "absolute",
              left: drawingOverlay.x,
              top: drawingOverlay.y,
              width: drawingOverlay.w,
              height: drawingOverlay.h,
              border: `2px dashed ${currentColor}`,
              background: currentColor + "22",
              pointerEvents: "none",
            }}
          />
        )}
      </div>

      {/* Top bar */}
      <div
        className="interactive"
        {...stopBubble}
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          right: 16,
          zIndex: 3,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 14px",
          borderRadius: 14,
          background: "rgba(20,20,28,0.88)",
          border: "1px solid rgba(255,255,255,0.14)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
          fontSize: 13,
          textShadow: "0 1px 2px rgba(0,0,0,0.6)",
          pointerEvents: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <strong>{t("region.title")}</strong>
          <span style={{ opacity: 0.7 }}>{t("region.help")}</span>
          {regions.length > 0 && (
            <span
              style={{
                background: "rgba(255,255,255,0.1)",
                borderRadius: 999,
                padding: "2px 10px",
                fontWeight: 600,
              }}
            >
              {regions.length === 1
                ? t("region.count_one", { n: regions.length })
                : t("region.count_many", { n: regions.length })}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {regions.length > 0 && (
            <button
              onClick={clearAll}
              style={btnStyle()}
              title={t("region.clear_all.tip")}
            >
              {t("region.clear_all")}
            </button>
          )}
          <button
            onClick={onCancel}
            aria-label={t("region.close.tip")}
            title={`${t("region.close.tip")} (Esc)`}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
              fontSize: 18,
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Left toolbar */}
      <div
        className="interactive"
        {...stopBubble}
        style={{
          position: "absolute",
          left: 16,
          top: 78,
          zIndex: 3,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: 12,
          borderRadius: 14,
          background: "rgba(20,20,28,0.88)",
          border: "1px solid rgba(255,255,255,0.14)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
          width: 168,
          pointerEvents: "auto",
        }}
      >
        <div>
          <div style={labelStyle}>
            {selected ? t("region.color.selected") : t("region.color.next")}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setActiveColor(c.value)}
                title={c.name}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  background: c.value,
                  border:
                    activeColor === c.value
                      ? "2px solid #fff"
                      : "2px solid rgba(255,255,255,0.15)",
                  boxShadow:
                    activeColor === c.value
                      ? `0 0 0 2px ${c.value}66`
                      : "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
          </div>
        </div>
        <div>
          <div style={labelStyle}>
            {selected
              ? t("region.importance.selected")
              : t("region.importance.next")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(Object.keys(IMPORTANCE_META) as Importance[]).map((imp) => {
              const meta = IMPORTANCE_META[imp];
              const isActive = activeImportance === imp;
              return (
                <button
                  key={imp}
                  onClick={() => setActiveImportance(imp)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 8px",
                    borderRadius: 8,
                    border: isActive
                      ? `1px solid ${meta.color}`
                      : "1px solid rgba(255,255,255,0.12)",
                    background: isActive
                      ? `${meta.color}22`
                      : "rgba(255,255,255,0.04)",
                    color: "#fff",
                    cursor: "pointer",
                    fontSize: 12,
                    textAlign: "left",
                  }}
                >
                  <span style={{ color: meta.color, width: 14 }}>
                    {meta.tag}
                  </span>
                  <span>{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        {selected && (
          <div>
            <div style={labelStyle}>{t("region.label")}</div>
            <input
              value={selected.label ?? ""}
              onChange={(e) => updateSelected({ label: e.target.value })}
              placeholder={t("region.label.placeholder")}
              style={inputStyle}
            />
            <button
              onClick={deleteSelected}
              style={{ ...btnStyle(), marginTop: 8, width: "100%" }}
            >
              {t("region.delete")}
            </button>
          </div>
        )}
      </div>

      {/* Right region list */}
      {regions.length > 0 && (
        <div
          className="interactive"
          {...stopBubble}
          style={{
            position: "absolute",
            right: 16,
            top: 78,
            zIndex: 3,
            width: 200,
            maxHeight: "60vh",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: 12,
            borderRadius: 14,
            background: "rgba(20,20,28,0.88)",
            border: "1px solid rgba(255,255,255,0.14)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
            pointerEvents: "auto",
          }}
        >
          <div style={labelStyle}>{t("region.list_title")}</div>
          {regions.map((r, i) => {
            const meta = IMPORTANCE_META[r.importance];
            const isSel = r.id === selectedId;
            return (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: isSel
                    ? `1px solid ${r.color}`
                    : "1px solid rgba(255,255,255,0.1)",
                  background: isSel
                    ? `${r.color}22`
                    : "rgba(255,255,255,0.04)",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 12,
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    background: r.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ opacity: 0.7 }}>#{i + 1}</span>
                <span style={{ color: meta.color }}>{meta.tag}</span>
                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.label || `${r.width}×${r.height}`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Bottom bar */}
      <div
        className="interactive"
        {...stopBubble}
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 16,
          zIndex: 3,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: 12,
          borderRadius: 14,
          background: "rgba(20,20,28,0.9)",
          border: "1px solid rgba(255,255,255,0.14)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            ...labelStyle,
            marginBottom: 4,
            color: regions.length === 0 ? "rgba(255,255,255,0.45)" : "#fff",
          }}
        >
          {regions.length === 0
            ? "1. Выдели регион(ы) на экране"
            : "2. Опиши, что нужно увидеть на этих регионах"}
        </div>
        <input
          ref={promptRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            regions.length === 0
              ? "Например: «что написано на этой кнопке?» — текст можно набрать заранее"
              : "Например: «прочитай текст», «что не так с кодом?», «опиши скриншот» (Enter — отправить)"
          }
          style={{
            ...inputStyle,
            fontSize: 14,
            padding: "10px 12px",
            border:
              regions.length > 0
                ? "1px solid rgba(120,180,255,0.55)"
                : "1px solid rgba(255,255,255,0.14)",
            boxShadow:
              regions.length > 0
                ? "0 0 0 3px rgba(120,180,255,0.12)"
                : "none",
          }}
          autoFocus
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span
            style={{
              flex: 1,
              fontSize: 12,
              opacity: 0.7,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {regions.length === 0 ? "No regions yet." : importanceSummary}
          </span>
          <button
            onClick={() => void copyToClipboard()}
            disabled={regions.length === 0}
            style={btnStyle()}
            title="Copy annotated PNG to clipboard (Ctrl+C)"
          >
            {copied === "ok"
              ? "Copied ✓"
              : copied === "err"
                ? "Copy failed"
                : "Copy PNG"}
          </button>
          {onGenerateVariant && (
            <button
              onClick={() => {
                if (regions.length === 0) return;
                // Use union of regions as the target size (clamped to a
                // reasonable, multiple-of-8 range for SD compatibility).
                const minX = Math.min(...regions.map((r) => r.x));
                const minY = Math.min(...regions.map((r) => r.y));
                const maxX = Math.max(...regions.map((r) => r.x + r.width));
                const maxY = Math.max(...regions.map((r) => r.y + r.height));
                const w = clampMul8(maxX - minX);
                const h = clampMul8(maxY - minY);
                const userPrompt = prompt.trim();
                const finalPrompt = userPrompt
                  ? `${importanceSummary}\n\n${userPrompt}`
                  : importanceSummary;
                onGenerateVariant(finalPrompt, { width: w, height: h });
                onCancel();
              }}
              disabled={regions.length === 0 || !prompt.trim()}
              style={btnStyle()}
              title="Generate an image variant sized to the selected region"
            >
              🎨 Variant
            </button>
          )}
          <button onClick={onCancel} style={btnStyle()}>
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={regions.length === 0}
            style={btnStyle(true)}
          >
            Send {regions.length > 0 ? `(${regions.length})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
