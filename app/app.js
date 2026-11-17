import { ack, fetchIncidents } from './api.js';
import { createBoard } from './board.js';
import { formatTime } from './time.js';

const REFRESH_MS = 2000;

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const status = document.querySelector('.status');
const board = createBoard(list, { onAck: ack, formatTime: (iso) => formatTime(iso) });

/** Fetches the current incidents and patches the board. The first success removes the loader. */
async function refresh() {
  try {
    const page = await fetchIncidents();
    board.update(page.incidents);
    loader?.remove();
    empty.hidden = page.incidents.length > 0;
    status.textContent = '';
  } catch (err) {
    status.textContent = `refresh failed, retrying: ${err.message}`;
  } finally {
    setTimeout(refresh, REFRESH_MS);
  }
}

refresh();
