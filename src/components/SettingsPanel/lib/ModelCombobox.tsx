// Reusable combobox for picking an OpenRouter model id. Behaves exactly
// like a native `<input list="...">` + `<datalist>` pair (the same UX
// OpenRouter's own dashboard uses): the user can either pick from the
// filtered suggestions or type any model id manually — useful when a
// brand-new model lands before our cache picks it up, or when the user
// wants a model the API metadata mis-classifies.
//
// Filtering is delegated to `useFilteredOpenRouterModels` so every
// callsite gets the same capability buckets (text / vision / tts / stt
// / image). When the API call fails or the user has no key, the
// `fallback` list keeps the suggestions populated with sensible
// defaults so the input never appears empty.

import { useId, useMemo } from "react";
import {
  useFilteredOpenRouterModels,
  type ModelKind,
} from "./useFilteredOpenRouterModels";
import { inputStyle } from "../styles";

interface Props {
  /// Current model id. Plain string — the field is free-text by design.
  value: string;
  /// Live edit notification. Called on every keystroke.
  onChange: (next: string) => void;
  /// Called when the user is done editing (blur / Enter). Use this to
  /// persist the value, not `onChange` — otherwise we'd hit Tauri on
  /// every keystroke.
  onCommit: (next: string) => void;
  /// What capability to filter the dropdown by.
  kind: ModelKind;
  /// Whether to actually fetch the OpenRouter catalogue. Pass `false`
  /// when the user has no key — the input still works as free-text
  /// with the hardcoded fallback suggestions.
  enabled: boolean;
  /// Hardcoded suggestions shown when the API list is empty (no key,
  /// fetch failed, still loading). Should be 2–6 well-known model ids.
  fallback?: string[];
  placeholder?: string;
  disabled?: boolean;
  /// Optional style override merged onto the default `inputStyle`.
  style?: React.CSSProperties;
}

export default function ModelCombobox({
  value,
  onChange,
  onCommit,
  kind,
  enabled,
  fallback = [],
  placeholder,
  disabled = false,
  style,
}: Props) {
  // Stable per-instance id so multiple comboboxes on one screen don't
  // share a datalist (which would mix suggestions across kinds).
  const listId = useId();
  const models = useFilteredOpenRouterModels(enabled, kind);

  const options = useMemo(() => {
    if (models.length > 0) {
      return models.map((m) => ({ id: m.id, label: m.name ?? m.id }));
    }
    return fallback.map((id) => ({ id, label: id }));
  }, [models, fallback]);

  return (
    <>
      <input
        type="text"
        list={listId}
        value={value}
        disabled={disabled}
        placeholder={placeholder ?? options[0]?.id ?? ""}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onCommit(value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        style={{ ...inputStyle, ...style }}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </datalist>
    </>
  );
}
