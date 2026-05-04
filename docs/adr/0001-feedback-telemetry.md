# ADR 0001 — Feedback telemetry

* **Status:** Implemented (v1.7.0)
* **Date:** 2025-01-26

## Context

Komorebi ships with several default model/router/prompt combinations.
Today we have no signal at all about which of them actually produce
helpful answers. Server logs are out of the question — the whole point
of the product is that conversations stay on the user's machine.

We want a tiny, opt-in feedback channel that:

1. lets users mark replies 👍 or 👎 in one click;
2. preserves the local copy unconditionally (so it can later feed local
   LoRA training, see ADR 0002);
3. when (and only when) the user opts in, ships **non-recoverable**
   summaries to a backend so we can evaluate which model variants the
   community prefers.

"Non-recoverable" means the upload must not allow the recipient to
reconstruct the prompt or the reply. Hashes are fine; ciphertext we
hold the key to is not.

## Decision

* **Local schema (`feedback.sqlite`).** A single table:

  ```sql
  CREATE TABLE feedback (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at    INTEGER NOT NULL,    -- unix seconds
    model_label   TEXT    NOT NULL,    -- e.g. "openrouter:gpt-4.1" / "local:llama3-8b.gguf"
    route         TEXT    NOT NULL,    -- "local" | "cloud" | "skill"
    prompt_hash   TEXT    NOT NULL,    -- sha256 hex (lowercase)
    response_hash TEXT    NOT NULL,    -- sha256 hex
    response_chars INTEGER NOT NULL,   -- length in chars (rough quality proxy)
    rating        INTEGER NOT NULL,    -- +1 or -1
    lang          TEXT    NOT NULL,    -- ui language at the time of rating
    uploaded_at   INTEGER              -- NULL until shipped
  );
  CREATE INDEX feedback_pending_idx
    ON feedback(uploaded_at) WHERE uploaded_at IS NULL;
  ```

* **Recording.** A single rating call always inserts a row, regardless
  of the telemetry toggle. The 👍/👎 buttons in the chat bubble emit
  `+1`/`-1` and the parent records `(model_label, route, prompt,
  response, rating, lang)`. The store hashes prompt and response on
  insert; raw text is never persisted.

* **Anonymous install token.** When telemetry is enabled for the first
  time, the client generates a 128-bit hex token (sha256 over
  `(now_ns, pid)`) and stores it under the existing settings key store.
  The token is *not* a stable identifier across reinstalls and the user
  can rotate or purge it at any time.

* **Uploader.** A Tokio task in the desktop process wakes every 10
  minutes, checks the toggle, drains up to 200 pending rows, and
  POSTs:

  ```json
  {
    "schema": "feedback.v1",
    "anon_token": "<32 hex chars>",
    "client_version": "1.7.0",
    "items": [
      { "day": 1737849600, "model_label": "...", "route": "...",
        "prompt_hash": "...", "response_hash": "...",
        "response_chars": 412, "rating": 1, "lang": "en" }
    ]
  }
  ```

  Timestamps are rounded to UTC midnight to discourage timing analysis.
  Rows are marked `uploaded_at` only after a 2xx response.

* **UI surface.**
  * Two thumbs in `ChatBubble`, shown only on a final assistant reply
    with a known route.
  * `Settings → Community feedback`: toggle, endpoint URL, queue stats,
    truncated token preview, "Purge local feedback" button (also
    rotates the token to break linkability).

* **Default endpoint.** Hard-coded to a project-controlled URL but
  user-editable. An empty endpoint is treated as "no upload".

## Consequences

* The backend can never recover the wording of a prompt or reply, but
  it *can* see which `model_label` is more often rated positively in
  which `lang`. That's exactly the signal we need.
* The on-device queue is the canonical source for ADR 0002 (local LoRA
  training). When that ships, the trainer reads from the same SQLite
  file — no extra plumbing.
* Because rows are marked uploaded but not deleted, users can always
  audit what was sent. "Purge" wipes everything in one click.

## Alternatives considered

* **Server-side aggregation of raw prompts.** Rejected on principle —
  see ADR 0003 for what we want to do *with* user-controlled deltas.
* **Differential privacy at the rating level.** Overkill — a sha256
  hash already conveys ~zero information about a unique prompt unless
  the attacker can guess it. We add DP at the model-update layer
  (ADR 0003) where it actually matters.
* **One row = one model invocation, regardless of rating.** Rejected;
  passive logging would let us reconstruct prompt distributions even
  without text. We only log when the user explicitly clicks.

## Open questions

* Should the client refuse to upload if the system clock is off by
  more than N hours? Probably yes once the backend exists.
* Do we want a "🤔 mixed" rating? Defer until we see how often users
  pick neither button.
