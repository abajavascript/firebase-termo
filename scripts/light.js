// Light controllers store relay state in sensors/{id}/last.r, not temperature.
// State string and the set: command: the rightmost character is relay 0. A trailing newline is ignored.
// Schedule action: the leftmost character is relay 0. 0 off, 1 on, ? leave, ! invert.

const DAY_LABELS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const DAY_TITLES = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця", 'Субота'];
const WHEN_OPTIONS = [
  [0, 'Точний час'],
  [1, 'До сходу'],
  [2, 'Після сходу'],
  [3, 'До заходу'],
  [4, 'Після заходу']
];
const ACTION_CYCLE = ['0', '1', '?', '!'];
const ACTION_LABEL = {
  '0': 'Вимкнути',
  '1': 'Увімкнути',
  '?': 'Не чіпати',
  '!': 'Інвертувати'
};
const RELAY_PENDING_MS = 20000;

function commandKey(sensorId, sensorMac) {
  const mac = sensorMac == null ? '' : String(sensorMac).trim();
  if (mac) return mac;
  return String(sensorId == null ? '' : sensorId).replace(/-/g, ':');
}

function listEntryMac(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (value && typeof value === 'object' && value.mac != null && String(value.mac).trim() !== '') {
    return String(value.mac).trim();
  }
  return '';
}

function listEntryIsLight(value) {
  return !!(value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'ip'));
}

function normalizeRelayString(raw) {
  if (raw == null || typeof raw === 'object') return null;
  let text = String(raw);
  const split = text.search(/[\r\n]/);
  if (split >= 0) text = text.slice(0, split);
  text = text.trim();
  if (!/^[01]+$/.test(text)) return null;
  return text;
}

function parseRelayBits(state) {
  const bits = new Array(state.length);
  for (let i = 0; i < state.length; i++) bits[state.length - 1 - i] = state.charAt(i) === '1';
  return bits;
}

function formatRelayBits(bits) {
  let state = '';
  for (let relay = bits.length - 1; relay >= 0; relay--) state += bits[relay] ? '1' : '0';
  return state;
}

function readFinite(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function schedulesFromFirebase(value) {
  if (!value || typeof value !== 'object') return [];
  const items = Array.isArray(value)
    ? value
    : Object.keys(value).filter(key => /^\d+$/.test(key)).sort((a, b) => Number(a) - Number(b)).map(key => value[key]);
  const list = [];
  items.forEach(item => {
    const normalized = scheduleFromFirebase(item);
    if (normalized && normalized.description) list.push(normalized);
  });
  return list;
}

function scheduleFromFirebase(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const when = readFinite(raw.when);
  const hour = readFinite(raw.hour);
  const minute = readFinite(raw.minute);
  const days = String(raw.dayOfWeek == null ? '' : raw.dayOfWeek).replace(/[^01]/g, '');
  const action = String(raw.action == null ? '' : raw.action).replace(/[^01?!]/g, '');
  return {
    description: raw.description == null ? '' : String(raw.description),
    active: raw.active === true || raw.active === 1 || raw.active === '1' || raw.active === 'true',
    dayOfWeek: (days + '0000000').slice(0, 7),
    when: when != null && when >= 0 && when <= 4 ? when : 0,
    hour: hour != null ? Math.min(23, Math.max(0, Math.round(hour))) : 0,
    minute: minute != null ? Math.min(59, Math.max(0, Math.round(minute))) : 0,
    action: action
  };
}

function readBoundedInt(raw, min, max) {
  if (!/^\d+$/.test(String(raw).trim())) return null;
  const n = Number(raw);
  if (n < min || n > max) return null;
  return n;
}

function validateSchedules(list) {
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const n = i + 1;
    if (!item.description) return 'Розклад ' + n + ': потрібен опис';
    if (!/^[01]{7}$/.test(item.dayOfWeek)) return 'Розклад ' + n + ': позначте дні тижня';
    if ([0, 1, 2, 3, 4].indexOf(item.when) < 0) return 'Розклад ' + n + ': невідомий режим часу';
    if (item.hour == null) return 'Розклад ' + n + ': година від 0 до 23';
    if (item.minute == null) return 'Розклад ' + n + ': хвилина від 0 до 59';
    if (!/^[01?!]+$/.test(item.action)) return 'Розклад ' + n + ': дія лише 0, 1, ? або !';
  }
  return '';
}

