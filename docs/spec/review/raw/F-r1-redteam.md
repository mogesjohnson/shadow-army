# F round 1, red team (snapshot be9deb0)

Unit F (the frame), round 1. Lens: red team. Findings most severe first.

- severity: P1
  type: defect
  location: Appendix A (docs/spec/v2.md:729) and G6 (docs/spec/v2.md:44), realizing lead H48 (docs/spec/v2.md:780)
  claim: The frame's carry-over map drops the git-metadata safeguards (2.0 GIT-1..GIT-4), so harness git — including the guard's own `git status` — runs with a hostile repo's configured fsmonitor/hooks/pager/gpg/filter programs active, which is command execution as the owner (P0-class in production).
  scenario: Actor = malicious repo the owner opens, or a prompt-injected soldier that can run commands as the owner. It writes the shared `.git/config` (all worktrees share the common git dir) with `core.fsmonitor = <cmd>` and/or plants `.git/hooks/post-commit`. The next harness git call — the checkout guard's `git status` (WSP-4), the claim audit (WSP-2), or `/apply`'s `git commit`/`git apply` (WSP-5) — executes `<cmd>` as the owner, outside any agy snapshot and before the guard can detect anything. The guard is self-defeating: its own detection step runs the attacker's code. No v2 requirement turns these off.
  evidence: Appendix A line 729 maps WSP-4 only to "v1 #22; 2.0 GUARD-1 to GUARD-4"; WSP-4 (line 401) cites the same and nothing more. Grep of the whole spec finds no `GIT-1..4`, no `fsmonitor`, no `hooksPath`. The legacy 2.0 spec required `-c core.hooksPath=<empty> -c core.fsmonitor=false -c core.pager=cat -c commit.gpgSign=false -c log.showSignature=false` on every harness git (2.0 GIT-1, legacy line 1051) plus `--no-verify` (GIT-4). H48 (line 780) confirms "its git status runs any fsmonitor command that config names" and "v1.0.x has the same gap." G6 (line 44) promises "v1's workspace safety carries over … the guard."
  fix: decision (H48, tracked for bake-off): restore 2.0 GIT-1..GIT-4 as a carried-over requirement — add rows to Appendix A, bring them into WSP-4's scope, and require every harness git invocation (the guard's and the audit's included) to run with hooks/fsmonitor/pager/signing/external-diff/filters disabled and to fingerprint `.git/config`, `hooks/` and `info/`. Until then G6 overstates the carry-over.

- severity: P1
  type: defect
  location: PO-3 (docs/spec/v2.md:172), SEC-2 (docs/spec/v2.md:417), SEC-3 (docs/spec/v2.md:418), realizing lead B2 (docs/spec/v2.md:782)
  claim: PO-3's MUST-NOT enumeration and SEC-2's X test cover only disk/command-line/environment, omitting process memory, so a same-user attacker reads the Monarch's secret from the post office or mod and then issues Monarch commands, including answering a soldier's own approval requests — acting without the owner (P0-class).
  scenario: A prompt-injected soldier runs code as the owner's user. On Windows (OpenProcess+ReadProcessMemory) or Linux with unrestricted ptrace, it reads the 32-byte Monarch secret out of the post office's or mod's heap (the post office must hold it to authenticate commands). With the secret it drives the mod→post-office command path, relays an "approve option N" answer to its own pending `can_use_tool`/approval request, and runs any tool. SEC-3's "the mod has no approval path" test passes while the attacker approves through the authenticated command channel.
  evidence: PO-3 line 172 forbids the secret "to disk, a command line, an environment variable, or anywhere a soldier can read. Soldiers run as the same user" — it names "anywhere a soldier can read" but then enumerates only three places, and SEC-2 (line 417) tests exactly those three ("appears in no file, command line or environment variable"). Memory is never addressed. B2 (line 782): "a soldier … could take the secret from the post office or the mod, and then answer its own approval requests." §5.1's X list (lines 471-475) has no memory test.
  fix: decision (B2, tracked): extend PO-3 to cover the secret in memory and make the post office's/mod's secret memory unreadable where the OS allows (and state the residual risk where it does not); add an X test. Options include per-run secret rotation, OS memory-protection flags, or accepting the risk on systems that cannot (acceptance is a big/owner question per PLAYBOOK §14).

