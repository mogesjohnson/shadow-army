# M1 round 1, verifier M1-V9 (first verification of the findings verifiers raised): R-M1-57, R-M1-58, R-F-67.

- id: R-M1-57
  verdict: DECISION
  severity: P2 (as given)
  evidence:
    - The vendor fact holds. https://code.claude.com/docs/en/permission-modes#analyze-before-you-edit-with-plan-mode says: "Auto mode available and the `useAutoModeDuringPlan` setting on, which it is by default: the classifier reviews shell commands other than critical-path removals instead of prompting you. Approved commands run, and rejected ones are blocked."
      - The modes table on that page gives `plan` as "Reads, plus classifier-approved commands when auto mode is available".
      - Auto mode is available on every plan for Opus 4.6 or later and Sonnet 4.6 or later, so the default claude soldiers' models (opus, sonnet) qualify.
      - The one case that skips the classifier is an interactive terminal with bypass available. It never applies to `-p`.
    - https://code.claude.com/docs/en/settings-reference#useautomodeduringplan: the default is `true`. The scope is "User, local, or managed. A repository can't turn it off for you." Setting it to `false` gives "a permission prompt for every command outside the built-in read-only set".
    - Supervised is not consistent with itself. A writing turn's `acceptEdits` still asks before other shell commands (https://code.claude.com/docs/en/headless, "Auto-approve tools"). So under supervised, a read-only claude soldier runs more without the owner than a writing one.
    - v1's stated meaning does not match its mapping.
      - C:\Users\johns\projects\AIConnections-review\src\adapters\Adapter.ts:31-33 and C:\Users\johns\projects\AIConnections-review\src\core\config.ts:13 give the classifier to `auto`, and say supervised refuses "commands that need approval".
      - Yet C:\Users\johns\projects\AIConnections-review\src\adapters\claude.ts:13-22 maps supervised to `plan`.
      - So do Codex's draft (C:\Users\johns\projects\AIConnections-m1\src\v2\claude.ts:30) and R-M1-24's pending fix (C:\Users\johns\projects\AIConnections-review\docs\spec\review\ledger.md:134).
    - Nothing settles it.
      - C:\Users\johns\projects\AIConnections-review\docs\spec\review\settled.md:40, CLAUDE.md ("Commands are governed by the vendor at that level") and v0.7 C:\Users\johns\projects\AIConnections-review\docs\spec\v2.md:31 say only that autonomy chooses vendor flags and that Shadow Army never adds or removes a safeguard.
      - No spec line says what supervised lets run: snapshot C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@be9deb0.md CH-2 221-226 and CH-7 253-255; v0.7 §2 :60 and CH-7 :282-284.
      - CH-6 and the non-goal at v2.md:52 still hold, because the classifier answers no request.
    - No Appendix C "could add (v2.0)" item touches this. H24 (v2.md:1002) says "Each CLI classifies its own commands".
    - D-7's option C (C:\Users\johns\projects\AIConnections-review\docs\spec\review\decisions.md:159) relies on the vendor's read-only mode, so it would inherit the same classifier.
  reason: The scenario is real for every supervised claude soldier on a read-only turn. Whether "supervised" may let claude's own classifier approve shell commands, when v1's own comments give the classifier to auto, is a choice about what runs without the owner, and the settled rules leave that to the mapping.
  options:
    - (a) Keep `plan`. CH-2 and the glossary say that a supervised read-only turn's shell commands outside the read-only set go to claude's classifier where auto mode is available. They also say that `useAutoModeDuringPlan: false` in the owner's own user or managed settings makes each such command prompt, through the relay from M2.
    - (b) A supervised read-only turn passes `--permission-mode default`. Each such command then comes to the owner from M2, and is denied in M1 under D-15 (a). This changes v1's mapping and adds requests for the owner.
    - (c) Keep `plan`, and the adapter turns `useAutoModeDuringPlan` off for supervised soldiers.
      - A project file can't do it, by the setting's scope. Whether `--settings` can is undocumented, so this needs a probe.
      - It is Shadow Army changing a vendor default, which v2.md:31 rules out unless the owner amends that rule.
  big or technical: big. Under PLAYBOOK section 14 (C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\PLAYBOOK.md:336) this is about what may happen without the owner. (a) accepts a remaining risk; (b) changes what the owner approves and changes v1's mapping; (c) amends a settled rule.