// Realtime Database does not keep [], and the controller clears schedules only when the JSON array parses.
function schedulesPayload(list) {
  if (list.length) return list;
  return [{
    description: '',
    active: false,
    dayOfWeek: '0000000',
    when: 0,
    hour: 0,
    minute: 0,
    action: '?'
  }];
}

function normalizeAction(action, relayCount) {
  const clean = String(action == null ? '' : action).replace(/[^01?!]/g, '');
  const width = Math.max(relayCount > 0 ? relayCount : 0, clean.length) || 8;
  let out = clean;
  while (out.length < width) out += '?';
  return out;
}

function deviceRelayCount(entry) {
  if (entry.relayBits && entry.relayBits.length) return entry.relayBits.length;
  let max = 0;
  (entry.schedules || []).forEach(item => {
    if (item.action && item.action.length > max) max = item.action.length;
  });
  return max;
}

function blankSchedule(relayCount) {
  const width = relayCount > 0 ? relayCount : 8;
  return {
    description: '',
    active: true,
    dayOfWeek: '1111111',
    when: 0,
    hour: 0,
    minute: 0,
    action: '?'.repeat(width)
  };
}

function clearLightRuntime(entry) {
  if (!entry) return;
  clearTimeout(entry.relayTimer);
  entry.historyRequest = (entry.historyRequest || 0) + 1;
  entry.historyReady = false;
}

function initLightControls(list) {
  list.addEventListener('click', onLightClick);
  list.addEventListener('change', onLightChange);
  list.addEventListener('input', onLightInput);
}

function ensureLightCard(entry) {
  if (!entry || !entry.li) return;
  if (!entry.isLight) {
    entry.isLight = true;
    entry.chartRequest = (entry.chartRequest || 0) + 1;
    entry.li.classList.add('is-light');
    if (typeof destroySensorChart === 'function') destroySensorChart(entry);
    const path = 'sensors/' + entry.sensorId + '/schedules';
    if (entry.fbSensorValueListener.indexOf(path) < 0) {
      entry.fbSensorValueListener.push(path);
      db.ref(path).on('value', snapshot => {
        entry.schedules = schedulesFromFirebase(snapshot.val());
        if (!entry.scheduleDirty) renderSchedules(entry);
      });
    }
  }
  paintRelayToggles(entry);
  if (entry.historySpan == null) {
    entry.historySpan = 'day';
    entry.historyCursor = startOfLocalDay(new Date()).getTime();
    loadRelayHistory(entry);
  }
}

function applyRelayReading(entry, relay) {
  ensureLightCard(entry);
  entry.relayReported = relay;
  if (entry.relayPending && Date.now() < entry.relayPendingUntil && relay !== entry.relayPending) return;
  entry.relayPending = null;
  entry.relayBits = parseRelayBits(relay);
  paintRelayToggles(entry);
  noteRelayHistory(entry, relay, parseDeviceTime(entry.lastReading && entry.lastReading.time));
}

function expectRelayState(entry, state) {
  entry.relayPending = state;
  entry.relayPendingUntil = Date.now() + RELAY_PENDING_MS;
  clearTimeout(entry.relayTimer);
  entry.relayTimer = setTimeout(() => {
    if (entry.relayPending !== state) return;
    entry.relayPending = null;
    if (entry.relayReported) {
      entry.relayBits = parseRelayBits(entry.relayReported);
      paintRelayToggles(entry);
    }
  }, RELAY_PENDING_MS);
}

function paintRelayToggles(entry) {
  const box = entry.li.querySelector('.relay-toggles');
  const unknown = entry.li.querySelector('.relay-unknown');
  const bits = entry.relayBits || [];
  if (!box) return;
  if (!bits.length) {
    box.textContent = '';
    if (unknown) unknown.hidden = !entry.isLight;
    return;
  }
  if (unknown) unknown.hidden = true;
  const inputs = box.querySelectorAll('input');
  if (inputs.length !== bits.length) {
    box.textContent = '';
    bits.forEach((on, index) => {
      const label = document.createElement('label');
      label.className = 'relay-toggle';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.relay = String(index);
      input.checked = !!on;
      input.setAttribute('aria-label', 'Реле ' + index);
      const name = document.createElement('span');
      name.className = 'relay-name';
      name.setAttribute('aria-hidden', 'true');
      name.textContent = 'Реле ' + index;
      const knob = document.createElement('span');
      knob.className = 'relay-knob';
      knob.setAttribute('aria-hidden', 'true');
      label.appendChild(input);
      label.appendChild(name);
      label.appendChild(knob);
      box.appendChild(label);
    });
    return;
  }
  Array.prototype.forEach.call(inputs, (input, index) => {
    input.checked = !!bits[index];
  });
}

