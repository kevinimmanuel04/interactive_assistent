// Local intent classifier: a small multilingual MiniLM ONNX model that
// embeds the user's prompt and matches it against per-skill anchor
// phrases via cosine similarity. Replaces hardcoded keyword/substring
// matchers (currently wired into the weather pre-check; other skills
// will follow). The model (~120 MB quantized) is downloaded on demand
// from Hugging Face and cached in the app data directory.

import { useEffect, useState } from "react";
import { intentClassifyDebug, intentLoad, intentStatus } from "../../../api";
import { toast } from "../../Toast";
import { useLocale } from "../../../i18n";
import { btnStyle, inputStyle } from "../styles";

export default function IntentSection() {
  useLocale();
  const [ready, setReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [testQuery, setTestQuery] = useState("");
  const [result, setResult] = useState<string>("");

  useEffect(() => {
    void intentStatus()
      .then(setReady)
      .catch(() => setReady(false));
  }, []);

  const onInstall = async () => {
    setBusy(true);
    try {
      await intentLoad();
      setReady(true);
      toast.success("Intent classifier ready");
    } catch (e) {
      toast.error(`Install failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const onTest = async () => {
    if (!testQuery.trim()) return;
    setBusy(true);
    try {
      const ranks = await intentClassifyDebug(testQuery);
      setResult(
        ranks
          .slice(0, 5)
          .map((m) => `${m.intent}: ${m.score.toFixed(3)}`)
          .join("\n"),
      );
    } catch (e) {
      setResult(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ opacity: 0.7, marginBottom: 6 }}>
        Local intent classifier{" "}
        {ready === true && (
          <span style={{ color: "#a5d6a7" }}>● ready</span>
        )}
        {ready === false && (
          <span style={{ color: "#ffb74d" }}>● not installed</span>
        )}
      </div>
      <div style={{ opacity: 0.5, fontSize: 11, marginBottom: 8 }}>
        Replaces keyword matchers ("погода", "открой", "сделай скрин", …)
        with embedding-based intent recognition. Multilingual MiniLM,
        ~120 MB ONNX downloaded once. When installed, used as the fast
        path for the weather pre-check AND for the skill picker
        (volume / screenshot / clipboard / open / media). Falls back to
        keywords when the model isn't loaded or scores below threshold.
      </div>
      <button
        type="button"
        onClick={onInstall}
        disabled={busy || ready === true}
        style={btnStyle}
      >
        {ready === true ? "Installed" : busy ? "Installing…" : "Install"}
      </button>
      {ready === true && (
        <div style={{ marginTop: 12 }}>
          <input
            type="text"
            placeholder="Test phrase, e.g. 'сколько градусов на улице'"
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            disabled={busy}
            style={inputStyle}
          />
          <button
            type="button"
            onClick={onTest}
            disabled={busy || !testQuery.trim()}
            style={{ ...btnStyle, marginTop: 6 }}
          >
            Classify
          </button>
          {result && (
            <pre
              style={{
                marginTop: 8,
                padding: 8,
                background: "rgba(0,0,0,0.3)",
                borderRadius: 6,
                fontSize: 11,
                whiteSpace: "pre-wrap",
              }}
            >
              {result}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
