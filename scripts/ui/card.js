// Click on a card header toggles its body. Controls inside the header keep their own clicks.
function initCardToggle(list) {
  list.addEventListener('click', e => {
    const head = e.target.closest('.tile-head');
    if (!head || e.target.closest('a, button, input, select, label, .drag-handle')) return;
    head.parentNode.classList.toggle('open');
  });
}
