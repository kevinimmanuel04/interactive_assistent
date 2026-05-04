# ADR 0003 — Federated LoRA upload

* **Status:** Proposed
* **Date:** 2025-01-26

## Context

ADR 0002 produces a per-user LoRA adapter trained on that user's own
feedback. The natural next step is "would the community benefit from
the *aggregate* of those adapters?" — federated learning at the LoRA
level. The hard part is making this Sybil-resistant *and* anonymous,
since the contribution itself (a low-rank weight delta) is more
informative than a sha256 hash.

We need a contribution protocol that:

1. accepts updates only from real Komorebi installs (Sybil resistance)
   without tying the upload to a long-lived account;
2. bounds the influence any single contribution can have on the next
   round's aggregate;
3. transmits only what's needed for averaging (the LoRA delta clipped
   and noised), never the user's raw fine-tuning data;
4. lets the user preview exactly what is about to leave their device.

## Decision

* **Anonymous tokens via PoW.** We adopt the
  [Privacy Pass / RFC 9576](https://datatracker.ietf.org/doc/html/rfc9576)
  pattern: the client solves a small proof-of-work puzzle once per
  contribution round and exchanges it with the server for a blind
  token. The server can verify a token without learning which puzzle
  it came from, so successive contributions from the same install are
  unlinkable. Difficulty is tuned so a contribution costs roughly one
  CPU-minute on a laptop — enough to make Sybil farms expensive
  without burning real users.

* **Update sanitization (client-side).**
  1. Subtract the previous public LoRA from the user's local LoRA to
     get the round delta `Δ_i`.
  2. Clip the global L2 norm: `Δ_i ← Δ_i · min(1, C / ‖Δ_i‖₂)` with
     `C = 1.0` (calibrated so a clean run is rarely clipped).
  3. Add Gaussian noise locally: `Δ_i ← Δ_i + N(0, σ_local² I)` with a
     conservative `σ_local` so even a single contribution has plausible
     deniability against membership inference.
  4. Quantize to int8 to cut bandwidth (~4× over fp16).

* **Preview UI.** Before any upload, the client surfaces:
  * the size of the payload;
  * the layers being shared (always: lora_A/B for the attention and
    MLP projections; never: token embeddings or layer norms);
  * the round id and aggregator public key it will be encrypted to;
  * the anonymous token serial.
  Upload is gated behind an explicit "Contribute" button per round —
  no background uploads.

* **Transport.**
  * `POST /v1/contributions` with body
    `{ token, round_id, payload_ciphertext, payload_sig }`.
  * `payload_ciphertext` is the int8 update encrypted with libsodium
    `crypto_box_seal` to a per-round X25519 public key the server
    publishes in advance.
  * `payload_sig` is an Ed25519 signature with a *one-shot* keypair
    generated for this contribution (the public key is included in
    the AAD); we don't reuse keys across rounds, again for
    unlinkability.
  * Storage backend: Cloudflare R2 (S3-compatible) under per-round
    prefixes, lifecycle-deleted N rounds after publication.

* **Contribution toggle.** Distinct from the ADR 0001 telemetry
  toggle: "share anonymous ratings" and "contribute to community
  models" are independent opt-ins. A user can do either, both, or
  neither.

## Consequences

* PoW shifts the burden from "we trust an account system" to "we trust
  the laws of arithmetic". The trade-off is a small CPU cost on
  contributors and zero account/PII state on the server.
* Local clipping and noise mean the *raw* per-user LoRA never leaves
  the device. Combined with the central DP step in ADR 0004 we get a
  defensible privacy story.
* The user can audit the payload before sending. That's both honest
  and a nice debugging aid for us.

## Alternatives considered

* **OAuth-style accounts.** Rejected — the value of "no account" is
  one of the project's headline promises.
* **Trusted hardware attestation.** Locks out non-mainstream OSs and
  doesn't actually prevent a determined attacker; PoW is a more
  honest defense.
* **Send raw LoRAs and trust the aggregator.** Tempting (simpler
  math) but a single compromised aggregator becomes a privacy
  disaster. The clip + noise step is cheap insurance.

## Open questions

* Should we batch multiple PoW solutions per session so a user with
  many devices can contribute from each without redoing the puzzle?
  Probably yes once we have data on solving times.
* Round cadence: monthly is the current placeholder. Tighten only if
  we have enough contributors per round to make the central DP noise
  bearable.
