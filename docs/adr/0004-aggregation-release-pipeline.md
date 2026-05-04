# ADR 0004 — Aggregation and release pipeline

* **Status:** Proposed
* **Date:** 2025-01-26

## Context

Given a pool of clipped, noised, encrypted LoRA deltas from ADR 0003,
we need a server-side pipeline that turns them into a *signed,
auditable* community LoRA release. The pipeline must defend against
poisoning (a contributor sending an absurd delta to wreck the
aggregate) and against re-identification (the published aggregate
should not leak about any single contributor).

## Decision

* **Aggregator language: Python.** The math is heavy on numpy/torch
  ops and the toolchain (peft / safetensors / huggingface_hub) is
  already in Python. The aggregator is a separate repository run on a
  small VM, never in the same process as the desktop client.

* **Pipeline stages.**
  1. **Decrypt.** Pull all ciphertexts for the round from R2; decrypt
     with the round's X25519 secret key (rotated per round, kept in
     an HSM).
  2. **Validate.** Reject anything that fails signature check, has a
     wrong tensor shape, or has a global norm above the documented
     clip `C`. Logged but not propagated.
  3. **Robust aggregate.** Trimmed mean (drop the top and bottom 10%
     per-coordinate) instead of plain mean — bounds the influence of
     pathological contributors who somehow slipped past validation.
  4. **Central DP.** Add `N(0, (σ_server · C / K)² I)` once, where `K`
     is the surviving contributor count. `σ_server` is set so the
     final `(ε, δ)` for the round meets the budget published in the
     ADR 0005 transparency log.
  5. **Eval gate.** Run a held-out evaluation suite:
     * a generic perplexity probe (must not regress > 5%);
     * a toxicity classifier on a fixed prompt set (must not regress);
     * a tone preference probe (must improve, otherwise the round is
       skipped).
  6. **Manual review.** A human runs a small qualitative diff against
     the previous release. Without this sign-off the artifact is not
     promoted.
  7. **Sign and publish.** The promoted artifact is signed with a
     project Ed25519 release key and uploaded to R2 plus a public
     mirror. The signing key's public half is shipped with every
     Komorebi build; clients refuse to load LoRAs that don't verify.

* **Reproducibility.** The aggregator records, for each round:
  contributor count after validation, post-trim count, server noise
  σ, eval scores, the SHA256 of every input ciphertext (not the
  plaintext), git commit of the aggregator code, and the wall-clock
  timestamp. This bundle is the input to ADR 0005.

* **Failure modes.** A round that fails the eval gate is *not*
  published. The transparency log still records the attempt with
  reason "eval gate failed" so the absence of a release is itself
  visible.

## Consequences

* Manual review is a deliberate bottleneck. We trade release cadence
  for the ability to actually catch bad rounds before they reach
  users.
* The robust trimmed mean cuts our useful sample size by ~20%. With
  small contributor counts that hurts; we accept slow growth as the
  cost of safety.
* Round artifacts and review logs accumulate on R2. Lifecycle is
  configured to keep N=12 rounds for audit, then garbage-collect.

## Alternatives considered

* **Pure mean aggregation.** Cheaper and tighter DP bounds, but a
  single wild outlier dominates. The trimmed mean is a much better
  fit at this scale.
* **Continuous (rolling) updates.** Operationally appealing but
  hostile to transparency: a continuous stream is hard to publish a
  human-readable diff for. Discrete rounds give every release a name
  and a story.
* **Automated promotion (no manual review).** Possible later when we
  trust the eval gate more; not for the first version.

## Open questions

* What's the smallest viable contributor count per round? Below ~50
  the central DP noise probably eats any signal. We'll ship with a
  hard floor and skip rounds that don't meet it.
* Where does the held-out eval set come from? Initial plan: hand-curated
  by the project team, eventually augmented with synthetic prompts.
* Do we ever rotate the project release key? Yes, but only via a
  signed announcement that lists both keys for a deprecation window.
