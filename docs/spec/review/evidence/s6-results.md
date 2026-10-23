# Spike S6 (interrupt a turn, keep the session): results so far

Copied from STATE.md on 2026-10-14. All live, in throwaway folders, with nothing ever approved except one background sleep. Probes: .shadow/v2-tools/probes/s6-claude.mjs, s6-codex.mjs, s6-grok.mjs. Not yet posted on #63.

5. **Spike S6: in progress, paused at the owner's request (2026-10-13).** The probes are `probes/s6-claude.mjs`, `s6-codex.mjs` and `s6-grok.mjs`; each states its usage and scenarios in its first lines. Raw logs are in session c48047d3's private scratchpad, under `s6/`. The results so far, all live, in throwaway folders, with nothing ever approved except the one background `sleep`:
   - **claude 2.1.296** (haiku), all four confirmed:
     - **Interrupt.** The `interrupt` control request is answered at once (`still_queued: []`). Then come the partial assistant message and a synthetic user message, "[Request interrupted by user]". The result is `error_during_execution` with `is_error`, and **its usage is all zeros**. The next message is answered with history.
     - **A pending `can_use_tool` at the interrupt.** `control_cancel_request` carries that request's id and comes 3 ms after the interrupt, before its response. Then a rejected tool_result, "[Request interrupted by user for tool use]", and an `error_during_execution` result with `stop_reason: tool_use`. Nothing is written.
     - **Background tasks.** `system/task_started` (`task_id`, `tool_use_id`, `is_backgrounded`, `task_type: local_bash`) and `system/background_tasks_changed` arrive during the turn, before `result`, and the task outlives `result`.
     - **`stop_task`** (`{subtype, task_id}`) gets an empty success, then `task_updated` (killed), `task_notification` (`status: stopped`, `output_file`) and an empty `background_tasks_changed`. **No follow-up turn** came within 60 s.
     - **A background command that finishes by itself** gives `task_notification` (`status: completed`), and claude **then takes a follow-up turn by itself** with the outcome. That confirms PO-8.
   - **codex 0.160.0**, both confirmed:
     - **Interrupt.** `turn/interrupt` gets `{}`, then `turn/completed` with status `interrupted` within about 40 ms, and the next turn has the history. No `thread/tokenUsage/updated` came for that turn.
     - **A pending `item/commandExecution/requestApproval` at the interrupt.** `turn/completed` (interrupted) comes first, then `serverRequest/resolved {threadId, requestId}`, after it, at the same moment. The command was aborted (`TurnAborted`) and nothing was written.
   - **grok 1.0.50 (`grok agent stdio`, no key).** The cancel is confirmed: `session/cancel` makes `session/prompt` answer with `stopReason: cancelled` within milliseconds, and the next prompt has the history.
   - **Still to do:**
     - grok's `perm` scenario (`node s6-grok.mjs perm …`);
     - agy: look for an interrupt; otherwise test killing it and resuming with `--conversation`;
     - post the S6 report on #63.
   - **Spec points to raise.** None is written yet:
     - an interrupted claude turn's `result` reports zero usage, and codex may send no usage for one, so take usage from the turn's own stream, or record "not reported" (CH-2, OBS-3). CH-2 is M1, so tell Codex (done: Codex's M1-R2 at `bb20a8b` does this);
     - **running totals** (from Codex's #74 review, simulation 7): OBS-3 keeps raw fields beside "normalized ones" but never says how a running total becomes a turn's or an interval's figure. agy's usage is a running total (CH-5), and Codex cites Claude's cost-tracking page for claude's cost being cumulative in streaming input, including a resumed session's earlier spend (check that page before writing it). Say that a turn's figure is the difference from the last report in the same session; that an interrupted turn's missing or zero report is "not reported", never a new baseline, so the next turn doesn't take on the stopped work (compare how Codex's M1-R2 handles the boundary at `bb20a8b`, `src/v2/claude.ts`); and that SES-7 and HOST-15 add turn figures, never running totals. Write it with the S6 points, in one place;
     - codex resolves a cleared request after `turn/completed`, which CH-6 already allows;
     - claude's interrupt result reads `error_during_execution`, and the adapter must treat it as the stop's end, not as an error kind (CH-1, PO-8).

   What S6 had to confirm:
   - each CLI's interrupt, agy's included;
   - claude's `control_cancel_request` for a permission request pending at an interrupt;
   - codex's `serverRequest/resolved` for a cleared approval;
   - claude's background-task events (`task_started`, `background_tasks_changed`, `task_notification`) and `stop_task`.
