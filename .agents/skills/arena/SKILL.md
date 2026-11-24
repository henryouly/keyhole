---
name: arena
description: "Spawn N parallel candidates at the same task, pick a base, graft the strongest parts of the losers into it. Use for /arena, 'arena this', 'throw it in the arena', or when one attempt at a non-trivial artifact would lock in the wrong shape."
disable-model-invocation: true
---

# Arena

Track progress with one entry per phase (`Frame`, `Fan out`, `Cross-judge`, `Pick`, `Graft`, `Verify`) before launching anything.

## Phase A: Frame

Every candidate gets the same prompt, so the prompt is the contract.

1. **State the artifact** each candidate is producing.
2. **Derive the rubric:** 3–6 concrete, gradeable criteria for what success looks like on *this* task. The rubric is the picker's tool in Phase D — candidates only see the task, not the rubric.
3. **Pick N runners (default 2–3):** if your harness supports selecting models per subagent, pick diverse models across vendors/tiers (keep at least two runners; fall back to the nearest valid model or drop a seat and note why if a model is rejected). If your harness only supports inheriting the parent model, spawn N independent subagents with the inherited model and note that multi-model diversity was unavailable. Spawn more runners to explore distinct design directions; repeat one model when the work is generation-bound rather than judgment-sensitive.
4. **Isolate every candidate's output location:** eliminate shared mutation before running in parallel — give each candidate its own git worktree when supported, otherwise a separate directory such as `/tmp/arena-<slug>/candidate-<n>/`. Never let two concurrent candidates write to the same file, branch, or state object; merge only when reading and synthesizing.

## Phase B: Fan out

Spawn all N subagents concurrently in the background, each with:
- the identical task,
- paths to any shared grounding/context files,
- its own isolated output path, and
- instructions to produce both the artifact and a short rationale naming the alternatives it considered and rejected.

If a candidate produces no output, proceed with N-1 and note the dropout.

## Phase C: Cross-judge

After all Phase B candidates complete, spawn one **read-only** judge subagent. If your harness supports model selection, pick a model from a different vendor than the parent to reduce self-preference bias; if not (or if the parent model is unknown), spawn a fresh read-only subagent with the available model and note that the cross-vendor check did not run.

While you read the candidates in Phase D, the judge scores each candidate (by path label, not by model name) on every rubric criterion and recommends a base.

## Phase D: Pick a base

Read every candidate end to end before picking. Score each against the rubric criterion by criterion — not on holistic feel — and compare with the cross-judge when Phase C ran one. Agreement on the base confirms the pick. Disagreement means one of you is biased or the rubric was ambiguous; read both rationales before deciding.

Pick the base a future maintainer can extend most easily without breaking invariants. When two feel tied, prefer the cleaner boundary, single source of truth, and smaller diff/API.

## Phase E: Graft

Walk each losing candidate once more for what is worth porting into the base — usually one or two ideas per candidate, not most of it. Fold each graft in by hand, redesigning as if the idea had been part of the base from the start, so the result stays coherent under one mental model. Don't paste mechanically.

- If the candidates converge on one shape, that is strong agreement: note it and ship the consensus shape (no graft needed).
- If they wildly diverge, Phase A was under-specified: reframe and re-run rather than averaging the divergence.

## Phase F: Verify

Verify the synthesized artifact directly against the real thing — run the code/tests, inspect the actual output and diff (never rely on proxies, self-reports, or "it compiles"). For Keyhole code changes, run `pnpm typecheck` → `pnpm build` → `pnpm test` (plus manual API/dashboard checks when applicable per `AGENT.md`).

If verification finds a problem the arena missed, either Phase A was wrong (reframe and re-run) or a candidate caught it and you missed the graft (go back to Phase E). Don't paper over it. Clean up temporary worktrees or `/tmp/arena-*` directories after synthesis.

## Outputs

Deliver one synthesized artifact alongside a short synthesis note naming:
- the chosen base and why,
- the cross-judge's verdict (or that cross-vendor judging was skipped/unavailable),
- each graft with its source candidate,
- what was rejected and why,
- any convergence or dropouts, and
- the verification result.
