// Browser tests for the incident board. Run: node --test test/board.spec.mjs
// Serves app/ locally and mocks the incident API with page.route, except the R6 test,
// which reads the deployed board against the real API and never clicks Ack.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/home/kyleb/.local/share/mise/installs/playwright/latest/node_modules/playwright/index.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(REPO, 'app');
const API_GLOB = 'https://hq.mega.dev/challenges/show-me-when/api/**';
const DEPLOYED = 'https://mega-s03e04-board.tannermsharon.workers.dev/';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const CORS = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };

let server;
let base;
let browser;

before(async () => {
  server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://x').pathname;
    const file = path.join(APP, pathname === '/' ? 'index.html' : pathname);
    if (!file.startsWith(APP)) return res.writeHead(403).end();
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ executablePath: '/usr/sbin/chromium' });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
});

const incident = (n, openedAt = new Date(Date.UTC(2026, 10, 12, 3, n)).toISOString()) => ({
  id: `INC-${n}`,
  service: 'booking-api',
  region: 'eu-central',
  summary: `incident ${n}`,
  severity: 'sev2',
  openedAt,
});

/**
 * Opens the board with a mocked API. `api.incidents` is what the next poll returns (newest first);
 * mutate it to simulate new incidents. Every poll and ack request is recorded, and `api.served`
 * holds when each poll was answered with which ids. `initScript` runs in the page before the app.
 */
async function openBoard({ incidents = [], firstDelayMs = 0, ackStatus = 200, ackDelayMs = 0, contextOptions = {}, initScript } = {}) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  if (initScript) await page.addInitScript(initScript);
  const api = { incidents, ackStatus, ackDelayMs, polls: [], acks: [], served: [] };
  let cursorN = 0;
  await page.route(API_GLOB, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/incidents')) {
      api.polls.push({ at: Date.now(), since: url.searchParams.get('since') });
      if (api.polls.length === 1 && firstDelayMs) await new Promise((r) => setTimeout(r, firstDelayMs));
      const body = { updatedAt: new Date().toISOString(), incidents: api.incidents, cursor: `c${++cursorN}` };
      await route.fulfill({ status: 200, headers: CORS, body: JSON.stringify(body) });
      api.served.push({ at: Date.now(), ids: api.incidents.map((i) => i.id) });
      return;
    }
    if (url.pathname.endsWith('/ack')) {
      const id = url.searchParams.get('id');
      api.acks.push({ id, cursor: url.searchParams.get('cursor') });
      if (api.ackDelayMs) await new Promise((r) => setTimeout(r, api.ackDelayMs));
      if (api.ackStatus !== 200) return route.fulfill({ status: api.ackStatus, headers: CORS, body: 'boom' });
      const body = { id, ackedAt: '2026-11-12T03:30:00.000Z', receipt: `r-${id}` };
      return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify(body) });
    }
    return route.abort();
  });
  await page.goto(base);
  return { page, api, close: () => context.close() };
}

const rowIds = (page) => page.$$eval('[data-testid="incident-row"]', (rows) => rows.map((r) => r.dataset.id));
async function waitForPolls(page, api, n) {
  const deadline = Date.now() + 10_000;
  while (api.polls.length < n) {
    if (Date.now() > deadline) throw new Error(`only ${api.polls.length} polls, wanted ${n}`);
    await page.waitForTimeout(100);
  }
}

/** Tags every row element with its id, so a later read can tell whether the same DOM nodes are still there. */
const markRows = (page) => page.$$eval('[data-testid="incident-row"]', (rows) => rows.forEach((r) => { r.__marker = r.dataset.id; }));
const rowMarkers = (page) => page.$$eval('[data-testid="incident-row"]', (rows) => rows.map((r) => r.__marker ?? null));

