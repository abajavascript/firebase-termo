// Drag a handle to reorder. A copy of the whole item follows the pointer,
// and the item under it gets a frame showing where it will land.
// Move, up, and cancel are listened on window: after a finger press, some
// mobile browsers deliver later events only to the captured handle, so the
// list never sees the gesture. The dragged card and its ghost ignore hits
// so elementFromPoint finds the card under the finger.
function initDragSort(list, handleSelector) {
  const edge = 72;
  const maxStep = 10;
  let dragged = null;
  let ghost = null;
  let over = null;
  let offsetX = 0;
  let offsetY = 0;
  let pointerId = null;
  let lastX = 0;
  let lastY = 0;
  let startX = 0;
  let startY = 0;
  let moved = false;
  let scrollSpeed = 0;
  let scrollRaf = 0;

  function clearOver() {
    if (over) over.classList.remove('dragover');
    over = null;
  }

  function stopAutoScroll() {
    scrollSpeed = 0;
    if (scrollRaf) cancelAnimationFrame(scrollRaf);
    scrollRaf = 0;
  }

  function detachWindow() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
  }

  function updateOver(clientX, clientY) {
    const hit = document.elementFromPoint(clientX, clientY);
    const target = hit && hit.closest ? hit.closest('li') : null;
    const next = target && target.parentNode === list && target !== dragged ? target : null;
    if (next === over) return;
    clearOver();
    over = next;
    if (over) over.classList.add('dragover');
  }

  function autoScrollStep() {
    if (!dragged || !scrollSpeed) {
      scrollRaf = 0;
      return;
    }
    window.scrollBy(0, scrollSpeed);
    updateOver(lastX, lastY);
    scrollRaf = requestAnimationFrame(autoScrollStep);
  }

  function setAutoScroll(clientY) {
    const height = window.innerHeight || 0;
    let speed = 0;
    if (clientY < edge) speed = -maxStep * ((edge - clientY) / edge);
    else if (height && clientY > height - edge) speed = maxStep * ((clientY - (height - edge)) / edge);
    scrollSpeed = speed;
    if (speed) {
      if (!scrollRaf) scrollRaf = requestAnimationFrame(autoScrollStep);
    } else if (scrollRaf) {
      cancelAnimationFrame(scrollRaf);
      scrollRaf = 0;
    }
  }

  function finishDrag(commit) {
    if (!dragged) return;
    const item = dragged;
    const target = over;
    detachWindow();
    stopAutoScroll();
    document.body.classList.remove('is-sorting');
    item.classList.remove('dragging');
    clearOver();
    if (ghost) ghost.remove();
    ghost = null;
    dragged = null;
    pointerId = null;
    if (moved) swallowFollowingClick();
    if (!commit || !target || target === item || target.parentNode !== list) return;
    const items = Array.prototype.slice.call(list.children);
    const from = items.indexOf(item);
    const to = items.indexOf(target);
    if (from < 0 || to < 0 || from === to) return;
    list.insertBefore(item, from > to ? target : target.nextSibling);
    if (typeof writeSensorOrder === 'function') {
      writeSensorOrder().catch(err => console.log(err.message));
    }
  }

  function onPointerMove(e) {
    if (!dragged || e.pointerId !== pointerId) return;
    if (e.cancelable) e.preventDefault();
    lastX = e.clientX;
    lastY = e.clientY;
    if (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8) moved = true;
    ghost.style.left = (e.clientX - offsetX) + 'px';
    ghost.style.top = (e.clientY - offsetY) + 'px';
    updateOver(e.clientX, e.clientY);
    setAutoScroll(e.clientY);
  }

  function matchesDrag(e) {
    return !!(dragged && e && e.pointerId === pointerId);
  }

  function onPointerUp(e) {
    if (!matchesDrag(e)) return;
    if (e.cancelable) e.preventDefault();
    finishDrag(true);
  }

  function onPointerCancel(e) {
    if (!matchesDrag(e)) return;
    finishDrag(false);
  }

  function swallowFollowingClick() {
    const swallow = e => {
      e.preventDefault();
      e.stopPropagation();
      document.removeEventListener('click', swallow, true);
    };
    document.addEventListener('click', swallow, true);
    setTimeout(() => document.removeEventListener('click', swallow, true), 400);
  }

  list.addEventListener('pointerdown', e => {
    if (dragged || e.button !== 0) return;
    const handle = e.target.closest(handleSelector);
    if (!handle || !list.contains(handle)) return;
    const li = handle.closest('li');
    if (!li || li.parentNode !== list) return;
    if (e.cancelable) e.preventDefault();
    const rect = li.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    lastX = e.clientX;
    lastY = e.clientY;
    startX = e.clientX;
    startY = e.clientY;
    moved = false;
    pointerId = e.pointerId;
    dragged = li;
    dragged.classList.add('dragging');
    ghost = li.cloneNode(true);
    ghost.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    ghost.classList.remove('dragging');
    ghost.classList.add('drag-ghost');
    ghost.style.width = rect.width + 'px';
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    document.body.appendChild(ghost);
    document.body.classList.add('is-sorting');
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
  }, { passive: false });
}
