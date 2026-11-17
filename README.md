# Accountability App

A small-group accountability app. Friends set tasks for themselves and each other, prove
completion with a live photo and a short explanation, and keep one shared streak alive together.

Working title: the app has no name yet. Product plan: see `docs/SPEC.md`.

## Run it

```bash
npm install
npm run web        # demo in the browser
npm start          # Expo dev server: open on a phone with Expo Go or a development build
```

With no configuration the app runs an **on-device demo**: three simulated friends play along and
nothing leaves the device. Create a group to walk the first-run flow, or join with invite code
`DEMO42` to land in a group that has been running for a week. Settings has a control to end the day
so you can watch strikes, votes and the streak update.

To go live, create a Supabase project, apply `supabase/migrations`, deploy `supabase/functions`,
and put the project URL and anon key in `.env.local` (see `.env.example`). Full steps are in
`docs/HANDOFF.md`.

## Checks

| Command | What it covers |
| --- | --- |
| `npm run typecheck` | Strict TypeScript across the app and shared rules |
| `npm test` | 39 unit tests of the rules: tasks, end-of-day, strikes, votes, weekly recap |
| `npm run test:db` | Schema, access rules and write functions against a real Postgres |
| `node tests/e2e/demo.e2e.cjs` | Two full walkthroughs of the demo in a phone-sized browser |
| `node tests/e2e/a11y.e2e.cjs` | axe-core WCAG 2 A/AA scan of 13 screens |

The browser suites need the web build served first:
`npm run build:web && node scripts/serve-web.mjs 4173`.

## Stack

Expo (React Native) with TypeScript and Expo Router, Supabase (Postgres, Auth, Storage, Realtime,
Edge Functions). One codebase for iPhone and Android.

## Layout

```
src/app/            screens (Expo Router). (tabs)/ holds Home, Group, Calendar, My Tasks, Settings
src/ui/             theme tokens and shared components
src/state/          app state and view selectors
src/data/           Backend interface, the Supabase implementation and the demo implementation
supabase/functions/_shared/domain/   the rules, pure TypeScript, shared by app and server
supabase/functions/ end-of-day, nudge, delete-account
supabase/migrations/ schema, row-level security, write functions, storage policies
supabase/tests/     database tests
docs/               spec and handoff
```
