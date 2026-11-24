---
name: interrogate
description: "Use for \"interrogate\", \"adversarial review\", \"multi-model review\", \"challenge this\", \"stress test this code\", \"find blind spots\", or \"tear this apart\". Adversaries try to break a change or design, and only findings proven by a run survive."
disable-model-invocation: true
---

# Interrogate

Adversaries try to break a change or a design. A finding survives only when a run proves it. Report the findings. Do not apply fixes.

## Frame

The scope is what the user names. Otherwise it is the branch diff from its merge base with the base branch (`main`), through the working tree. State the intent with the **in-your-own-words** skill (`.agents/skills/in-your-own-words/`), from the user's message, the commits, and the PR description. Ask the user when the intent is unclear.

## Fan out

Run Phase A (steps 3 and 4) and Phase B of the **arena** skill (`.agents/skills/arena/`), with four changes:

1. Pick 2–3 independent adversary reviewers (preferring diverse models across vendors/tiers when the harness supports model selection; otherwise use fresh independent subagents and note it).
2. Copy the scope's uncommitted changes into each adversary's isolated workspace (worktree or temp copy) so adversaries can run repros without mutating the main tree or colliding with each other.
3. Spawn each adversary with command-execution capability (not read-only) so it can write and run repros in its own workspace.
4. In place of the arena task and rationale, give each adversary the scope, the intent, and this brief:

> Break this change. Prove each finding with a run against the real code, such as a failing test, a repro script, or command output that shows the wrong behavior. For a design or plan, run a prototype or probe the current tree. Keep repros in your own workspace. Report each finding with a title, the exact command, the output it printed, and the output the intent requires. Leave out anything you did not run. That covers style, naming, structure, and risks that need a future change to matter. No findings is a valid result.

### Keyhole safety guardrails for adversaries

- Never use real Google tokens, the primary calendar, or production DB/secrets in repros.
- Run repros against Vitest (`pnpm --filter ./api test`), local fakes, or `TEST_CALENDAR_ID` only.
- Never print `Authorization`, `kh_live_*` raw keys, OAuth tokens, or `DATA_ENCRYPTION_KEY` in repro output.

## Verify

Verify each finding per **arena** Phase F by rerunning its command against the real tree. Keep a finding only when the output proves the failure AND the failure breaks the stated intent. Drop the rest. Merge findings that share a root cause. Clean up temporary adversary workspaces afterwards.

Skip **arena** Phases C, D, and E. Adversaries find different failures, so the verdict keeps every verified finding, not one adversary's list.

## Output

- **Intent:** the restatement.
- **Findings:** for each verified finding, the command, its output, how it breaks the intent, and the adversaries that found it. Say "no verified findings" when none survive.
- **Dropped:** for each adversary, the count of dropped findings and why.
