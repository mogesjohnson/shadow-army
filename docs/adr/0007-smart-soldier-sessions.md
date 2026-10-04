---
status: accepted (owner decision D1, with a dynamic ceiling, 2026-10-04)
---

# Resume a soldier's session only when that is cheaper than starting fresh

Each chat links one session per soldier (interview Q7). A wake resumes that session only if three conditions hold:
- the vendor cache is still warm (learned TTL)
- its context is under 100k tokens
- the files it last touched are unchanged

Otherwise the wake starts a fresh session primed with a digest of the soldier's own reports, built with no model call. The owner's logs show a cold resume re-reads 470k–881k tokens, while a fresh session with a brief costs about 20–30k. `chat.sessionPolicy: keep` restores always-resume. While a soldier keeps working on the same task, the Monarch may raise its ceiling up to 200k instead of letting it compact (spec CTX-5).