/** Counts incident rows added to or removed from the list from now on; read with `rowMutations`. */
const watchRows = (page) => page.evaluate(() => {
  window.__rowMutations = { added: 0, removed: 0 };
  const isRow = (n) => n.nodeType === 1 && n.matches('[data-testid="incident-row"]');
  new MutationObserver((records) => {
    for (const r of records) {
      window.__rowMutations.added += [...r.addedNodes].filter(isRow).length;
      window.__rowMutations.removed += [...r.removedNodes].filter(isRow).length;
    }
  }).observe(document.querySelector('[data-testid="incident-list"]'), { childList: true });
});
const rowMutations = (page) => page.evaluate(() => window.__rowMutations);

const newBar = (page) => page.getByTestId('new-bar');
const barText = (n) => `${n} new incident${n === 1 ? '' : 's'}, show`;
const waitForBarText = (page, text) =>
  page.waitForFunction((t) => {
    const bar = document.querySelector('[data-testid="new-bar"]');
    return bar && !bar.hidden && bar.textContent === t;
  }, text);

test('R3: loader shows until the first reply, then goes; empty shows for an empty list', async () => {
  const slow = await openBoard({ incidents: [incident(1)], firstDelayMs: 1500 });
  try {
    assert.equal(await slow.page.getByTestId('loader').isVisible(), true, 'loader visible before reply');
    assert.equal(await slow.page.getByTestId('incident-row').count(), 0);
    await slow.page.getByTestId('incident-row').first().waitFor();
    assert.equal(await slow.page.getByTestId('loader').count(), 0, 'loader gone after reply');
    assert.equal(await slow.page.getByTestId('empty').isVisible(), false);
    assert.equal(await newBar(slow.page).isVisible(), false, 'first load shows the list directly, no bar');
  } finally {
    await slow.close();
  }

  const none = await openBoard({ incidents: [] });
  try {
    await none.page.getByTestId('empty').waitFor({ state: 'visible' });
    assert.equal(await none.page.getByTestId('loader').count(), 0);
    assert.equal(await none.page.getByTestId('incident-row').count(), 0);
    assert.equal(await newBar(none.page).isVisible(), false);

    // Nothing on screen to hold still: the first incidents show directly.
    none.api.incidents = [incident(1)];
    await none.page.getByTestId('incident-row').first().waitFor();
    assert.equal(await none.page.getByTestId('empty').isVisible(), false);
    assert.equal(await newBar(none.page).isVisible(), false);
  } finally {
    await none.close();
  }
});

test('R1/R4: while watched, polls every ~2s, the list holds still, and the bar counts new incidents without moving rows', async () => {
  const { page, api, close } = await openBoard({ incidents: [incident(3), incident(2), incident(1)] });
  try {
    await page.getByTestId('incident-row').first().waitFor();
    await markRows(page);
    await watchRows(page);
    const before = await rowIds(page);
    const boxBefore = await page.locator('[data-testid="incident-row"][data-id="INC-1"]').boundingBox();

    await waitForPolls(page, api, 3);
    const gaps = api.polls.slice(1).map((p, i) => p.at - api.polls[i].at);
    for (const gap of gaps) assert.ok(gap >= 1800 && gap <= 3000, `poll gap ${gap}ms not ~2s`);
    assert.equal(api.polls[0].since, null, 'first poll has no cursor');
    assert.ok(api.polls.slice(1).every((p) => p.since?.startsWith('c')), 'later polls send the last cursor');

    api.incidents = [incident(4), ...api.incidents];
    await waitForBarText(page, barText(1));
    api.incidents = [incident(5), ...api.incidents];
    await waitForBarText(page, barText(2));
    const polled = api.polls.length;
    await waitForPolls(page, api, polled + 1);
    await page.waitForTimeout(200);

    assert.equal(await newBar(page).isVisible(), true);
    assert.equal(await newBar(page).textContent(), '2 new incidents, show');
    assert.deepEqual(await rowIds(page), before, 'top row and order unchanged');
    assert.deepEqual(await rowMarkers(page), before, 'every row is the same DOM node');
    assert.deepEqual(await rowMutations(page), { added: 0, removed: 0 }, 'no row added or removed');
    const boxAfter = await page.locator('[data-testid="incident-row"][data-id="INC-1"]').boundingBox();
    assert.deepEqual(boxAfter, boxBefore, 'showing the bar does not move the rows');
    assert.equal(await page.evaluate(() => performance.getEntriesByType('navigation').length), 1, 'no reload');
  } finally {
    await close();
  }
});