- severity: P1
  type: gap
  location: §2 Glossary (docs/spec/v2.md:55-72), ARM-6 (docs/spec/v2.md:384), §1 G6 (docs/spec/v2.md:44)
  claim: The frame uses `autonomy` as a load-bearing security term but never defines it or its levels (supervised/auto/full), and omits the settled control "an auto/full read-only task runs in a throwaway snapshot," so the boundary "what a soldier may do without the owner" is undefined in the spec.
  scenario: Build a soldier from the spec alone. `autonomy` appears in config (ARM-1, line 376) and "Autonomy chooses only each vendor's documented flags" (CH-7, line 255), but no section defines supervised/auto/full or what each permits. Only agy is placed in a snapshot (ARM-6); a `full`-mode claude/codex/grok soldier doing a read-only task gets no snapshot and no notice in the spec, so it runs with the owner's OS rights and its writes are not discarded — contradicting the settled design rule. An implementer cannot tell what runs without the owner.
  evidence: Grep finds no "supervised", no "full mode"; `/mode [ask|auto|plan|…]` (HOST-9, line 132) is Claude Code's own mode, not soldier autonomy. settled.md lines 40-41 state the embodied rules: "Autonomy (supervised, auto, full) only chooses each vendor's own flags" and "With auto or full, a read-only task runs in a throwaway snapshot, and the checkout guard fails any task during which something outside Shadow Army's branches and worktrees changed." Neither the definition nor the general snapshot rule is in the spec (only ARM-6/agy). G6 claims v1 safety carries over.
  fix: Add an `Autonomy` glossary entry (supervised/auto/full and their effect on vendor flags) and a requirement generalizing ARM-6's throwaway-snapshot-plus-guard to any read-only task under auto/full, per settled.md lines 40-41; give it an X/F test. (Monarch-read-only is separate and remains open as Q1.)

- severity: P2
  type: gap
  location: §5.1 Security tests (X) (docs/spec/v2.md:471-475)
  claim: §5.1's definition of the X level enumerates four tests and omits controls that carry evidence code X, so "does the security level test each control?" is No.
  scenario: A reviewer checking "every control has an X test" from §5.1 finds loopback (SEC-1), secret refusal (SEC-2), redaction (SEC-4) and "mod has no approval path" (SEC-3), but no entry for soldier-credential isolation (SEC-5: a soldier credential cannot issue a Monarch command, read the event stream, or impersonate another soldier) nor for agy's read-violation/attribution control (ARM-6, coded X), nor any memory test (B2). The containment control at the heart of ADR-0012 is not represented at the level that defines X.
  evidence: §5.1 lines 471-475 list exactly four bullets. SEC-5 (line 420) and ARM-6 (line 384) both carry X but appear in neither §5.1's X nor F lists. The tests do exist in requirements/ACs (M3-AC8, M2-AC5), but §5.1 is the frame's authority on what each evidence level means and under-enumerates it.
  fix: Extend §5.1's X list to include soldier-credential isolation (SEC-5), the agy snapshot/read-violation (ARM-6), and secret-in-memory (B2 outcome), or reference the SEC-* requirements so the level is demonstrably complete.

- severity: P2
  type: readiness
  location: §1 (docs/spec/v2.md:35-53), §2 (55-72), §3 (74-87)
  claim: The frame defines no threat model: §1/§2/§3 name no assets, no adversaries, and no trust boundaries as such, so the red-team charter ("every trust boundary has a control and an X test") cannot be verified against the text.
  scenario: To confirm coverage I must enumerate boundaries (owner↔Monarch, Monarch↔mod, mod↔post office, post office↔channel, channel↔soldier CLI, soldier↔repo/worktree, soldier↔network/MCP) and assets (checkout/uncommitted work, secrets, vendor accounts/quota, the control plane, logs/records/reports) myself, because the frame lists none. The legacy 2.0 spec had an explicit threat model (assets, adversaries, prevented/detected); v2 dropped it. PLAYBOOK §10 lists "A threat model" as readiness item 1 and X1 plans to write one, but the frame as frozen has none.
  evidence: Grep of the spec finds no "threat", "adversary" or "attacker" outside Appendix C rows. §1 non-goals (lines 51-52) state only "Any service reachable from the network" and "Answering a vendor's permission request on the owner's behalf." Legacy threat model at legacy lines 147-170. PLAYBOOK §10.1 and §2(6).
  fix: Add a short threat-model subsection (or appendix) to the frame: assets, actors with their trust level (Monarch trusted; soldiers, repo content, MCP servers, other local processes untrusted), the trust boundaries of §3, and for each boundary its control and X test. (Structure is technical; accepting any residual risk is a big/owner question.)

