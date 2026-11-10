// Click on a card header toggles its body. Controls inside the header keep their own clicks.
function initCardToggle(list) {
  list.addEventListener('click', e => {
    const head = e.target.closest('.tile-head');
    if (!head || e.target.closest('a, button, input, select, label, .drag-handle, .relay-toggle')) return;
    const tile = head.parentNode;
    tile.classList.toggle('open');
    if (tile.classList.contains('open')) resizeCardChart(tile);
  });
}

// The canvas has no height while the card is closed, so Chart.js needs a resize once it is shown.
function resizeCardChart(tile) {
  const canvas = tile.querySelector('canvas');
  if (!canvas || typeof Chart === 'undefined' || typeof Chart.getChart !== 'function') return;
  const chart = Chart.getChart(canvas);
  if (!chart) return;
  requestAnimationFrame(() => chart.resize());
}