test('R1: clicking the bar brings new incidents in at the top, newest first, with Ack, and hides the bar', async () => {
  const { page, api, close } = await openBoard({ incidents: [incident(2), incident(1)] });
  try {
    await page.getByTestId('incident-row').first().waitFor();
    await markRows(page);
    api.incidents = [incident(4), incident(3), ...api.incidents];
    await waitForBarText(page, barText(2));

    await newBar(page).click();
    assert.deepEqual(await rowIds(page), ['INC-4', 'INC-3', 'INC-2', 'INC-1']);
    assert.deepEqual(await rowMarkers(page), [null, null, 'INC-2', 'INC-1'], 'old rows keep their DOM nodes');
    for (const id of ['INC-4', 'INC-3']) {
      const ack = page.locator(`[data-testid="incident-row"][data-id="${id}"]`).getByTestId('ack');
      assert.equal(await ack.isVisible(), true, `${id} has an Ack`);
      assert.equal(await ack.isEnabled(), true);
    }
    assert.equal(await newBar(page).isVisible(), false, 'bar hides after the click');

    await waitForPolls(page, api, api.polls.length + 1);
    await page.waitForTimeout(200);
    assert.equal(await newBar(page).isVisible(), false, 'bar stays hidden when nothing new arrived');
  } finally {
    await close();
  }
});

test('R2: Ack acks that row, the mark stays across refreshes and a bar click, and re-enables on failure', async () => {
  const { page, api, close } = await openBoard({ incidents: [incident(3), incident(2), incident(1)], ackDelayMs: 300 });
  try {
    const row = page.locator('[data-testid="incident-row"][data-id="INC-2"]');
    await row.getByTestId('ack').click();
    assert.equal(await row.getByTestId('ack').isDisabled(), true, 'button disabled while pending');
    await row.getByTestId('acked').waitFor();
    assert.deepEqual(api.acks.map((a) => a.id), ['INC-2']);
    assert.ok(api.acks[0].cursor?.startsWith('c'), 'ack sends the latest cursor');

    await waitForPolls(page, api, api.polls.length + 2);
    await page.waitForTimeout(200);
    assert.equal(await row.getByTestId('ack').count(), 0, 'Ack does not come back after refresh');
    assert.equal(await row.getByTestId('acked').count(), 1);
    assert.equal(await page.getByTestId('acked').count(), 1, 'only that row is acked');

    api.incidents = [incident(4), ...api.incidents];
    await waitForBarText(page, barText(1));
    assert.equal(await row.getByTestId('acked').count(), 1, 'mark stays while the bar waits');
    await newBar(page).click();
    assert.deepEqual(await rowIds(page), ['INC-4', 'INC-3', 'INC-2', 'INC-1']);
    assert.equal(await row.getByTestId('acked').count(), 1, 'mark stays on INC-2 after the bar click');
    assert.equal(await page.getByTestId('acked').count(), 1, 'and on no other row');
    await waitForPolls(page, api, api.polls.length + 1);
    await page.waitForTimeout(200);
    assert.equal(await row.getByTestId('acked').count(), 1, 'mark stays after the next refresh');

    api.ackStatus = 500;
    const other = page.locator('[data-testid="incident-row"][data-id="INC-1"]');
    await other.getByTestId('ack').click();
    await other.locator('.ack-error').waitFor();
    assert.equal(await other.getByTestId('ack').isEnabled(), true, 'button re-enabled after failure');
    assert.equal(await other.getByTestId('acked').count(), 0);
    assert.deepEqual(api.acks.map((a) => a.id), ['INC-2', 'INC-1']);
  } finally {
    await close();
  }
});

