// Accessibility scan (axe-core, WCAG 2 A/AA) of the main screens in the demo web build.
//   node scripts/serve-web.mjs 4173 &   then   node tests/e2e/a11y.e2e.cjs
const { chromium } = require('playwright');
const axe = require('axe-core');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Toronto' });
  await ctx.clock.setFixedTime(new Date('2026-11-18T10:00:00-05:00'));
  const page = await ctx.newPage();
  let failures = 0;

  const scan = async (name) => {
    await page.waitForTimeout(700);
    await page.evaluate(axe.source);
    const result = await page.evaluate(() =>
      // Tab screens that are mounted but hidden are skipped by axe automatically.
      window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }),
    );
    const bad = result.violations;
    console.log(`${bad.length === 0 ? 'ok  ' : 'FAIL'} ${name}`);
    for (const v of bad) {
      failures++;
      console.log(`     ${v.id} (${v.impact}): ${v.help}`);
      for (const n of v.nodes.slice(0, 3)) console.log(`       ${n.html.slice(0, 140)}`);
    }
  };
  const tab = (label) => page.getByRole('tab', { name: label }).click();

  await page.goto(BASE);
  await page.getByTestId('name').waitFor();
  await scan('welcome');
  await page.getByTestId('name').fill('Robin');
  await page.getByTestId('submit').click();
  await page.getByText('I have an invite code').click();
  await scan('start');
  await page.getByTestId('invite-code').fill('DEMO42');
  await page.getByTestId('join-group').click();
  await page.getByText('You are in').waitFor();
  await scan('first-run');
  await page.goto(BASE);
  await page.getByTestId('streak').waitFor();
  await scan('home');
  await page.getByText('Your vote is needed').first().click();
  await scan('strike');
  await page.getByLabel('Go back').click();
  await page.getByText('Maya · Gym before class').first().click();
  await scan('proof');
  await page.getByLabel('Go back').click();
  for (const t of ['Group', 'Calendar', 'My Tasks', 'Settings']) {
    await tab(t);
    await scan(t.toLowerCase());
  }
  await page.getByTestId('new-task').waitFor({ state: 'attached' });
  await tab('My Tasks');
  await page.getByTestId('new-task').click();
  await scan('new task');
  await page.goto(`${BASE}/recap`);
  await page.getByText("Everyone's week").waitFor();
  await scan('recap');
  await page.goto(`${BASE}/rules`);
  await scan('rules');

  await browser.close();
  if (failures) {
    console.error(`${failures} accessibility violation(s)`);
    process.exit(1);
  }
  console.log('NO ACCESSIBILITY VIOLATIONS');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
