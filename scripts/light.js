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
  if (entry) clearTimeout(entry.relayTimer);
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
}

function applyRelayReading(entry, relay) {
  ensureLightCard(entry);
  entry.relayReported = relay;
  if (entry.relayPending && Date.now() < entry.relayPendingUntil && relay !== entry.relayPending) return;
  entry.relayPending = null;
  entry.relayBits = parseRelayBits(relay);
  paintRelayToggles(entry);
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
