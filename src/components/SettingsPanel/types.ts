import type { PublicSettings } from "../../api";

// Every section receives the freshest `PublicSettings` snapshot from the
// orchestrator, plus a `refresh()` callback. `refresh` re-fetches settings
// from the backend and notifies the host (App) that something changed.
//
// Sections call `refresh()` after every successful write. The orchestrator
// debounces nothing — by design, settings writes are infrequent (user
// interaction) and the round-trip keeps UI in sync with the backend's
// canonical state.
export interface SectionProps {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}