function onRelayToggle(li, input) {
  const entry = sensorEntry(li.dataset.sensorId);
  if (!entry || !entry.relayBits) return;
  const index = Number(input.dataset.relay);
  if (!Number.isInteger(index) || index < 0 || index >= entry.relayBits.length) return;
  const previous = entry.relayBits.slice();
  const bits = previous.slice();
  bits[index] = input.checked;
  const state = formatRelayBits(bits);
  entry.relayBits = bits;
  expectRelayState(entry, state);
  fbSendCommand(commandKey(entry.sensorId, entry.sensorMac), 'set:' + state).catch(err => {
    if (entry.relayPending === state) entry.relayPending = null;
    entry.relayBits = previous;
    paintRelayToggles(entry);
    alert(err && err.message ? err.message : err);
  });
}

function markScheduleDirty(li) {
  const entry = sensorEntry(li.dataset.sensorId);
  if (entry) entry.scheduleDirty = true;
}

function syncScheduleEmpty(li) {
  const empty = li.querySelector('.schedule-empty');
  if (empty) empty.hidden = !!li.querySelector('.schedule-row');
}

function syncWhenFields(row) {
  const solar = Number(row.querySelector('.schedule-when').value) !== 0;
  row.querySelector('.hour-label').textContent = solar ? 'Зсув, год' : 'Година';
  row.querySelector('.minute-label').textContent = solar ? 'Зсув, хв' : 'Хвилина';
  row.querySelector('.schedule-offset-note').hidden = !solar;
}

function setActionBit(btn, value) {
  const next = Object.prototype.hasOwnProperty.call(ACTION_LABEL, value) ? value : '?';
  btn.dataset.value = next;
  const symbol = btn.querySelector('.action-symbol');
  if (symbol) symbol.textContent = next;
  btn.title = 'Реле ' + btn.dataset.relay + ': ' + ACTION_LABEL[next];
}

function createScheduleRow(schedule, relayCount) {
  const row = document.createElement('div');
  row.className = 'schedule-row';
  const action = normalizeAction(schedule.action, relayCount);
  row.innerHTML = `
    <div class="schedule-top">
      <label class="relay-toggle schedule-active-label">
        <input type="checkbox" class="schedule-active" aria-label="Активний">
        <span class="relay-name" aria-hidden="true">Активний</span>
        <span class="relay-knob" aria-hidden="true"></span>
      </label>
      <input type="text" class="schedule-description" placeholder="Опис" aria-label="Опис розкладу" autocomplete="off">
      <button type="button" class="waves-effect orange darken-4 btn-small schedule-remove">Видалити</button>
    </div>
    <div class="dow" role="group" aria-label="Дні тижня, з неділі"></div>
    <div class="schedule-when-row">
      <label>Коли <select class="browser-default schedule-when" aria-label="Коли"></select></label>
    </div>
    <div class="schedule-time-row">
      <label><span class="hour-label"></span> <input type="number" class="schedule-hour" min="0" max="23" step="1" inputmode="numeric"></label>
      <label><span class="minute-label"></span> <input type="number" class="schedule-minute" min="0" max="59" step="1" inputmode="numeric"></label>
    </div>
    <p class="schedule-offset-note">Година і хвилина — це зсув, не годинник.</p>
    <div class="schedule-action" role="group" aria-label="Дія по реле"></div>
  `;
  row.querySelector('.schedule-active').checked = !!schedule.active;
  row.querySelector('.schedule-description').value = schedule.description || '';
  const dow = row.querySelector('.dow');
  DAY_LABELS.forEach((label, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dow-day';
    btn.dataset.day = String(index);
    btn.textContent = label;
    btn.title = DAY_TITLES[index];
    btn.setAttribute('aria-pressed', schedule.dayOfWeek.charAt(index) === '1' ? 'true' : 'false');
    dow.appendChild(btn);
  });
  const select = row.querySelector('.schedule-when');
  WHEN_OPTIONS.forEach(pair => {
    const option = document.createElement('option');
    option.value = String(pair[0]);
    option.textContent = pair[1];
    select.appendChild(option);
  });
  select.value = String(schedule.when);
  row.querySelector('.schedule-hour').value = String(schedule.hour);
  row.querySelector('.schedule-minute').value = String(schedule.minute);
  syncWhenFields(row);
  const actionBox = row.querySelector('.schedule-action');
  for (let i = 0; i < action.length; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'action-bit';
    btn.dataset.relay = String(i);
    const caption = document.createElement('span');
    caption.className = 'action-relay';
    caption.textContent = 'Реле ' + i;
    const symbol = document.createElement('span');
    symbol.className = 'action-symbol';
    btn.appendChild(caption);
    btn.appendChild(symbol);
    setActionBit(btn, action.charAt(i));
    actionBox.appendChild(btn);
  }
  return row;
}

