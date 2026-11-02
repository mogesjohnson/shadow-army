# F-R4-V1: verifier of R-F-166 and R-F-167 (spec-verifier, Opus, high; 2026-10-29, session 17, Fork 0)

Ran on v0.20 (`v2@4f481fc.md`); packet `batches/F-R4-V1.md`. Saved from the transcript with `tools/save-report.mjs`. R-F-166: DECISION, P1 (owner card D-36 drafted below; recommendation (a), the owner's review alone). R-F-167: CONFIRMED P2. Paste-ready text below.

- id: R-F-166
  verdict: DECISION
  severity: P1 (as given). The repository has been public since 2026-10-23, so a committed secret is exposed at once and stays in history. It is not P0, because the scripted sessions in §5.1 C (lines 917-927) rarely touch a secret file.
  evidence: snapshot `C:/Users/johns/projects/AIConnections/.shadow/v2-tools/review/snapshots/v2@4f481fc.md`.
    - VER-4 :997 says only "redacted before they are committed".
    - WSP-8 :773 says "Fixtures are redacted before they are committed". WSP-8 :774-775 lists the name rule (names ending in key, token, secret, password or credential). `DATABASE_URL=postgres://u:p4ss@host/db` matches none of these, and no URL-password pattern exists.
    - SEC-4 :855 and residual 5 :1819 state that `redact()` misses secrets read from files or the environment. The residual is accepted for logs, which stay local, but nothing accepts it for committed files.
    - §5.1 L :975 asks for "a clean checkout" for live checks only. §5.1 C :917-929 sets no condition on the checkout or the environment, and no rule anywhere asks a person to read a fixture.
    - The gap starts in M1. M1-AC3 :1063 commits a "recorded, redacted claude session", but VER-4 is (M2; R) and is missing from M1's Implements list (:1039). So the first fixture lands with `redact()` as its only guard.
    - settled.md :26 ("M1-AC3 replays a real, redacted recording") settles that fixtures are real and redacted, but not how they are vetted. No ADR covers this (`docs/adr/0009` :31 only cites VER-4).
    - GitHub push protection is free on public repositories (https://github.blog/news-insights/product-news/push-protection-is-generally-available-and-free-for-all-public-repositories/). It covers only provider-pattern secrets, so it would not catch a postgres URL.
  reason: Nothing between recording and commit catches a secret that `redact()` misses. The core fix (a clean checkout and the owner reading each fixture) is plain text, and whether to add a scanner on top is the owner's choice.

  Owner card D-?: how committed contract fixtures are kept free of secrets
  Both options take the shared text below (the clean checkout, the owner reading each fixture whole, and the rule in force from M1).
  - (a) The owner's review alone. There is no new tool. Text: shared text only.
  - (b) Review plus a secret scan of `test/fixtures/`. The scan would need to run locally before the commit (a pre-commit step or an npm script the owner runs). A scan only in CI runs after the branch has been pushed, and on a public repository the secret is public by then. Extra text, added after VER-4's new sentence: "Before a fixture is committed, a secret scanner checks `test/fixtures/`, run by the owner on the machine that recorded it, and CI runs the same scan on every PR; a finding fails the step."
  - Recommendation: (a).
    1. The clean checkout removes the source this scenario needs, and a whole read by a person catches what any pattern list misses. A scanner is pattern-based like `redact()`, and adds a dependency to a project that is meant to stay thin.
    2. The useful part of (b) needs a local step. The CI part detects the secret only after it is public.
    - A cheap extra for either option: add a URL's password (`://user:pass@`) to WSP-8's patterns. That also helps the logs.

  Shared text, paste-ready:
  OLD (VER-4 :997): `- **VER-4** (M2; R) **Fixture provenance.** Contract fixtures are recorded from real CLIs by the owner, and record their date, CLI version and model. They are redacted before they are committed.`
  NEW: `- **VER-4** (M1, M2; R) **Fixture provenance.** Contract fixtures are recorded from real CLIs by the owner, and record their date, CLI version and model. Each is recorded in a clean checkout of the commit under test, with no file in it, and no variable in the CLI's environment beyond the CLI's own login, that holds a secret. Each is redacted (WSP-8), and the owner then reads it whole before it is committed; the PR says so. This holds from M1's first claude fixture (M1-AC3).`
  OLD (WSP-8 :773): `Fixtures are redacted before they are committed, and VER-4 (→M2) adds their provenance.`
  NEW: `Fixtures are redacted before they are committed, and VER-4 adds their provenance and the owner's check.`
  OLD (M1 Implements :1039): `- VER-1, VER-2, VER-3, VER-5, VER-6, VER-7, VER-8, VER-9.`
  NEW: `- VER-1, VER-2, VER-3, VER-4, VER-5, VER-6, VER-7, VER-8, VER-9.`

- id: R-F-167
  verdict: CONFIRMED
  severity: P2 (as given)
  evidence:
    - SEC-6 :857 limits itself to "text from a soldier, a CLI or a config file". The glossary (:62, :84) uses "CLI" for a soldier's CLI, and treats harness git as Shadow Army's own commands, not a CLI's words.
    - Other places add escaping one at a time, which supports the narrow reading: WSP-12 :841 ("Paths are shown as SEC-6 says") and ARM-7 :737 ("Text from the files is escaped as SEC-6 says").
    - These places draw repository text with no escaping stated: the attribution card's "each path and its diff" (ARM-6 :729), the pre-M2 path lines (WSP-11 :803 and PO-1 :223, :227), the working-tree line (WSP-10 :789), the gone-folder line (WSP-11 :798) and `/diff` (WSP-9 :778).
    - The actors table :1783 lists repository content as "Not trusted". Row 4 :1796 covers only "A soldier's words".
    - The ACs test only other sources: M1-AC12 :1108 (fake claude text), M1-AC13 :1117 (a config file), M3-AC7 :1229 and M5-AC6 :1292 (an approval request). None tests a path, diff or ref name.
    - The scenario can happen. U+202E is legal in file names on every system, and ESC is legal on Linux and macOS. Whether git's `core.quotePath` quotes a name depends on how harness git is called (`-z` gives raw bytes), so the spec has to say it. No settled.md or ADR entry covers this.
  reason: Under the stated wording, a file name or diff from a hostile repository can be drawn raw on the card the owner answers y or n on. Widening SEC-6 to every source, with one M1 case and one M2 case, closes it.
  fix, paste-ready:
  OLD (SEC-6 :857): `In text from a soldier, a CLI or a config file, each character of Unicode's control (Cc) and format (Cf) categories`
  NEW: `In every text the mod draws or sends to Claude, whatever its source (a soldier's or a CLI's words, a config file, and the paths, diffs, branch and ref names and working-tree paths that harness git and the guard read from the repository), each character of Unicode's control (Cc) and format (Cf) categories`
  OLD (M1-AC11 :1093): `- **M1-AC11** A fake claude soldier at `auto` (WSP-11, PO-1, WSP-10):`
  NEW: `- **M1-AC11** A fake claude soldier at `auto` (WSP-11, PO-1, WSP-10, SEC-6):`
  ADD after M1-AC11 :1097: `  - a tracked checkout file whose name holds U+202E, and on Linux and macOS ESC too (Windows file names can't hold ESC), changed during a turn, fails that turn, and Claude's transcript line shows each as a placeholder;`
  OLD (M2-AC5 :1175): `- **M2-AC5** Fault tests with a fake agy (ARM-6):`
  NEW: `- **M2-AC5** Fault tests with a fake agy (ARM-6, SEC-6):`
  ADD after M2-AC5 :1178: `  - agy writes a checkout file whose name holds U+202E, and on Linux and macOS ESC too, with a line holding U+202E: the attribution card shows each, in the path and in the diff, as a placeholder;`
  OLD (Appendix D row 4 :1796): `| 4 | A soldier's words to the Monarch, other soldiers and the terminal |`
  NEW: `| 4 | A soldier's words, and text read from the repository, to the Monarch, other soldiers and the terminal |`
  OLD (same row, evidence cell): `MSG-1 (R, I), MSG-6 (I), SEC-6 (U, X); M3-AC3, M3-AC7, M1-AC12, M5-AC6`
  NEW: `MSG-1 (R, I), MSG-6 (I), SEC-6 (U, X); M3-AC3, M3-AC7, M1-AC11, M1-AC12, M2-AC5, M5-AC6`
  (WSP-12 :841's "Paths are shown as SEC-6 says" is now redundant but harmless, and can stay.)

Sources: [GitHub push protection free for public repositories](https://github.blog/news-insights/product-news/push-protection-is-generally-available-and-free-for-all-public-repositories/); [GitGuardian on push protection's limits](https://blog.gitguardian.com/github-push-protection-enhancing-open-source-security-with-limitations-to-consider)
