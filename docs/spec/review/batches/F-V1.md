# Unit F, round 1, verification batch F-V1 (security)

## R-F-1

- severity: P1
  type: defect
  location: Appendix A (docs/spec/v2.md:729) and G6 (docs/spec/v2.md:44), realizing lead H48 (docs/spec/v2.md:780)
  claim: The frame's carry-over map drops the git-metadata safeguards (2.0 GIT-1..GIT-4), so harness git — including the guard's own `git status` — runs with a hostile repo's configured fsmonitor/hooks/pager/gpg/filter programs active, which is command execution as the owner (P0-class in production).
  scenario: Actor = malicious repo the owner opens, or a prompt-injected soldier that can run commands as the owner. It writes the shared `.git/config` (all worktrees share the common git dir) with `core.fsmonitor = <cmd>` and/or plants `.git/hooks/post-commit`. The next harness git call — the checkout guard's `git status` (WSP-4), the claim audit (WSP-2), or `/apply`'s `git commit`/`git apply` (WSP-5) — executes `<cmd>` as the owner, outside any agy snapshot and before the guard can detect anything. The guard is self-defeating: its own detection step runs the attacker's code. No v2 requirement turns these off.
  evidence: Appendix A line 729 maps WSP-4 only to "v1 #22; 2.0 GUARD-1 to GUARD-4"; WSP-4 (line 401) cites the same and nothing more. Grep of the whole spec finds no `GIT-1..4`, no `fsmonitor`, no `hooksPath`. The legacy 2.0 spec required `-c core.hooksPath=<empty> -c core.fsmonitor=false -c core.pager=cat -c commit.gpgSign=false -c log.showSignature=false` on every harness git (2.0 GIT-1, legacy line 1051) plus `--no-verify` (GIT-4). H48 (line 780) confirms "its git status runs any fsmonitor command that config names" and "v1.0.x has the same gap." G6 (line 44) promises "v1's workspace safety carries over … the guard."
  fix: decision (H48, tracked for bake-off): restore 2.0 GIT-1..GIT-4 as a carried-over requirement — add rows to Appendix A, bring them into WSP-4's scope, and require every harness git invocation (the guard's and the audit's included) to run with hooks/fsmonitor/pager/signing/external-diff/filters disabled and to fingerprint `.git/config`, `hooks/` and `info/`. Until then G6 overstates the carry-over.

## R-F-3

- severity: P1
  type: gap
  location: §2 Glossary (docs/spec/v2.md:55-72), ARM-6 (docs/spec/v2.md:384), §1 G6 (docs/spec/v2.md:44)
  claim: The frame uses `autonomy` as a load-bearing security term but never defines it or its levels (supervised/auto/full), and omits the settled control "an auto/full read-only task runs in a throwaway snapshot," so the boundary "what a soldier may do without the owner" is undefined in the spec.
  scenario: Build a soldier from the spec alone. `autonomy` appears in config (ARM-1, line 376) and "Autonomy chooses only each vendor's documented flags" (CH-7, line 255), but no section defines supervised/auto/full or what each permits. Only agy is placed in a snapshot (ARM-6); a `full`-mode claude/codex/grok soldier doing a read-only task gets no snapshot and no notice in the spec, so it runs with the owner's OS rights and its writes are not discarded — contradicting the settled design rule. An implementer cannot tell what runs without the owner.
  evidence: Grep finds no "supervised", no "full mode"; `/mode [ask|auto|plan|…]` (HOST-9, line 132) is Claude Code's own mode, not soldier autonomy. settled.md lines 40-41 state the embodied rules: "Autonomy (supervised, auto, full) only chooses each vendor's own flags" and "With auto or full, a read-only task runs in a throwaway snapshot, and the checkout guard fails any task during which something outside Shadow Army's branches and worktrees changed." Neither the definition nor the general snapshot rule is in the spec (only ARM-6/agy). G6 claims v1 safety carries over.
  fix: Add an `Autonomy` glossary entry (supervised/auto/full and their effect on vendor flags) and a requirement generalizing ARM-6's throwaway-snapshot-plus-guard to any read-only task under auto/full, per settled.md lines 40-41; give it an X/F test. (Monarch-read-only is separate and remains open as Q1.)

## R-F-4

- severity: P2
  type: gap
  location: §5.1 Security tests (X) (docs/spec/v2.md:471-475)
  claim: §5.1's definition of the X level enumerates four tests and omits controls that carry evidence code X, so "does the security level test each control?" is No.
  scenario: A reviewer checking "every control has an X test" from §5.1 finds loopback (SEC-1), secret refusal (SEC-2), redaction (SEC-4) and "mod has no approval path" (SEC-3), but no entry for soldier-credential isolation (SEC-5: a soldier credential cannot issue a Monarch command, read the event stream, or impersonate another soldier) nor for agy's read-violation/attribution control (ARM-6, coded X), nor any memory test (B2). The containment control at the heart of ADR-0012 is not represented at the level that defines X.
  evidence: §5.1 lines 471-475 list exactly four bullets. SEC-5 (line 420) and ARM-6 (line 384) both carry X but appear in neither §5.1's X nor F lists. The tests do exist in requirements/ACs (M3-AC8, M2-AC5), but §5.1 is the frame's authority on what each evidence level means and under-enumerates it.
  fix: Extend §5.1's X list to include soldier-credential isolation (SEC-5), the agy snapshot/read-violation (ARM-6), and secret-in-memory (B2 outcome), or reference the SEC-* requirements so the level is demonstrably complete.

## R-F-5