test('R1/R2: an Ack aimed at the 3rd row while an incident arrives acks that row', async (t) => {
  const { page, api, close } = await openBoard({ incidents: [incident(3), incident(2), incident(1)] });
  try {
    await page.getByTestId('incident-row').first().waitFor();
    const target = page.locator('[data-testid="incident-row"]').nth(2);
    const aimed = await target.getAttribute('data-id');
    const box = await target.getByTestId('ack').boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);

    const served = api.served.length;
    api.incidents = [incident(4), ...api.incidents];
    await page.waitForFunction(() => !document.querySelector('[data-testid="new-bar"]').hidden, null, { polling: 'raf' });
    await page.mouse.click(x, y);
    const clickedAt = Date.now();
    const arrival = api.served.slice(served).find((s) => s.ids.includes('INC-4'));
    assert.ok(arrival, 'the poll carrying INC-4 was served before the click');
    const lag = clickedAt - arrival.at;
    t.diagnostic(`aimed: ${aimed}; click ${lag}ms after INC-4 was served`);
    assert.ok(lag <= 150, `click ${lag}ms after the new incident, wanted <= 150ms`);

    await page.waitForFunction(() => document.querySelector('[data-testid="acked"]'));
    assert.deepEqual(api.acks.map((a) => a.id), [aimed], 'the ack goes to the aimed row');
    assert.equal(await target.getAttribute('data-id'), aimed, 'the aimed row did not move');
    assert.equal(await page.locator(`[data-testid="incident-row"][data-id="${aimed}"]`).getByTestId('acked').count(), 1);
  } finally {
    await close();
  }
});

test('R1: while the tab is hidden, new incidents apply directly with no bar', async () => {
  const { page, api, close } = await openBoard({
    incidents: [incident(2), incident(1)],
    initScript: () => {
      window.__hidden = false;
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__hidden ? 'hidden' : 'visible') });
    },
  });
  try {
    await page.getByTestId('incident-row').first().waitFor();
    await page.evaluate(() => { window.__hidden = true; });
    api.incidents = [incident(3), ...api.incidents];
    await page.waitForFunction(() => document.querySelector('[data-testid="incident-row"]')?.dataset.id === 'INC-3');
    assert.deepEqual(await rowIds(page), ['INC-3', 'INC-2', 'INC-1']);
    assert.equal(await newBar(page).isVisible(), false, 'no bar while hidden');

    await page.evaluate(() => { window.__hidden = false; });
    api.incidents = [incident(4), ...api.incidents];
    await waitForBarText(page, barText(1));
    assert.deepEqual(await rowIds(page), ['INC-3', 'INC-2', 'INC-1'], 'holds still again once visible');
  } finally {
    await close();
  }
});

for (const { timeZoneId, locale, time, date } of [
  { timeZoneId: 'Pacific/Auckland', locale: 'en-NZ', time: /16:03/, date: /12\/11/ },
  { timeZoneId: 'Europe/Berlin', locale: 'de-DE', time: /04:03/, date: /12\.11\./ },
]) {
  test(`R5: ${timeZoneId} ${locale} shows local time, day before month`, async () => {
    const iso = '2026-11-12T03:03:00.000Z';
    const { page, close } = await openBoard({ incidents: [incident(1, iso)], contextOptions: { timezoneId: timeZoneId, locale } });
    try {
      const el = page.locator('[data-testid="incident-row"] time');
      await el.waitFor();
      const text = await el.textContent();
      assert.match(text, time);
      assert.match(text, date);
      assert.equal(await el.getAttribute('datetime'), iso);
    } finally {
      await close();
    }
  });
}

test('R6: deployed board names one build sha in meta and footer', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  // Read-only: never let the deployed page reach the real ack endpoint.
  await page.route('**/api/ack**', (route) => route.abort());
  try {
    await page.goto(DEPLOYED);
    const meta = await page.locator('meta[name="build"]').getAttribute('content');
    const footer = (await page.getByTestId('build-sha').textContent()).trim();
    assert.equal(meta, footer);
    assert.match(meta, /^[0-9a-f]{40}$/);
    // HEAD moves with every commit, so compare to a sha only when the caller names one (EXPECT_SHA=$(git rev-parse HEAD)).
    if (process.env.EXPECT_SHA) assert.equal(meta, process.env.EXPECT_SHA);
  } finally {
    await context.close();
  }
});
