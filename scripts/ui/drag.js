// Drag a handle to reorder. A copy of the whole item follows the pointer,
// and the item under it gets a frame showing where it will land.
function initDragSort(list, handleSelector) {
  let dragged = null;
  let ghost = null;
  let over = null;
  let offsetX = 0;
  let offsetY = 0;

  function clearOver() {
    if (over) over.classList.remove('dragover');
    over = null;
  }

  function endDrag() {
    if (!dragged) return;
    if (over && over !== dragged) {
      const items = Array.prototype.slice.call(list.children);
      const from = items.indexOf(dragged);
      const to = items.indexOf(over);
      list.insertBefore(dragged, from > to ? over : over.nextSibling);
      if (typeof writeSensorOrder === 'function') {
        writeSensorOrder().catch(err => console.log(err.message));
      }
    }
    dragged.classList.remove('dragging');
    clearOver();
    if (ghost) ghost.remove();
    ghost = null;
    dragged = null;
  }

  list.addEventListener('pointerdown', e => {
    const handle = e.target.closest(handleSelector);
    if (!handle || !list.contains(handle)) return;
    const li = handle.closest('li');
    if (!li || li.parentNode !== list) return;
    e.preventDefault();
    const rect = li.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    dragged = li;
    dragged.classList.add('dragging');
    ghost = li.cloneNode(true);
    ghost.classList.remove('dragging');
    ghost.classList.add('drag-ghost');
    ghost.style.width = rect.width + 'px';
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    document.body.appendChild(ghost);
    handle.setPointerCapture(e.pointerId);
  });

  list.addEventListener('pointermove', e => {
    if (!dragged) return;
    ghost.style.left = (e.clientX - offsetX) + 'px';
    ghost.style.top = (e.clientY - offsetY) + 'px';
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const target = hit && hit.closest('li');
    const next = target && target.parentNode === list && target !== dragged ? target : null;
    if (next === over) return;
    clearOver();
    over = next;
    if (over) over.classList.add('dragover');
  });

  list.addEventListener('pointerup', endDrag);
  list.addEventListener('pointercancel', endDrag);
}
