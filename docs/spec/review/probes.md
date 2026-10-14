# Probes (spec 2.0 review)

Live runs that only the owner can approve. Each: what to run, what it settles, roughly what it costs. Full-mode soldier runs are the owner's own. Nothing here runs without the owner's go.

| ID | What to run | What it settles | Cost | Status |
|---|---|---|---|---|
| P-1 | Spike S6, grok's `perm` case: `node .shadow/v2-tools/probes/s6-grok.mjs perm …` in a throwaway folder (`grok agent stdio`, no server key): a `session/request_permission` pending when `session/cancel` is sent, answered `cancelled`. | CH-6's grok line and M2-AC7's first bullet against grok 1.0.50 (claude's and codex's cases are already confirmed). | One short grok session; a few cents. | waiting for the owner's go (paused 2026-10-13) |
| P-2 | Spike S6, agy's interrupt: look for an interrupt in agy's stream-json; otherwise kill its process tree mid-turn and resume with `--conversation`. | CH-10's agy line (interrupt, or "no interrupt: end the tree and resume by id") and M2-AC6 for agy. | One or two short agy sessions; a few cents. | waiting for the owner's go (paused 2026-10-13) |
| P-3 | Start a claude soldier the way the post office will (stream-json `claude -p`, with installed plugins turned off for that session, for example through `--settings` and `enabledPlugins`, and no `CLAUDE_CODE_PLUGIN_DIRS`) on a machine with a mod installed, and list its tools. | That no installed mod (Shadow Army's own included) loads in a soldier (R-F-28, SET-2). | One short claude session; a few cents. | waiting for the owner's go |
| P-4 | Drive each CLI (claude, codex, grok, agy) past its context window in a throwaway folder, and send one more message. | Whether each CLI compacts by itself after a context overflow or keeps failing, which decides whether a soldier's queue must hold after an overflow (R-F-21, H6, M15/H44). | One long session per CLI; the most expensive probe so far (each fills a window). | waiting for the owner's go |
