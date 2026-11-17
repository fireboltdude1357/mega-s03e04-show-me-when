# sched-prod incident board — plan

The on-call board for sched-prod. One page, one list: tonight's incidents, newest first, so on-call sees
what just broke and takes it.

## Flows

| flow | who | what happens |
|------|-----|--------------|
| `open-board` | on-call | opens the board; sees tonight's incidents |
| `ack-incident` | on-call | picks an incident on the board and acks it — "I've got this one" |
| `watch-board` | on-call | keeps the board open; it stays current without a reload, and the list holds still while it is on screen |

## Requirements

- **R1** While the board is on screen, the list holds still: no row is added, removed or moved under the pointer. New
  incidents (and incidents gone from the feed) wait behind a "N new" bar; clicking it brings them in at the top, newest first. On first load, and while
  the tab is hidden, the list shows what is current. (Product, after SCHED-4511's recording at 00:39: a new incident
  pushed the rows down and an Ack landed on the row below the one aimed at.)
- **R2** Each incident row has an **Ack** button. Ack sends the ack (`api.ack(id)`) and marks the row acked. The acked
  mark stays on that row.
- **R3** Show a loader until incidents load.
- **R4** The board fetches incidents every 2 seconds while open. Fields of rows on screen update in place; new incidents
  update the "N new" count (R1).
- **R5** Times show in the viewer's local time; day before month for EU locales (dd/mm).
- **R6** The page names its build: `<meta name="build" content="<git sha>">` in the head and the same sha in the footer.

## Hooks (pinned — tests and the replay rely on them)

| `data-testid` | element |
|---------------|---------|
| `board` | the board's main area |
| `loader` | the loader (gone once incidents load) |
| `empty` | what shows when there are no incidents |
| `new-bar` | the "N new" bar (hidden when nothing new waits) |
| `incident-list` | the list |
| `incident-row` | one incident row, with `data-id="<incident id>"` |
| `ack` | the Ack button in a row |
| `acked` | the acked mark in a row |
| `build-sha` | the sha in the footer |

## Done

Every issue in `issues/` delivered, deployed to a public https address, and shown working.
