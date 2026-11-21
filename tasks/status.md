# Session Status — Accountability App

## Last session
- **Date:** 2026-11-20
- **Tool used:** Claude Code
- **What was done:** Set the repo up for the KC workflow (AGENTS.md, CLAUDE.md, tasks/, PROMPTING.md). Renamed the default branch to `main`. Fixed the app jumping back to the first group after a reload: the open group is now remembered on the device (`src/state/app.tsx`, `pickGroup` in `src/state/select.ts`, tests in `tests/select.test.ts`).
- **What's next:** Seen in the demo walkthrough, not yet looked into: the "Any time" check-in window may not save when adding the first task; the weekly recap date range wraps at phone width; the remembered group is not cleared on sign-out or account deletion. The state of the build is in `docs/HANDOFF.md`.
