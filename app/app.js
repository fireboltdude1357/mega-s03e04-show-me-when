import { ack, fetchIncidents } from './api.js';
import { createBoard } from './board.js';
import { formatTime } from './time.js';

const REFRESH_MS = 2000;

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const newBar = document.querySelector('[data-testid="new-bar"]');
const status = document.querySelector('.status');
const board = createBoard(list, { onAck: ack, formatTime: (iso) => formatTime(iso) });

/** The newest incidents answer, kept so the "N new" bar can bring it in. */
let latest = [];

/** Shows the latest list as is: on first load, on a bar click, or while nobody can see the board. */
function showLatest() {
  board.update(latest);
  empty.hidden = latest.length > 0;
  newBar.hidden = true;
}

/** While the board is on screen, the list holds still: new incidents wait behind the "N new" bar. */
function hold() {
  const unseen = board.patch(latest);
  newBar.textContent = `${unseen} new incident${unseen === 1 ? '' : 's'}, show`;
  newBar.hidden = unseen === 0;
}

/** Fetches the current incidents. The first success removes the loader. */
async function refresh() {
  try {
    const page = await fetchIncidents();
    latest = page.incidents;
    if (board.size === 0 || document.visibilityState === 'hidden') showLatest();
    else hold();
    loader?.remove();
    status.textContent = '';
  } catch (err) {
    status.textContent = `refresh failed, retrying: ${err.message}`;
  } finally {
    setTimeout(refresh, REFRESH_MS);
  }
}

newBar.addEventListener('click', showLatest);
refresh();
