# Social post draft — state of the harness

**Title / hook: Agents don't ship. Harnesses do.**

**Short (X/LinkedIn):**

I stopped treating my AI agent like a chat window and started treating it like a dev team with a perfect memory and no excuses.

The cycle works for any stack: a quick retro on the last run, a one-page spec, architecture, locked contracts — then I review the PR and say the word. The agent builds in vertical slices, proves the build is clean and the screen actually renders, and brings the result to me. If I want it tailored or debugged, it loops back to the build stage with my feedback in hand. When I'm satisfied, it ships and writes what it learned back to memory. Next feature starts smarter.

One thing worth knowing: the loop transfers across frameworks, but the tool calling doesn't. Codex, Claude Code and Hermes each wire their tools differently. This harness runs on Hermes.

Three things most people skip:

- Skills, just in time. My agent holds 159 procedure cards but loads only the one it needs. And yes, it needs a skill just to navigate its own skills — that's how the context stays small. Memory and session-recall skills do the heavy lifting.
- Real verification. "Done" means a headless browser opened the real screen and read it. Not vibes.
- Token efficiency by design. Just-in-time skills plus tiered memory means the context window stays small and the bill stays low.

Want it fully autonomous? Put the cycle on a cron — every 5 hours it develops, then pauses for your feedback. Give the agent explicit rate limits first; a good plan needs a floor.

any stack. one cycle. approvals stay with you.

---

**Alt hook for X (shorter):**

The difference between an AI chatbot and an agent that ships code is not the model. It's the cycle around it.

retro → spec → contracts → your PR review → slices → verified render → shipped → remembered

159 skills, loaded one at a time. Memory that compounds. Token-efficient by design. And if you want it autonomous: cron every 5h, inside your rate limits, pausing for your feedback.

any stack. one cycle. approvals stay with you.