- severity: P2
  type: readiness
  location: §1 (docs/spec/v2.md:35-53), §2 (55-72), §3 (74-87)
  claim: The frame defines no threat model: §1/§2/§3 name no assets, no adversaries, and no trust boundaries as such, so the red-team charter ("every trust boundary has a control and an X test") cannot be verified against the text.
  scenario: To confirm coverage I must enumerate boundaries (owner↔Monarch, Monarch↔mod, mod↔post office, post office↔channel, channel↔soldier CLI, soldier↔repo/worktree, soldier↔network/MCP) and assets (checkout/uncommitted work, secrets, vendor accounts/quota, the control plane, logs/records/reports) myself, because the frame lists none. The legacy 2.0 spec had an explicit threat model (assets, adversaries, prevented/detected); v2 dropped it. PLAYBOOK §10 lists "A threat model" as readiness item 1 and X1 plans to write one, but the frame as frozen has none.
  evidence: Grep of the spec finds no "threat", "adversary" or "attacker" outside Appendix C rows. §1 non-goals (lines 51-52) state only "Any service reachable from the network" and "Answering a vendor's permission request on the owner's behalf." Legacy threat model at legacy lines 147-170. PLAYBOOK §10.1 and §2(6).
  fix: Add a short threat-model subsection (or appendix) to the frame: assets, actors with their trust level (Monarch trusted; soldiers, repo content, MCP servers, other local processes untrusted), the trust boundaries of §3, and for each boundary its control and X test. (Structure is technical; accepting any residual risk is a big/owner question.)

## R-F-7

- severity: P2
  type: gap
  location: §1 non-goals (docs/spec/v2.md:47-53), §5.1 Fault/Security (471-491), PO-5 (183), MSG-3 (293)
  claim: The frame sets no resource limits and §5.1 tests no exhaustion, so a hostile soldier or MCP server can deny service by filling the queue, logs or disk.
  scenario: A prompt-injected soldier spams `send` to another soldier; MSG-3 says "Nothing in a queue is dropped silently," so the queue grows unbounded → memory DoS. The post office's append-only logs (PO-5) have no stated size cap → disk DoS. No cap on concurrent soldiers or on brief/summary size is stated. §5.1's F list covers crashes and a failed log write but no "full disk from unbounded log/queue," and no backpressure.
  evidence: PO-5 line 183 sets no size limit; MSG-3 line 293; §5.1 F list lines 476-491. PLAYBOOK §10.3 requires "limits on memory, disk, log size (H62), and soldiers at once; backpressure." H62 (line 937) notes "PO-5 sets no size limit on the post office's own logs," deferred after v2.0.
  fix: decision: state limits (max queue depth, max concurrent soldiers, log size/rotation, brief/summary bytes) and backpressure behavior, with an F test, or declare each an explicit non-goal with the residual-DoS risk stated.

## R-F-8

- severity: P2
  type: ambiguity
  location: §3 Architecture (docs/spec/v2.md:85)
  claim: "Files travel only through worktree branches. Messages carry words, never file contents" reads as an enforced invariant but is only an unenforceable soldier instruction, so it overstates the isolation guarantee.
  scenario: A prompt-injected soldier that has read a secret file pastes its contents verbatim into its five-line summary or its on-disk report. That text is "words," so it crosses the model boundary to the Monarch (summary card) or to another soldier (soldier-to-soldier), and the report path is surfaced to the owner — exfiltration across the isolation boundary the sentence claims to hold. redact() (WSP-8) catches known secret shapes, not arbitrary file contents.
  evidence: §3 line 85 states the invariant; MSG-1 (lines 285-286) restates it as a rule on soldiers, with no enforcing control; WSP-8 (line 409) redacts but does not bound message/report contents to "not a file."
  fix: Reword §3/MSG-1 to mark this as a soldier instruction and transport rule (SA does not itself move file bytes between models), not a guarantee that a model cannot encode file contents as words; note it in the threat model as detected-not-prevented.

## R-F-28

- severity: P1
  type: gap
  location: §2 Mod, §3 (docs/spec/v2.md:72, :82); HOST-1 (:93); G2 (:40)
  claim: Nothing keeps the mod out of claude soldiers. Claude Code runs mods in `claude -p` sessions too, so an installed Shadow Army mod gives every claude soldier the Monarch's `send` tool, and the owner's other installed mods can approve a soldier's tool calls.
  scenario: The owner installs the mod (HOST-1's second path). Iron runs `claude -p` (CH-2) in its worktree. The mod's session.start registers `send` there too. Iron's model calls it with soldier Beru, so HOST-2 starts a post office in Iron's worktree; that is a different folder, so the lock doesn't stop it. Iron now briefs soldiers as a Monarch, which breaks ARM-4, MSG-6 and G1 and spends tokens. Separately, any installed mod whose `tool.check` returns allow approves a soldier's call without the owner, which breaks SEC-3. G2 ("exactly as installed") says to keep such mods; SET-2 drops them only "where the CLI can".
  evidence: The mods types file says `$.session.surfaces()` is "Empty in a plain -p run", "a -p or SDK host receives $.ui.log lines as ui_log", and session.end fires on "a -p run done" (https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts). The mods reference covers tools registered in session.start, `tool.check` returning allow, the sec-default guard loading only with managed settings or Team/Enterprise, and `CLAUDE_CODE_PLUGIN_DIRS` read from the environment, which soldiers inherit (https://code.claude.com/docs/en/plugins/mods/reference). 2.0 F47 (docs/legacy/spec/shadow-army-2.0.md:254): mods run "also under claude -p". NEEDS-PROBE: whether an installed mod's tools reach a stream-json `claude -p` soldier.
  fix: Add to §3: "The mod acts only in the owner's own Claude Code session. In any other session, a soldier's included, it registers no tool or command and starts nothing." Then a decision: how claude soldiers start without installed mods (a documented flag that drops no safeguard, or a recorded residual risk).
