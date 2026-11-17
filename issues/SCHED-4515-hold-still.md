---
id: SCHED-4515
title: List holds still; "N new" bar brings new incidents in
status: done
plan: R1, R2, R4
---

Product's decision after the step-one recording (00:39: aimed at INC-8697, the ack went to INC-3165): "The list holds
still while it is on screen; a \"N new\" bar brings new incidents in on click. Ack stays on the row."

- While rows are on screen, refreshes only update fields of those rows. No row is added, removed or moved.
- New incidents raise a count in the `new-bar` button. The bar sits in a fixed-height slot, so showing it does not move
  the list. Clicking it shows the current list, newest first, and hides the bar.
- First load, and refreshes while the tab is hidden, show the current list directly.

Acceptance: leave the board open while incidents arrive; the top row stays the same and the bar counts them. Aim at a
row's Ack while one arrives; the ack goes to that row. Click the bar; the new incidents show at the top with Ack.
