// End-to-end walk through the demo build in a phone-sized browser.
//   npm run build:web && node scripts/serve-web.mjs 4173 &   then   node tests/e2e/demo.e2e.cjs
// Set SHOTS=<dir> to save a screenshot of every step.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const SHOTS = process.env.SHOTS;

async function session(browser, name, fn) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOTS ? 2 : 1, permissions: ['camera'], timezoneId: 'America/Toronto' });
  // A fixed Wednesday morning, so check-in windows are open and the week has history behind it.
  await ctx.clock.setFixedTime(new Date('2026-11-18T10:00:00-05:00'));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let n = 0;
  const shot = async (label) => {
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}-${String(++n).padStart(2, '0')}-${label}.png`) });
  };
  const see = (text) => page.getByText(text, { exact: false }).first().waitFor({ timeout: 8000 });
  const tab = (label) => page.getByRole('tab', { name: label }).click();
  try {
    await fn({ page, shot, see, tab });
  } catch (e) {
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}-FAILED.png`) });
    throw e;
  }
  assert.deepEqual(errors, [], 'no uncaught page errors');
  await ctx.close();
  console.log(`ok  ${name}`);
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

  await session(browser, 'first-run', async ({ page, shot, see, tab }) => {
    await page.goto(BASE);
    await see('Start the demo');
    await shot('welcome');

    // Validation: a name is required.
    await page.getByTestId('submit').click();
    await see('Tell your friends what to call you');
    await page.getByTestId('name').fill('James');
    await page.getByTestId('submit').click();

    await see('Who is keeping you honest?');
    await page.getByTestId('group-name').fill('Exam Season');
    await page.getByLabel('The forfeit').fill('Most strikes buys the coffee');
    await shot('create-group');
    await page.getByTestId('create-group').click();

    await see('Invite code');
    const code = await page.getByTestId('invite-code-display').innerText();
    assert.match(code, /^[A-Z0-9]{6}$/);
    await shot('invite');
    await page.getByTestId('next').click();

    await page.getByTestId('add-task').click();
    await see('Give the task a title');
    await page.getByTestId('task-title').fill('Study two hours');
    await shot('first-task');
    await page.getByTestId('add-task').click();
    await page.getByTestId('finish').click();

    // Straight into the camera.
    await page.getByTestId('shutter').waitFor({ timeout: 10000 });
    await page.waitForTimeout(1500);
    await shot('camera');
    await page.getByTestId('shutter').click();
    await see('What did you do, and how?');
    await page.getByTestId('submit-checkin').click();
    await see('Write at least 20 characters');
    await page.getByTestId('explanation').fill('Finished chapter four and did the practice questions.');
    await shot('explain');
    await page.getByTestId('submit-checkin').click();

    await see('Waiting for review');
    await shot('home');

    // A friend set a task for me: accept it.
    await see('Read 20 pages');
    await page.getByTestId('accept-task').click();
    await see('Task accepted');

    // Approve a friend's check-in.
    await see('Waiting for your approval');
    await page.getByText('Maya · Gym before class').first().click();
    await see('Does this prove the task was done?');
    await shot('proof');
    await page.getByTestId('approve').click();
    await see('You approved this');
    await page.getByLabel('Go back').click();

    await tab('Group');
    await see('The forfeit');
    await see('Proof feed');
    await shot('group');

    await tab('Calendar');
    await see('Checked in');
    await shot('calendar');

    await tab('My Tasks');
    await see('2 of 3 task slots used');
    await shot('tasks');

    // A third task fills the limit; a fourth is refused.
    await page.getByTestId('new-task').click();
    await page.getByTestId('task-title').fill('Stretch');
    await page.getByTestId('save-task').click();
    await see('3 of 3 task slots used');
    await page.getByTestId('new-task').click();
    await see('You already have 3 active tasks');
    await page.getByLabel('Go back').click();

    // End the day: I did 1 of 3 tasks, so I get a strike and the streak holds at 0.
    await tab('Settings');
    await page.getByTestId('advance-day').click();
    await see('A new day has started');
    await shot('settings');
    await tab('Home');
    await see('Needs you now');
    await see('Tell the group why');
    assert.equal(await page.getByTestId('streak').innerText(), '0');
    await shot('home-strike');

    // Post a statement; the simulated friends vote 2 to 1 to excuse.
    await page.getByText('Tell the group why').first().click();
    await page.getByTestId('statement').fill('Had a migraine after lunch and went to bed early.');
    await page.getByTestId('post-statement').click();
    await see('Excused by the group');
    await shot('strike-excused');
  });

  await session(browser, 'join-established', async ({ page, shot, see, tab }) => {
    await page.goto(BASE);
    await page.getByTestId('name').fill('Robin');
    await page.getByTestId('submit').click();
    await page.getByText('I have an invite code').click();
    await page.getByTestId('invite-code').fill('demo42');
    await page.getByTestId('join-group').click();
    await see('You are in The Library Crew');
    await page.goto(BASE);

    await see('day group streak');
    assert.equal(await page.getByTestId('streak').innerText(), '5');
    await see('Your vote is needed');
    await shot('home');

    // Leo missed yesterday and posted a statement. One friend already voted to excuse;
    // my vote makes a majority (2 of 3) and settles it at once.
    await page.getByText('Your vote is needed').first().click();
    await see('café');
    await shot('strike');
    await page.getByTestId('vote-excuse').click();
    await see('Excused by the group');

    await page.getByLabel('Go back').click();
    await page.getByText("This week's recap").click();
    await see("Everyone's week");
    await shot('recap');
    await page.getByLabel('Go back').click();

    await tab('Calendar');
    await see('November 2026');
    await page.waitForTimeout(400);
    await shot('calendar');

    // Question a check-in with a comment, then report it.
    await tab('Home');
    await page.getByText('Maya · Gym before class').first().click();
    await page.getByTestId('comment').fill('Is this from today?');
    await page.getByTestId('question').click();
    await see('You questioned this');
    await see('Is this from today?');
    await page.getByTestId('report').click();
    await see('What is wrong with this check-in?');
    await shot('proof-questioned');

    // Rules page is reachable; reset wipes the demo back to the welcome screen.
    await page.goto(`${BASE}/rules`);
    await see('Report and block');
    await page.goto(BASE);
    await tab('Settings');
    await page.getByText('Reset the demo').click();
    await see('Start the demo');
  });

  await browser.close();
  console.log('ALL E2E CHECKS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
