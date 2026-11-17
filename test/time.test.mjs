import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTime } from '../app/time.js';

const ISO = '2026-11-12T03:03:00.000Z';

test('Auckland en-NZ: next-day 16:03, day before month', () => {
  const text = formatTime(ISO, { locale: 'en-NZ', timeZone: 'Pacific/Auckland' });
  assert.match(text, /16:03/);
  assert.match(text, /12\D+11/);
});

test('Berlin de-DE: 04:03, day before month', () => {
  const text = formatTime(ISO, { locale: 'de-DE', timeZone: 'Europe/Berlin' });
  assert.match(text, /04:03/);
  assert.match(text, /12\.11\./);
});

test('New York en-US: previous-day 22:03, month before day', () => {
  const text = formatTime(ISO, { locale: 'en-US', timeZone: 'America/New_York' });
  assert.match(text, /22:03/);
  assert.match(text, /11\/11/);
});

test('conversion crosses the date line both ways', () => {
  assert.match(formatTime('2026-11-11T23:30:00.000Z', { locale: 'en-NZ', timeZone: 'Pacific/Auckland' }), /12\/11.*12:30/);
  assert.match(formatTime('2026-11-12T00:30:00.000Z', { locale: 'en-US', timeZone: 'America/Los_Angeles' }), /11\/11.*16:30/);
});

test('includes a short zone name', () => {
  assert.match(formatTime(ISO, { locale: 'en-GB', timeZone: 'Europe/Berlin' }), /CET|GMT\+1/);
});

test('bad or empty input comes back unchanged', () => {
  assert.equal(formatTime(''), '');
  assert.equal(formatTime('not a date'), 'not a date');
  assert.equal(formatTime(undefined), undefined);
  assert.equal(formatTime(null), null);
});