function renderSchedules(entry) {
  const list = entry.li.querySelector('.schedule-list');
  if (!list) return;
  const count = deviceRelayCount(entry);
  list.textContent = '';
  (entry.schedules || []).forEach(item => {
    list.appendChild(createScheduleRow(item, count));
  });
  syncScheduleEmpty(entry.li);
}

function collectSchedules(root) {
  return Array.prototype.map.call(root.querySelectorAll('.schedule-row'), row => {
    let dayOfWeek = '';
    row.querySelectorAll('.dow-day').forEach(btn => {
      dayOfWeek += btn.getAttribute('aria-pressed') === 'true' ? '1' : '0';
    });
    let action = '';
    row.querySelectorAll('.action-bit').forEach(btn => {
      action += btn.dataset.value || '?';
    });
    return {
      description: row.querySelector('.schedule-description').value.trim(),
      active: row.querySelector('.schedule-active').checked,
      dayOfWeek: dayOfWeek,
      when: Number(row.querySelector('.schedule-when').value),
      hour: readBoundedInt(row.querySelector('.schedule-hour').value, 0, 23),
      minute: readBoundedInt(row.querySelector('.schedule-minute').value, 0, 59),
      action: action
    };
  });
}

function addScheduleRow(li) {
  const entry = sensorEntry(li.dataset.sensorId);
  if (!entry) return;
  const count = deviceRelayCount(entry);
  const row = createScheduleRow(blankSchedule(count), count);
  li.querySelector('.schedule-list').appendChild(row);
  syncScheduleEmpty(li);
  markScheduleDirty(li);
  row.querySelector('.schedule-description').focus();
}

function removeScheduleRow(row) {
  const li = row.closest('li');
  row.remove();
  syncScheduleEmpty(li);
  markScheduleDirty(li);
}

function saveLightSchedules(sensorId) {
  const entry = sensorEntry(sensorId);
  if (!entry) return;
  const schedules = collectSchedules(entry.li);
  const error = validateSchedules(schedules);
  if (error) {
    alert(error);
    return;
  }
  const write = () => {
    const button = entry.li.querySelector('.schedule-save');
    if (button) button.disabled = true;
    fbSaveSchedules(sensorId, schedulesPayload(schedules)).then(() => {
      entry.schedules = schedules;
      entry.scheduleDirty = false;
      return fbSendCommand(commandKey(sensorId, entry.sensorMac), 'load-schedules');
    }).then(() => {
      alert('Розклад збережено і надіслано контролеру');
    }).catch(err => {
      alert(err && err.message ? err.message : err);
    }).then(() => {
      if (button) button.disabled = false;
    });
  };
  if (!schedules.length) {
    confirmDialog('Зберегти порожній розклад? На пристрої не залишиться жодного розкладу.').then(ok => {
      if (ok) write();
    });
    return;
  }
  write();
}