- severity: P2
  type: gap
  location: §1 G6 (docs/spec/v2.md:44), Appendix A (722-741), VIS-2 (426), realizing H25 (docs/spec/v2.md:781,1026)
  claim: The frame drops 2.0 SAFE-7 (terminal-escape/control-character stripping) and no v2 requirement replaces it, so a hostile repo or prompt-injected soldier can spoof or hide the owner's UI.
  scenario: A soldier emits ANSI/OSC escape sequences, bidi controls or invisible characters in its summary/report. The mod draws soldier text in the pane, army strip and status-line entry (HOST-4/6/7) and as transcript rows (HOST-11); unsanitized escapes can repaint the terminal, forge a decision prompt, overwrite the "needs you" line, or hide a soldier's activity from the owner.
  evidence: Grep finds no "escape sequence"/"control character" handling in the spec; Appendix A (lines 724-741) carries 2.0 SAFE-6 as WSP-8 (redaction) but not SAFE-7 (legacy line 1036: strip C0/C1, ESC/CSI/OSC). VIS-2 (line 426) covers ASCII fallbacks and "never colour alone," not escape stripping. H25 (line 1026): "Nothing covers control characters, escape sequences or invisible characters."
  fix: decision (H25, tracked): add a requirement that all soldier/vendor/config text is sanitized to visible placeholders wherever the mod draws it and escaped in what reaches Claude, carried from 2.0 SAFE-7, with an X test (H25's "Touches" names MSG-1, MSG-5, HOST-4, HOST-11, SEC).

- severity: P2
  type: gap
  location: §1 non-goals (docs/spec/v2.md:47-53), §5.1 Fault/Security (471-491), PO-5 (183), MSG-3 (293)
  claim: The frame sets no resource limits and §5.1 tests no exhaustion, so a hostile soldier or MCP server can deny service by filling the queue, logs or disk.
  scenario: A prompt-injected soldier spams `send` to another soldier; MSG-3 says "Nothing in a queue is dropped silently," so the queue grows unbounded → memory DoS. The post office's append-only logs (PO-5) have no stated size cap → disk DoS. No cap on concurrent soldiers or on brief/summary size is stated. §5.1's F list covers crashes and a failed log write but no "full disk from unbounded log/queue," and no backpressure.
  evidence: PO-5 line 183 sets no size limit; MSG-3 line 293; §5.1 F list lines 476-491. PLAYBOOK §10.3 requires "limits on memory, disk, log size (H62), and soldiers at once; backpressure." H62 (line 937) notes "PO-5 sets no size limit on the post office's own logs," deferred after v2.0.
  fix: decision: state limits (max queue depth, max concurrent soldiers, log size/rotation, brief/summary bytes) and backpressure behavior, with an F test, or declare each an explicit non-goal with the residual-DoS risk stated.

- severity: P2
  type: ambiguity
  location: §3 Architecture (docs/spec/v2.md:85)
  claim: "Files travel only through worktree branches. Messages carry words, never file contents" reads as an enforced invariant but is only an unenforceable soldier instruction, so it overstates the isolation guarantee.
  scenario: A prompt-injected soldier that has read a secret file pastes its contents verbatim into its five-line summary or its on-disk report. That text is "words," so it crosses the model boundary to the Monarch (summary card) or to another soldier (soldier-to-soldier), and the report path is surfaced to the owner — exfiltration across the isolation boundary the sentence claims to hold. redact() (WSP-8) catches known secret shapes, not arbitrary file contents.
  evidence: §3 line 85 states the invariant; MSG-1 (lines 285-286) restates it as a rule on soldiers, with no enforcing control; WSP-8 (line 409) redacts but does not bound message/report contents to "not a file."
  fix: Reword §3/MSG-1 to mark this as a soldier instruction and transport rule (SA does not itself move file bytes between models), not a guarantee that a model cannot encode file contents as words; note it in the threat model as detected-not-prevented.

- severity: P3
  type: editorial
  location: §2 Glossary (docs/spec/v2.md:55-72)
  claim: The glossary omits load-bearing terms used across units, which the frame exists to define.
  scenario: Other units use "owner," "guard"/"checkout guard," "worktree," "snapshot," "claim"/"claim audit," and "attribution card" as if defined; the frame defines none of them, so each unit reinvents the term.
  evidence: §2 lines 55-72 define 16 terms; none of the above. They appear in §3, G6, WSP-2/WSP-4, ARM-6, HOST-14 and throughout.
  fix: Add glossary entries for owner, worktree, snapshot, checkout guard, claim/claim audit and attribution card (autonomy is covered by the P1 finding above).

Coverage: §0 (lines 14-33); §1 goals G1-G7 and all non-goals (35-53); §2 glossary (55-72); §3 architecture and the mod/post-office/channel/soldier trust boundaries and the Monarch/soldier credentials (74-87); §5.1 all levels U/C/I/X/F/S/L/R, with focus on the X list vs. X-coded requirements SEC-1..5, ARM-6 (450-498); §7 Decisions (698-709); §8 Open questions Q1-Q8 (711-720); Appendix A carry-over map (722-741); Appendix B traceability rules (743-751). Cross-checked into §4: PO-2/PO-3/PO-4/PO-5 (169-184), CH-6/CH-7 (241-255), HOST-12/HOST-13 (145-146), ARM-1/ARM-5/ARM-6 (376-394), WSP-2/WSP-4/WSP-8 (399-409), MSG-1/MSG-3 (285-293), SEC-1..5 (416-420), VIS-2 (426). Against ADR-0008/0010/0012, settled.md (lines 40-42), legacy 2.0 threat model and SAFE/GIT/GUARD/POL sections, and Appendix C leads H48/H25/B2. Leads H48 and B2 both reproduce as above; no new refutation of either.
