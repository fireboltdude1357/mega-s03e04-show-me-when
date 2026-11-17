/**
 * Creates the board view over the given <ul data-testid="incident-list">.
 * onAck(id) is called when an Ack button is clicked and must return a Promise (it calls api.ack).
 * update(incidents) takes the full API list, newest first, and patches rows in place by id.
 */
export function createBoard(listEl, { onAck, formatTime }) {
  const rows = new Map();
  /** id -> 'pending' | { ackedAt } */
  const ackState = new Map();

  function el(tag, props = {}) {
    return Object.assign(document.createElement(tag), props);
  }

  function renderAckCell(row) {
    const cell = row.querySelector('.act');
    const state = ackState.get(row.dataset.id);
    if (state && state !== 'pending') {
      const mark = el('span', { className: 'acked', textContent: 'acked' });
      mark.dataset.testid = 'acked';
      if (state.ackedAt) mark.title = `acked ${formatTime(state.ackedAt)}`;
      cell.replaceChildren(mark);
      return;
    }
    let button = cell.querySelector('button[data-testid="ack"]');
    if (!button) {
      button = el('button', { type: 'button', textContent: 'Ack' });
      button.dataset.testid = 'ack';
      cell.replaceChildren(button);
    }
    button.disabled = state === 'pending';
  }

  function createRow(id) {
    const row = el('li');
    row.dataset.testid = 'incident-row';
    row.dataset.id = id;
    row.append(
      el('span', { className: 'id', textContent: id }),
      el('span', { className: 'sev' }),
      el('span', { className: 'what' }),
      el('time'),
      el('span', { className: 'act' }),
    );
    renderAckCell(row);
    return row;
  }

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function patchRow(row, { severity, service, region, summary, openedAt }) {
    const className = `row ${severity}`;
    if (row.className !== className) row.className = className;
    setText(row.querySelector('.sev'), severity);
    setText(row.querySelector('.what'), `${service} · ${region} · ${summary}`);
    const time = row.querySelector('time');
    if (time.dateTime !== openedAt) time.dateTime = openedAt;
    setText(time, formatTime(openedAt));
  }

  async function ack(id) {
    if (ackState.has(id)) return;
    ackState.set(id, 'pending');
    rows.get(id)?.querySelector('.ack-error')?.remove();
    if (rows.has(id)) renderAckCell(rows.get(id));
    try {
      const reply = await onAck(id);
      ackState.set(id, { ackedAt: reply?.ackedAt });
    } catch (err) {
      ackState.delete(id);
      const row = rows.get(id);
      if (row) {
        const error = el('span', { className: 'ack-error', textContent: 'ack failed, retry', title: String(err?.message ?? err) });
        row.querySelector('.act').append(error);
      }
    }
    if (rows.has(id)) renderAckCell(rows.get(id));
  }

  listEl.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-testid="ack"]');
    const row = button?.closest('li[data-testid="incident-row"]');
    if (!row || !listEl.contains(row)) return;
    ack(row.dataset.id);
  });

  function update(incidents) {
    const ids = new Set(incidents.map((i) => i.id));
    for (const [id, row] of rows) {
      if (!ids.has(id)) {
        row.remove();
        rows.delete(id);
      }
    }
    incidents.forEach((incident, index) => {
      let row = rows.get(incident.id);
      if (!row) {
        row = createRow(incident.id);
        rows.set(incident.id, row);
      }
      patchRow(row, incident);
      const current = listEl.children[index] ?? null;
      if (current !== row) listEl.insertBefore(row, current);
    });
  }

  return { update };
}
