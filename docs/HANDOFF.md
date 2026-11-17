# Handoff

State of the build on 2026-11-17, and what it takes to get from here to the stores.

## What exists

- The full MVP as an Expo app, running end to end against an on-device demo backend.
- A Supabase backend: schema, row-level security, write functions, storage policies, three Edge
  Functions.
- The product rules as one pure TypeScript module, used by the app, the demo and the server.

## What has been verified, and how

| Area | Verified by | Result |
| --- | --- | --- |
| Rules (tasks, end-of-day, strikes, votes, recap) | `npm test` | 39 tests pass |
| Schema, access rules, write functions | `npm run test:db` on Postgres 16 | 30 expectations and 25 refusal cases pass |
| Every MVP flow in the demo | `tests/e2e/demo.e2e.cjs`, phone-sized Chromium | Both walkthroughs pass |
| Accessibility | `tests/e2e/a11y.e2e.cjs`, axe-core WCAG 2 A/AA | 13 screens, no violations |
| Types | `npm run typecheck` (strict) | Clean |
| Dependencies | `npm audit` | 0 vulnerabilities |

## What has not been verified

Nothing below has been run, because this build was made without a Supabase project, an Expo
account or a physical device.

- **The app against a live Supabase project.** `src/data/supabase.ts` typechecks and calls the
  tested database functions, but no request has been sent to a real project.
- **The Edge Functions.** Their decision logic is the tested `settle()` function; the Deno wrappers
  (loading rows, writing results, sending pushes) have not been executed.
- **Storage policies and realtime** (`supabase/migrations/20261117000100_storage_realtime.sql`).
  These use Supabase-only schemas, so the plain-Postgres tests do not cover them.
- **iOS and Android.** The app has only been run as a web build. The camera, notifications, safe
  areas and keyboard behaviour need checking on real phones.
- **Push notifications.** Token registration needs an EAS project id and a device build.

## Going live

1. Create a Supabase project. In Auth settings decide whether email confirmation is on (the app
   handles both; with it on, sign-up tells the person to confirm and then sign in).
2. Apply the database: `supabase link`, then `supabase db push`.
3. Deploy the functions: `supabase functions deploy end-of-day nudge delete-account`.
4. Schedule the end-of-day job hourly. In the SQL editor, with `pg_cron` and `pg_net` enabled:

   ```sql
   select cron.schedule('end-of-day', '5 * * * *', $$
     select net.http_post(
       url := 'https://<project-ref>.supabase.co/functions/v1/end-of-day',
       headers := jsonb_build_object('Authorization', 'Bearer <service-role-key>', 'Content-Type', 'application/json'),
       body := '{}'::jsonb
     );
   $$);
   ```

   Hourly is enough: a day closes only once it has ended for every member, and the app also asks
   the function to settle its own group when it opens and after each statement or vote.
5. Copy `.env.example` to `.env.local` and fill in the project URL and anon key.
6. `eas init`, then `eas build --profile development` for each platform and test on devices.

## Architecture

**Reads** go straight to Postgres through row-level security: a member can read only rows that
belong to their own groups. **Writes** go through `SECURITY DEFINER` functions that enforce the
rules (task limit, check-in window, the reviewer is not the owner, one vote per member). Tables
have no insert or update policies except comments, nudges, reports and blocks, where a plain
policy is enough.

**Server-owned data.** The streak, the last closed date and strike outcomes are written only by
the `end-of-day` function with the service role. Clients have no grant to change them.

**Time.** Each profile stores a timezone. A check-in's date and its window are decided on the
server in the owner's timezone, so a phone clock cannot back-date proof. A group's day closes when
it has ended for every member.

**Photos.** Taken with the in-app camera only, resized to 1280px JPEG on the device, stored in the
private `proofs` bucket at `<group>/<owner>/<file>`, and shown through one-hour signed URLs.

**Two backends, one interface.** `src/data/backend.ts` defines what screens need.
`SupabaseBackend` is the real one. `LocalBackend` is the demo used when no keys are set. Both call
the same rules module, so the demo behaves like production by construction.

### Data model

| Table | Holds | Key rule |
| --- | --- | --- |
| `profiles` | Name, timezone, push token, nudge setting | Timezone decides when a day ends. Named `profiles` because Supabase owns `auth.users` |
| `groups` | Name, forfeit, invite code, streak, last closed date | Streak is written only by the server |
| `memberships` | User, group, role, left-at | Members read only their own groups. Strikes per cycle are derived, not stored |
| `tasks` | Owner, creator, title, schedule, window, status | Set by someone else means it starts pending |
| `checkins` | Task, date, photo path, explanation, status | One per task per day |
| `verifications` | Check-in, reviewer, decision | Reviewer cannot be the owner |
| `comments` | Check-in, author, body | The thread on a questioned check-in |
| `strikes` | Member, date, statement, outcome | Outcome set by vote or timeout, server only |
| `votes` | Strike, voter, choice | One per member per strike |
| `nudges` | From, to, date | One per friend per day |
| `reports`, `blocks` | Reporter, target, reason | Required for store approval |

## Design decisions

Made up front from the ui-ux-pro-max reference data (habit tracker category), by reading its data
files directly; its search script was not run in this environment.

- Palette: streak amber and progress green on warm paper. Text on amber is dark, and the filled
  green is the darker `#047857`, so both pass WCAG AA.
- Type: Nunito, rounded and friendly, in four weights.
- Motion: spring press feedback on buttons, a bounce on the streak when it changes, spring toasts.
- Touch targets are at least 48px. Light theme only for now.

Departures from the usual web build ritual, because this is a native app: animation uses
React Native Reanimated instead of the `motion` package, and 21st.dev components (React DOM only)
are not used. Lighthouse was not run for the same reason; axe covers accessibility.

## Before launch

- Replace the placeholders in `src/lib/config.ts`: the app name, `SUPPORT_EMAIL` and the invite
  link base. Invite links currently use the `accountability://` scheme, which only works once the
  app is installed. For a link that works before install, host a small landing page on the app's
  domain and set up universal links.
- Replace the template icons and splash image in `assets/images`.
- Confirm the bundle identifier `net.kimconsultant.accountability` in `app.json`.
- Write the real privacy policy and terms and have them reviewed. `src/app/rules.tsx` is a plain
  summary, not a legal document.
- Decide who reviews reports. They are stored in `reports`; nothing reads them yet, and the rules
  page promises a review within 24 hours.
- Add PostHog and Sentry (in the plan, not yet wired).
- Apply for Apple's Family Controls entitlement if app locking is still wanted later.
- Android: recruit 12 testers for the 14-day closed test, or publish from an organization account.

## Not built

- Removing an inactive member by vote.
- Reaching back further than 62 days of history in the app.
- Dark theme.
- Editing a task after it is created (end it and add a new one).
