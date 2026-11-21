# AGENTS.md — project conventions

## Project
- Name: Accountability App (working title; the app has no final name yet)
- Developer: James (Kim Consultant)
- Stack: Expo 58 (React Native 0.88, React 19) with TypeScript and Expo Router; Supabase (Postgres, Auth, Storage, Realtime, Edge Functions); Vitest for unit tests; EAS for device builds
- Repo: github.com/HamesInFlames/Accountability-App

## Commands
- Dev: `npm run web` (browser demo) or `npm start` (Expo dev server for a phone)
- Build: `npm run build:web`
- Test: `npm test` (rules), `npm run test:db` (database, needs a local Postgres), `node tests/e2e/demo.e2e.cjs` and `node tests/e2e/a11y.e2e.cjs` (need the web build served: `npm run build:web && node scripts/serve-web.mjs 4173`)
- Typecheck: `npm run typecheck`
- Lint: none configured

## Code conventions
- Strict TypeScript with `noUncheckedIndexedAccess`. Import aliases: `@/*` is `src/*`, `@domain` is the rules module.
- The product rules live once, as pure TypeScript, in `supabase/functions/_shared/domain/`. The app, the demo and the server all import them; never copy a rule into a screen or a function.
- Screens talk to data only through the `Backend` interface in `src/data/backend.ts`. `SupabaseBackend` is the real one, `LocalBackend` is the on-device demo used when no keys are set. A new data call goes in the interface and both implementations.
- Database reads go through row-level security; writes go through `SECURITY DEFINER` functions in `supabase/migrations/`. The streak, last closed date and strike outcomes are written only by the `end-of-day` function.
- Styling uses the theme tokens in `src/ui/theme.ts` (`colors`, `space`, `radius`) and the shared components in `src/ui/`. Font is Nunito. Light theme only.
- Animation uses React Native Reanimated, not the `motion` package. 21st.dev components (React DOM only) are not used.
- Touch targets are at least 48px, and colours must pass WCAG AA.
- Architecture and the data model are described in `docs/HANDOFF.md`; the product rules in `docs/SPEC.md`.

## Workflow
- Read tasks/todo.md before starting work
- Update tasks/status.md after each session
- Log decisions in tasks/decisions.md
- Run `npm run build:web` before committing

## Do NOT
- Change existing styling, copy or behaviour the task did not ask about
- Install packages without documenting in tasks/decisions.md
- Modify deployment config without approval
- Delete .env files

## Lessons
<!-- added by /kc-workflow:reflect -->