function onLightClick(e) {
  const li = e.target.closest('.sensors > li');
  if (!li) return;
  const spanBtn = e.target.closest('.relay-span-btn');
  if (spanBtn && li.contains(spanBtn)) {
    e.preventDefault();
    setRelayHistorySpan(li, spanBtn.dataset.span);
    return;
  }
  if (e.target.closest('.relay-prev')) {
    e.preventDefault();
    shiftRelayHistory(li, -1);
    return;
  }
  if (e.target.closest('.relay-next')) {
    e.preventDefault();
    shiftRelayHistory(li, 1);
    return;
  }
  const bit = e.target.closest('.action-bit');
  if (bit && li.contains(bit)) {
    e.preventDefault();
    const current = ACTION_CYCLE.indexOf(bit.dataset.value);
    setActionBit(bit, ACTION_CYCLE[(current < 0 ? 0 : current + 1) % ACTION_CYCLE.length]);
    markScheduleDirty(li);
    return;
  }
  const day = e.target.closest('.dow-day');
  if (day && li.contains(day)) {
    e.preventDefault();
    day.setAttribute('aria-pressed', day.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    markScheduleDirty(li);
    return;
  }
  if (e.target.closest('.schedule-add')) {
    e.preventDefault();
    addScheduleRow(li);
    return;
  }
  if (e.target.closest('.schedule-remove')) {
    e.preventDefault();
    const row = e.target.closest('.schedule-row');
    if (row) removeScheduleRow(row);
    return;
  }
  if (e.target.closest('.schedule-save')) {
    e.preventDefault();
    saveLightSchedules(li.dataset.sensorId);
  }
}

function onLightChange(e) {
  const li = e.target.closest('.sensors > li');
  if (!li) return;
  if (e.target.closest('.relay-toggles')) {
    onRelayToggle(li, e.target);
    return;
  }
  if (!e.target.closest('.light-panel')) return;
  markScheduleDirty(li);
  if (e.target.classList.contains('schedule-when')) syncWhenFields(e.target.closest('.schedule-row'));
}

function onLightInput(e) {
  const panel = e.target.closest('.light-panel');
  if (!panel) return;
  const li = panel.closest('.sensors > li');
  if (li) markScheduleDirty(li);
}

// Relay changes live at relays/{id}/yyyy/mm/dd/hh/mm as { r }.
// The rightmost character is relay 0. The scale is HTML, not Chart.js.
const RELAY_PRIOR_MONTHS = 4;

function relayBit(state, index) {
  if (!state || index < 0 || index >= state.length) return null;
  return state.charAt(state.length - 1 - index) === '1';
}

function relayHistoryBounds(span, cursorMs) {
  const cursor = new Date(cursorMs);
  if (span === 'week') {
    const endDay = startOfLocalDay(cursor);
    return { start: addLocalDays(endDay, -6), end: addLocalDays(endDay, 1) };
  }
  if (span === 'month') {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    return { start: start, end: new Date(start.getFullYear(), start.getMonth() + 1, 1) };
  }
  const start = startOfLocalDay(cursor);
  return { start: start, end: addLocalDays(start, 1) };
}

function shiftHistoryCursor(span, cursorMs, delta) {
  const cursor = new Date(cursorMs);
  if (span === 'month') return addLocalMonths(cursor, delta).getTime();
  const days = span === 'week' ? 7 * delta : delta;
  return addLocalDays(startOfLocalDay(cursor), days).getTime();
}

function formatRelayRange(span, bounds) {
  if (span === 'day') return formatBrowserDay(bounds.start);
  const last = new Date(bounds.end.getTime() - 1);
  return formatBrowserDay(bounds.start) + ' – ' + formatBrowserDay(last);
}

function historyWindowIncludesNow(entry, now) {
  const at = now == null ? Date.now() : now;
  return entry.historyStart != null && entry.historyEnd != null && at >= entry.historyStart && at < entry.historyEnd;
}

function setRelayHistorySpan(li, span) {
  const entry = sensorEntry(li.dataset.sensorId);
  if (!entry || (span !== 'day' && span !== 'week' && span !== 'month')) return;
  if (entry.historySpan === span) return;
  entry.historySpan = span;
  loadRelayHistory(entry);
}

function shiftRelayHistory(li, delta) {
  const entry = sensorEntry(li.dataset.sensorId);
  if (!entry) return;
  if (delta > 0 && entry.historyEnd > Date.now()) return;
  const span = entry.historySpan || 'day';
  const cursor = shiftHistoryCursor(span, entry.historyCursor || Date.now(), delta);
  const bounds = relayHistoryBounds(span, cursor);
  if (bounds.start.getTime() > Date.now()) return;
  entry.historyCursor = startOfLocalDay(new Date(cursor)).getTime();
  loadRelayHistory(entry);
}

function syncRelayHistoryNav(entry) {
  const bounds = relayHistoryBounds(entry.historySpan || 'day', entry.historyCursor || Date.now());
  const label = entry.li.querySelector('.relay-range');
  if (label) label.textContent = formatRelayRange(entry.historySpan || 'day', bounds);
  entry.li.querySelectorAll('.relay-span-btn').forEach(btn => {
    btn.setAttribute('aria-pressed', btn.dataset.span === entry.historySpan ? 'true' : 'false');
  });
  const next = entry.li.querySelector('.relay-next');
  if (next) {
    const blocked = bounds.end.getTime() > Date.now();
    next.classList.toggle('disabled', blocked);
    next.setAttribute('aria-disabled', blocked ? 'true' : 'false');
  }
}

function collectRelayPoints(node, year, month, day) {
  const points = [];
  function walk(current, parts) {
    const relay = current && typeof current === 'object' ? normalizeRelayString(current.r) : normalizeRelayString(current);
    if (relay != null && parts.length >= 2) {
      const hour = +parts[0];
      const minute = +parts[1];
      if (hour > 23 || minute > 59 || Number.isNaN(hour) || Number.isNaN(minute)) return;
      points.push({ ms: kyivWallTimeToDate(year, month, day, hour, minute).getTime(), r: relay });
      return;
    }
    if (!current || typeof current !== 'object') return;
    Object.keys(current).forEach(key => {
      walk(current[key], parts.concat(key));
    });
  }
  walk(node, []);
  return points;
}

function readRelayFolders(sensorId, folders) {
  return Promise.all(folders.map(folder => new Promise((resolve, reject) => {
    db.ref('relays/' + sensorId + '/' + folder.path).once('value', snapshot => {
      resolve(collectRelayPoints(snapshot.val(), folder.year, folder.month, folder.day));
    }, err => reject(err));
  }))).then(groups => mergeRelayPoints(groups));
}

function readRelayMonth(sensorId, year, month) {
  const pad = n => ('0' + n).slice(-2);
  return new Promise((resolve, reject) => {
    db.ref('relays/' + sensorId + '/' + year + '/' + pad(month)).once('value', snapshot => {
      const node = snapshot.val();
      const points = [];
      if (node && typeof node === 'object') {
        Object.keys(node).forEach(dayKey => {
          const day = +dayKey;
          if (!day || day > 31) return;
          collectRelayPoints(node[dayKey], year, month, day).forEach(point => points.push(point));
        });
      }
      resolve(points);
    }, err => reject(err));
  });
}

function mergeRelayPoints(groups) {
  const merged = new Map();
  groups.forEach(points => points.forEach(point => merged.set(point.ms, point)));
  return Array.from(merged.values()).sort((a, b) => a.ms - b.ms);
}

function latestRelayBefore(points, startMs) {
  let best = null;
  points.forEach(point => {
    if (point.ms < startMs && (!best || point.ms > best.ms)) best = point;
  });
  return best;
}

function priorFromLast(entry, startMs) {
  const last = entry.lastReading;
  const relay = normalizeRelayString(last && last.r);
  const instant = parseDeviceTime(last && last.time);
  if (!relay || !instant || instant.getTime() >= startMs) return null;
  return { ms: instant.getTime(), r: relay };
}

function lookbackRelayPrior(sensorId, startMs) {
  const startFolder = kyivDayFolder(new Date(startMs));
  let year = startFolder.year;
  let month = startFolder.month;
  let steps = RELAY_PRIOR_MONTHS;
  function next() {
    if (steps <= 0) return Promise.resolve(null);
    steps -= 1;
    const y = year;
    const m = month;
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    return readRelayMonth(sensorId, y, m).then(points => {
      const found = latestRelayBefore(points, startMs);
      if (found) return found;
      return next();
    });
  }
  return next();
}

function withLiveRelayPoint(entry, events, startMs, endMs) {
  if (!historyWindowIncludesNow(entry)) return events;
  const last = entry.lastReading;
  const relay = normalizeRelayString(last && last.r);
  const instant = parseDeviceTime(last && last.time);
  if (!relay || !instant) return events;
  const ms = instant.getTime();
  if (ms < startMs || ms >= endMs) return events;
  if (events.some(ev => ev.ms === ms)) return events;
  const copy = events.concat({ ms: ms, r: relay });
  copy.sort((a, b) => a.ms - b.ms);
  return copy;
}

function noteRelayHistory(entry, relay, instant) {
  if (!entry.historyReady || !instant) return;
  if (!historyWindowIncludesNow(entry)) return;
  const ms = instant.getTime();
  if (ms < entry.historyStart) {
    if (!entry.historyPrior || ms > entry.historyPrior.ms) {
      entry.historyPrior = { ms: ms, r: relay };
      renderRelayHistory(entry);
    }
    return;
  }
  if (ms >= entry.historyEnd) return;
  const events = entry.historyEvents || (entry.historyEvents = []);
  const existing = events.find(ev => ev.ms === ms);
  if (existing) {
    if (existing.r === relay) return;
    existing.r = relay;
  } else {
    events.push({ ms: ms, r: relay });
    events.sort((a, b) => a.ms - b.ms);
  }
  renderRelayHistory(entry);
}

function loadRelayHistory(entry) {
  if (!entry || !entry.li) return;
  const span = entry.historySpan || 'day';
  const bounds = relayHistoryBounds(span, entry.historyCursor || Date.now());
  const requestId = (entry.historyRequest || 0) + 1;
  entry.historyRequest = requestId;
  entry.historyReady = false;
  entry.historyStart = bounds.start.getTime();
  entry.historyEnd = bounds.end.getTime();
  syncRelayHistoryNav(entry);
  const empty = entry.li.querySelector('.relay-history-empty');
  if (empty) empty.hidden = true;
  const scale = entry.li.querySelector('.relay-scale');
  if (scale) scale.textContent = '';
  const folders = kyivFoldersOverlapping(bounds.start, bounds.end);
  const startMs = bounds.start.getTime();
  const endMs = bounds.end.getTime();
  readRelayFolders(entry.sensorId, folders).then(points => {
    if (entry.historyRequest !== requestId || !entry.li.isConnected) return null;
    const priorEdge = latestRelayBefore(points, startMs);
    if (priorEdge) return { points: points, prior: priorEdge };
    const fromLast = priorFromLast(entry, startMs);
    if (fromLast) return { points: points, prior: fromLast };
    return lookbackRelayPrior(entry.sensorId, startMs).then(prior => {
      return { points: points, prior: prior };
    }).catch(err => {
      console.log(err && err.message ? err.message : err);
      return { points: points, prior: null };
    });
  }).then(result => {
    if (!result || entry.historyRequest !== requestId || !entry.li.isConnected) return;
    const inWindow = result.points.filter(point => point.ms >= startMs && point.ms < endMs);
    entry.historyPrior = result.prior;
    entry.historyEvents = withLiveRelayPoint(entry, inWindow, startMs, endMs);
    entry.historyReady = true;
    renderRelayHistory(entry);
  }).catch(err => console.log(err && err.message ? err.message : err));
}

function relayHistoryCount(events, prior) {
  let max = 0;
  if (prior && prior.r) max = prior.r.length;
  events.forEach(ev => {
    if (ev.r && ev.r.length > max) max = ev.r.length;
  });
  return max;
}

function pushRelaySegment(segments, from, to, kind) {
  if (to <= from) return;
  const prev = segments[segments.length - 1];
  if (prev && prev.kind === kind && prev.to === from) {
    prev.to = to;
    return;
  }
  segments.push({ from: from, to: to, kind: kind });
}

function relayRowModel(events, prior, index, startMs, endMs) {
  let state = prior ? relayBit(prior.r, index) : null;
  const segments = [];
  const dots = [];
  let cursor = startMs;
  events.forEach(ev => {
    const on = relayBit(ev.r, index);
    if (on == null || ev.ms < cursor) return;
    if (ev.ms > cursor) pushRelaySegment(segments, cursor, ev.ms, state == null ? 'unknown' : (state ? 'on' : 'off'));
    if (state !== on) dots.push({ ms: ev.ms, on: on });
    state = on;
    cursor = ev.ms;
  });
  if (cursor < endMs && state != null) pushRelaySegment(segments, cursor, endMs, state ? 'on' : 'off');
  return { segments: segments, dots: dots };
}

function placeRelaySegment(el, startMs, endMs, from, to) {
  const span = endMs - startMs;
  el.style.left = ((from - startMs) / span * 100) + '%';
  el.style.width = ((to - from) / span * 100) + '%';
}

function relayAxisLabels(span, start, end) {
  const labels = [];
  if (span === 'day') {
    let cursor = new Date(start.getTime());
    while (cursor.getTime() < end.getTime()) {
      labels.push({ at: cursor.getTime(), text: ('0' + cursor.getHours()).slice(-2) });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), cursor.getHours() + 1);
    }
    labels.push({ at: end.getTime(), text: '24' });
    return labels;
  }
  let cursor = startOfLocalDay(start);
  if (cursor.getTime() < start.getTime()) cursor = addLocalDays(cursor, 1);
  while (cursor.getTime() < end.getTime()) {
    const next = addLocalDays(cursor, 1);
    const slotEnd = Math.min(next.getTime(), end.getTime());
    const text = span === 'week'
      ? DAY_LABELS[cursor.getDay()] + ' ' + cursor.getDate()
      : String(cursor.getDate());
    labels.push({ at: cursor.getTime() + (slotEnd - cursor.getTime()) / 2, text: text });
    cursor = next;
  }
  return labels;
}