- id: R-M1-58
  verdict: CONFIRMED
  severity: P2 (as given)
  evidence:
    - The vendor fact holds. https://code.claude.com/docs/en/model-config#automatic-model-fallback:
      - On Opus 5.5, biology-flagged requests re-run on Opus 5 and cybersecurity-flagged requests on Opus 4.8. On Sonnet 5.5, cybersecurity-flagged requests re-run on Sonnet 5.
      - "After a fallback, the session continues on the fallback model."
      - A fallback can trigger on a session's first request, from workspace context alone.
      - In non-interactive mode a flagged request ends with a refusal only under "Ask each time" (`switchModelsOnFlag` false). So by default a `-p` soldier falls back.
    - claude reports the model in use.
      - An assistant message's `message` "includes fields like id, content, model, stop_reason, and usage", and `modelUsage` is keyed by model name (https://code.claude.com/docs/en/agent-sdk/typescript).
      - `system/init` reports the model (https://code.claude.com/docs/en/headless, "Read session metadata").
    - The spec reads none of this.
      - CH-2 reads no model field: snapshot (C:\Users\johns\projects\AIConnections\.shadow\v2-tools\review\snapshots\v2@be9deb0.md) 221-226, and v0.7 C:\Users\johns\projects\AIConnections-review\docs\spec\v2.md:250-255.
      - HOST-4's header "name · id · model" (v2.md:111) doesn't say whether that is the configured model or the reported one.
      - SES-6 (snapshot 357-358, v2.md:386-387) makes "another model" cold at once, without saying whether a switch claude makes by itself counts.
      - OBS-3 (v2.md:508) keeps only the raw fields.
      - Codex's draft reads `model_refusal_no_fallback` (C:\Users\johns\projects\AIConnections-m1\src\v2\claude.ts:227) but never the model.
    - Not a duplicate. R-F-26 (C:\Users\johns\projects\AIConnections-review\docs\spec\review\ledger.md:58, parked for M4; C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\F-r1-chaos.md:131-137) covers changes the owner makes mid-session, not one the CLI makes.
    - Two parts of the proposed fix don't hold.
      - "SES-6 treats it as a change to another model" would show a false cold. The flagged request re-ran on the fallback model and the turn carried on there, so the next message reads that model's cache.
      - "Whether a soldier may fall back" is already settled. ADR-0010 (C:\Users\johns\projects\AIConnections-review\docs\adr\0010-vendor-harnesses-stay-whole.md:11) and CH-7 (v2.md:283) keep the vendor's behavior, and the owner's own `switchModelsOnFlag` chooses it.
    - The roster still saying claude-opus is correct, because ARM-1 is configuration.
  reason: claude can move a soldier to another model mid-session by itself, and the spec never says which model the soldier is then shown and recorded as on, or whether SES-6's model-change rule applies to that switch.
  fix:
    - CH-2 adds a bullet: "**The model in use** is the one claude reports for the main conversation: `system/init`'s `model`, then each main-conversation assistant message's `message.model`. When claude changes it by itself, as its automatic fallback does for a flagged request, the soldier's log records the change, and the pane's header (HOST-4, →M5) and the turn's usage record (OBS-3, →M4) name that model. The roster keeps the configured one (ARM-1). Such a switch is not a change made before a message (SES-6, →M4): the turn's later requests ran on the new model, so the timer runs from the last of them. No adapter passes a setting that changes claude's fallback (CH-7)."
    - HOST-4's header reads "name · id · the model in use (CH-2)".
    - M1-AC4's fake adds a turn whose later assistant messages report another model. The change is logged, and the turn's usage names that model.

- id: R-F-67
  verdict: DUPLICATE (of R-M1-12)
  severity: P2 (as given)
  evidence:
    - The live half is real. v0.7 C:\Users\johns\projects\AIConnections-review\docs\spec\v2.md:564 says: "Requests are counted one by one, by their ids where the CLI gives them, never from a running total: a running total is turned into each turn's share by taking off the total before it."
      - CH-2 (v2.md:251) passes no `--include-partial-messages`, so the only per-request output count in the live stream is the assistant message's.
      - https://code.claude.com/docs/en/agent-sdk/cost-tracking: "Per-step `output_tokens` is a placeholder, so read output tokens from the result message".
    - The headless half is already covered by line 564's last clause.
      - A `--resume` run "reports the conversation's whole total, earlier runs' spend included" (https://code.claude.com/docs/en/headless, "Pipe data through Claude").
      - That is a running total, so its share is that total less the first run's, which is exactly what the proposed fix says. "Where the CLI gives them" already allows a run with no ids.
    - R-M1-12's recorded fix (C:\Users\johns\projects\AIConnections-review\docs\spec\review\ledger.md:122; C:\Users\johns\projects\AIConnections-review\docs\spec\review\raw\M1-r1-verify-V5.md:8) already covers it.
      - It says "SES-7, HOST-15 and §5.1 L add turn figures, never running totals".
      - It takes output "from its `usage`, since an assistant message's output count is a placeholder", and has the after-a-resume rule.
      - It ends "Fix R-F-67 with it".
    - Two notes for that fix:
      - It must reword line 564's "counted one by one, by their ids" for claude.
      - Its resume subtraction holds only from claude 2.1.277. Before that, a session resumed through `claude -p` "started its totals at zero" (cost-tracking, "Accumulate costs across multiple calls"), so R-M1-42's version rule should name 2.1.277 beside it.
  reason: The live half is R-M1-12's defect with R-M1-12's fix (claude's per-message output count is a placeholder, so §5.1 L takes CH-2's turn figures), and the headless half is already handled by line 564's running-total rule.
