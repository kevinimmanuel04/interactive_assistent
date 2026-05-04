# ADR 0002 — Local personality LoRA

* **Status:** Planned (target v1.8)
* **Date:** 2025-01-26

## Context

ADR 0001 gives us a queue of `(prompt_hash, response_hash, rating)`
triples plus, crucially, the *raw text* of those turns held in plain
chat history on the same device. That's the perfect input for a small
**LoRA fine-tune of the local LLM** that nudges it toward the user's
preferred tone without retraining the base model.

Constraints:

* Komorebi's hot path is Rust + a `llama.cpp`-backed local model. We
  don't want to embed a Python runtime in the main process.
* Users on laptops will not tolerate a fan-spinning trainer running
  while they work.
* The result of a training round must be loadable by `llama.cpp`
  (gguf-LoRA) without restarting the assistant.

## Decision

* **Sidecar process.** Training runs in a separate child process
  (`komorebi-trainer`) shipped as an opt-in extra. Communication is
  JSON-over-stdio — no IPC tooling, no shared memory, just a line
  protocol both sides can debug with `cat`:

  ```jsonc
  // host → trainer
  { "cmd": "start",
    "data_path": "...feedback.sqlite",
    "base_path": "...llama3-8b.Q4_K_M.gguf",
    "output_path": "...lora-2025-01.gguf",
    "limits": { "max_cpu_pct": 50, "battery_floor_pct": 40 } }
  // trainer → host
  { "event": "progress", "step": 42, "loss": 1.731 }
  { "event": "done", "output_path": "...lora-2025-01.gguf",
    "examples": 312, "wall_clock_secs": 1840 }
  { "event": "error", "message": "..." }
  ```

* **Stack.** PyTorch + `peft` for LoRA, `bitsandbytes` for 4-bit base
  weights, an export step that converts the resulting LoRA adapter to
  gguf format consumable by `llama.cpp`. The trainer ships as a
  self-contained Python distribution (PyOxidizer or `uv`-built bundle)
  to keep the user from having to install a toolchain.

* **Data shape.** The trainer joins the local `feedback.sqlite` against
  the chat history database and picks examples in two buckets:
  * **positive** (`rating = +1`) → behavior-cloning targets;
  * **negative** (`rating = -1`) → DPO-style "rejected" pairs against
    a randomly sampled positive of the same `model_label`/`lang`.
  Below `training_min_examples` the run aborts with a friendly
  message.

* **Resource governance.** The host enforces `max_cpu_pct` and
  `battery_floor_pct` from settings by sending `{"cmd": "pause"}` /
  `{"cmd": "resume"}` to the sidecar. On Windows we also lower the
  trainer's process priority to `BELOW_NORMAL`. The sidecar itself
  honors the schedule (`manual` / `idle` / `scheduled`) — when "idle"
  is selected, the host gates `start` on the OS idle detector that
  already powers the proactive feature.

* **Anti-collapse.** Training adds a KL-divergence regularizer against
  the base model so personality drifts but topical capability does
  not. A small held-out set of generic prompts is sampled before the
  run; the trainer refuses to write the output adapter if generic
  perplexity on that set degrades by more than 8%.

* **Hot reload.** When training completes successfully, the host
  detaches the active LoRA (if any) and attaches the new one in place.
  No restart.

* **History.** Each completed run produces a JSON receipt
  (`lora-history/<round>.json`) with examples count, loss curve, and
  KL guardrail outcome. The settings UI surfaces a list with revert
  buttons.

## Consequences

* The first time the user enables training, Komorebi downloads the
  trainer extra (~250 MB compressed). We accept the bandwidth in
  exchange for not bloating the default install.
* Cloud-only users (no `local_model_path`) cannot train. The training
  toggle stays disabled with the "Coming in v1.8 — requires a local
  model" hint already shipped in v1.7.0. This is the limitation we
  flagged when designing ADR 0001's settings.
* Model labels written into `feedback.sqlite` always include the base
  model's filename, so a LoRA trained against one base is not silently
  applied to another.

## Alternatives considered

* **Embed Python via PyO3.** Rejected — links a 100+ MB runtime into
  the main process, complicates Tauri builds, and breaks signing on
  macOS. The sidecar approach is uglier on paper but boring in
  practice.
* **GGUF-only training (e.g. llama.cpp's `finetune` example).**
  Tempting because it reuses our inference stack, but the toolchain is
  experimental and lacks DPO. Revisit in v2.
* **Cloud-side fine-tuning per user.** Defeats the point.

## Open questions

* Do we want to support multiple coexisting LoRAs (e.g. "work tone" vs
  "weekend")? The hot-reload path is single-slot for now; a profile
  picker can come later.
* What's the right cadence for automatic runs? Probably "after every
  N new positive examples", capped at one run per day.