function renderRelayHistory(entry) {
  const scale = entry.li.querySelector('.relay-scale');
  const empty = entry.li.querySelector('.relay-history-empty');
  if (!scale || !empty) return;
  const events = entry.historyEvents || [];
  const prior = entry.historyPrior || null;
  const count = relayHistoryCount(events, prior);
  const startMs = entry.historyStart;
  const endMs = entry.historyEnd;
  scale.classList.remove('span-day', 'span-week', 'span-month');
  scale.classList.add('span-' + (entry.historySpan || 'day'));
  scale.textContent = '';
  if (!count || endMs <= startMs) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  for (let index = 0; index < count; index++) {
    const row = document.createElement('div');
    row.className = 'relay-row';
    const label = document.createElement('span');
    label.className = 'relay-row-label';
    label.textContent = 'Реле ' + index;
    const track = document.createElement('div');
    track.className = 'relay-track';
    const model = relayRowModel(events, prior, index, startMs, endMs);
    model.segments.forEach(seg => {
      if (seg.to <= seg.from) return;
      const el = document.createElement('span');
      el.className = 'relay-seg ' + seg.kind;
      placeRelaySegment(el, startMs, endMs, seg.from, seg.to);
      track.appendChild(el);
    });
    model.dots.forEach(dot => {
      const el = document.createElement('span');
      el.className = 'relay-dot ' + (dot.on ? 'on' : 'off');
      const when = formatBrowserDateTime(new Date(dot.ms));
      el.title = when;
      el.setAttribute('aria-label', when);
      el.style.left = ((dot.ms - startMs) / (endMs - startMs) * 100) + '%';
      track.appendChild(el);
    });
    row.appendChild(label);
    row.appendChild(track);
    scale.appendChild(row);
  }
  const axisRow = document.createElement('div');
  axisRow.className = 'relay-row relay-axis-row';
  const spacer = document.createElement('span');
  spacer.className = 'relay-row-label';
  spacer.setAttribute('aria-hidden', 'true');
  const axis = document.createElement('div');
  axis.className = 'relay-axis';
  relayAxisLabels(entry.historySpan || 'day', new Date(startMs), new Date(endMs)).forEach(item => {
    const el = document.createElement('span');
    el.className = 'relay-axis-label';
    el.textContent = item.text;
    const pct = (item.at - startMs) / (endMs - startMs) * 100;
    el.style.left = pct + '%';
    if (pct < 3) el.classList.add('edge-start');
    else if (pct > 97) el.classList.add('edge-end');
    axis.appendChild(el);
  });
  axisRow.appendChild(spacer);
  axisRow.appendChild(axis);
  scale.appendChild(axisRow);
}
