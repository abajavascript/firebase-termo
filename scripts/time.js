// Firmware writes Lviv wall time as yyyy/mm/dd/hh/mm, not UTC.
// Read that clock as Europe/Kyiv, then show it in the browser time zone.
// Status age is Date.now() minus that instant, so another country does not shift it.
const STATUS_FRESH_MS = 60 * 60 * 1000;
const STATUS_STALE_MS = 48 * 60 * 60 * 1000;
const DEVICE_TIME_ZONE = resolveDeviceTimeZone();

function resolveDeviceTimeZone() {
  const candidates = ['Europe/Kyiv', 'Europe/Kiev'];
  for (let i = 0; i < candidates.length; i++) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: candidates[i] });
      return candidates[i];
    } catch (err) {
      // Older engines only know Europe/Kiev.
    }
  }
  return 'UTC';
}

function readZonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(date);
  const map = {};
  parts.forEach(part => {
    if (part.type !== 'literal') map[part.type] = part.value;
  });
  let year = +map.year;
  let month = +map.month;
  let day = +map.day;
  let hour = +map.hour;
  const minute = +map.minute;
  const second = +map.second;
  if (hour === 24) {
    hour = 0;
    const rolled = new Date(Date.UTC(year, month - 1, day) + 24 * 60 * 60 * 1000);
    year = rolled.getUTCFullYear();
    month = rolled.getUTCMonth() + 1;
    day = rolled.getUTCDate();
  }
  return { year, month, day, hour, minute, second };
}

function zoneOffsetMs(utcMs, timeZone) {
  const parts = readZonedParts(new Date(utcMs), timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - utcMs;
}

function kyivWallTimeToDate(year, month, day, hour, minute) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset = zoneOffsetMs(utcGuess, DEVICE_TIME_ZONE);
  let instant = utcGuess - offset;
  const offsetAtInstant = zoneOffsetMs(instant, DEVICE_TIME_ZONE);
  if (offsetAtInstant !== offset) instant = utcGuess - offsetAtInstant;
  return new Date(instant);
}

function parseDeviceTime(value) {
  if (value == null || value === '') return null;
  const match = /^(\d{4})\/(\d{2})\/(\d{2})\/(\d{2})\/(\d{2})$/.exec(String(value).trim());
  if (!match) return null;
  const month = +match[2];
  const day = +match[3];
  const hour = +match[4];
  const minute = +match[5];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  return kyivWallTimeToDate(+match[1], month, day, hour, minute);
}

function formatBrowserDateTime(date) {
  const pad = n => ('0' + n).slice(-2);
  return date.getFullYear() + '.' + pad(date.getMonth() + 1) + '.' + pad(date.getDate())
    + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function browserDayPath(date) {
  const d = date || new Date();
  const pad = n => ('0' + n).slice(-2);
  return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate());
}

function finiteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function formatTemperature(value) {
  const n = finiteNumber(value);
  if (n == null) return '';
  return n.toFixed(1) + '°C';
}

function formatHumidity(value) {
  const n = finiteNumber(value);
  if (n == null) return '';
  return n.toFixed(1) + '%';
}

function formatSensorReading(record) {
  if (!record) return '';
  const temp = formatTemperature(record.t);
  if (!temp) return '';
  const humidity = formatHumidity(record.h);
  return humidity ? temp + ' ' + humidity : temp;
}

function sensorStatus(instant, now) {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) return 'red';
  const age = (now == null ? Date.now() : now) - instant.getTime();
  if (age <= STATUS_FRESH_MS) return 'green';
  if (age <= STATUS_STALE_MS) return 'yellow';
  return 'red';
}
