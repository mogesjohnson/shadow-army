---
status: accepted (owner decision D1, with a dynamic ceiling, 2026-10-04)
---

# Resume a soldier's session only when that is cheaper than starting fresh

Each chat links one session per soldier (interview Q7). Under the default `smart` policy (spec SESS-1), a wake resumes that session only while all of these hold:
- the vendor cache is still warm (learned TTL)
- its context is below the soldier's active ceiling
- it is still valid to continue (SESS-8): the soldier's last tip was applied or it only read, no file it read or touched has changed since, and no undo or refused apply has happened

The active ceiling starts at 100k tokens. When a soldier crosses 90% of it and keeps working on the same task line, the Monarch may raise it up to 200k (`context(extend)`, spec CTX-5), and the soldier keeps resuming. A fresh session or an unrelated task returns it to 100k.

When a warm soldier reaches the ceiling without an extension, it is compacted (CMP-2, CMP-3). It writes its own short "what I did" summary in one last turn, and a new session starts primed with it. Only a cold soldier, or a summary turn that fails, gets a digest of its reports instead, built with no model call. A cold soldier starts fresh with that digest.

The owner's logs show a cold resume re-reads 470k–881k tokens, while a fresh session with a brief costs about 20–30k. `chat.sessionPolicy: keep` restores always-resume.
