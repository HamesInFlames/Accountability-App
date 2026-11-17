# One-page spec (phase 1)

Source: "Accountability App: Product Plan and Development Pipeline". Phase 0 (the 14-day group
chat test) was skipped by decision on 2026-11-17, so every default below is untested with real
groups and should be treated as a starting value.

**User.** Students and young workers aged 18 to 25 who already share a group chat. Ages 13+ only.

**Problem.** People make plans, then ignore their calendar. They do not ignore their friends.

**Product.** Groups of 3 to 8. Friends set tasks for themselves and each other, prove completion
with a photo and a written explanation, and keep one shared streak alive.

**Success measure.** Share of groups still checking in on day 30. Target 15% or better.

## MVP feature list (frozen)

| # | Feature | Status in this build |
| --- | --- | --- |
| 1 | Groups, joined by invite code or link | Built |
| 2 | Tasks and habits you set yourself | Built |
| 3 | Tasks set for you by friends, which you accept | Built |
| 4 | Photo check-in with a written explanation | Built (live camera only, no camera roll) |
| 5 | Friend verification of each check-in | Built (approve, question, comment thread, retake) |
| 6 | Group streak | Built |
| 7 | Three strikes with statement and group vote | Built |
| 8 | Weekly finish line and recap | Built |
| 9 | Calendar of due dates and past check-ins | Built |
| 10 | Push nudges, report and block | Built; push delivery needs a device build to verify |

## Out of the MVP

Achievements, monthly and custom finish lines, earned currency and shop, school mode (version 2).
App locking, family mode with under-13s, public communities (later). Real-money stakes or
purchased currency (not planned).

## Rules as built

| Rule | Value |
| --- | --- |
| Active tasks per person | 3 (paused tasks count, pending ones do not) |
| Explanation | At least 20 characters |
| Check-in | Only inside the task's window, dated by the server in the owner's timezone |
| Verification | One other member approves or questions. Unreviewed check-ins count |
| Questioned check-in | Does not count until approved or retaken the same day |
| Streak | +1 for each day every member with something due completes it. Rest days and missed days hold it |
| Strike | One per missed day. 24 hours to post a statement, then 24 hours of voting |
| Vote | A strict majority of the other members settles it at once. At close, a tie or silence excuses |
| Streak break | A member's third upheld strike within one Monday-to-Sunday cycle |
| Finish line | Every Sunday. The recap names who has the most strikes and owes the forfeit |
| Forfeit | Free text written by the group. Recorded and announced, never enforced |

Decisions made while building that the plan left open:

- A day closes for a group only when it has ended in every member's timezone.
- A task accepted or created after its window has closed for the day starts the next day.
- With no statement after 24 hours a strike is upheld; with a statement and no votes it is excused.
- A missed day never grows the streak, even if the strike is later excused.

## Open questions

- The app has no name. "Accountability" is a working title.
- Does required explanation text reduce check-ins, or improve them?
- Does voting on a friend's excuse feel fair or petty?
- Is one approval enough, or should the whole group see and react?
- Removing an inactive member by vote (a mitigation for group death in the plan) is not built.
