# ADR 0005 — Transparency log and revocation

* **Status:** Proposed
* **Date:** 2025-01-26

## Context

A federated training pipeline is only trustworthy to the extent that
outsiders can verify what it did. ADR 0003 lets contributors audit
*outgoing* payloads; ADR 0004 lets us run the aggregator
reproducibly. What's missing is a public, append-only record of every
round so that a third party can independently confirm what was
published — and a documented way for a contributor to revoke their
in-flight contribution before it lands in an aggregate.

## Decision

* **Transparency log = a Git repository.** Each finished round
  appends a Markdown report under `transparency/<round_id>.md`,
  signed in-line with the project release key. The repository is
  pushed to a public mirror; the desktop client links to it from
  the Settings panel. Contents per round:

  * round id, start/end UTC timestamps, aggregator git commit;
  * contributor counts before/after validation and after trimming;
  * server noise σ and resulting `(ε, δ)` for the round;
  * eval gate results (numbers, not just pass/fail);
  * SHA256 of every input contribution ciphertext;
  * SHA256 + Ed25519 signature of the published artifact;
  * a one-paragraph human-written summary ("what changed").

  Skipped or failed rounds are recorded too, with the failure reason.

* **In-Settings link.** A "View transparency log" link in the
  community-feedback section opens the public repo in the user's
  browser. We don't try to render the log inside the app — the
  authoritative copy is the repo.

* **Per-round content hash.** Every transparency report ends with the
  SHA256 of itself (computed before signing) and an Ed25519 signature
  over that hash. This makes tampering with a single report
  detectable without having to hash the whole repo.

* **Revocation API.**
  * `DELETE /v1/contributions/{id}` with the contribution's one-shot
    Ed25519 keypair (the client retains the secret half until the
    round closes). Server soft-deletes the row and returns 204.
  * Soft delete = the ciphertext is kept long enough for the
    aggregator to skip it (current round) but is excluded from the
    decrypt step. After the round closes, soft-deleted rows are
    garbage-collected from R2 along with the rest of the round.
  * **Hard cutoff.** Once a round has been aggregated and published,
    the contribution is mathematically baked into the released LoRA;
    "revocation" can no longer remove its influence. The UI states
    this explicitly: revoke by *day X of the round* or your update
    ships.

* **Revocation UX.** The desktop client keeps a list of pending
  contributions (per round, with the round-close ETA) and offers a
  one-click revoke. After revocation the local LoRA, the ratings,
  and all derived files are unaffected — only the in-flight upload
  is canceled.

* **Operator commitments.** Documented in the public repo:
  * the release key fingerprint;
  * the round X25519 public key publishing schedule;
  * the contact channel for security disclosures;
  * the exact eval-suite version used for each round.

## Consequences

* Adding a Git push to the release pipeline is a tiny operational
  cost; the auditability is huge.
* Soft-delete + GC is more complex than "row stays forever". We
  accept the complexity to honor the user's revocation request.
* "Revocation only works before round close" is unavoidable but must
  be communicated honestly.

## Alternatives considered

* **Build our own append-only log (Trillian-style).** Overkill for
  the volume we expect. A signed Git repo gives us the same
  guarantees with tools every developer already has.
* **No revocation API.** Would simplify the server; would also
  contradict the privacy-first framing. The compromise (revocable
  before publish, public log of what made it in) is the honest
  middle ground.
* **Reveal individual contributions in the log.** Defeats the
  unlinkability goal of ADR 0003. We log only counts and aggregate
  hashes.

## Open questions

* Do we eventually want a per-user dashboard listing "your
  contributions across rounds"? It would re-introduce linkability
  unless we let the client store its own history. Probably the
  latter — the desktop already has all the data.
* Repo location and naming. Likely `komorebi-transparency` under the
  same org as the main repo.
