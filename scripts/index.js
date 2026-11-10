const STATUS_REFRESH_MS = 60 * 1000;
const CHART_REFRESH_MS = 60 * 1000;
const DEFAULT_TEMP_MIN = 18;
const DEFAULT_TEMP_MAX = 20;

const STATUS_LABEL = {
  green: 'Останній запис не старший за 1 годину',
  yellow: 'Останній запис від 1 до 48 годин',
  red: 'Немає свіжих даних'
};

function paintSensorStatus(li, instant, now) {
  const status = sensorStatus(instant, now);
  const dot = li.querySelector('.sensor-status');
  if (!dot) return;
  dot.classList.remove('status-green', 'status-yellow', 'status-red');
  dot.classList.add('status-' + status);
  dot.title = STATUS_LABEL[status];
  dot.setAttribute('aria-label', STATUS_LABEL[status]);
  li.dataset.status = status;
}

function rememberLastInstant(li, instant, timeRaw) {
  if (instant) li.dataset.lastAt = String(instant.getTime());
  else delete li.dataset.lastAt;
  if (timeRaw) li.dataset.lastTime = String(timeRaw);
  else delete li.dataset.lastTime;
  paintSensorStatus(li, instant);
}

function refreshSensorStatuses() {
  if (!sensorList) return;
  sensorList.querySelectorAll(':scope > li').forEach(li => {
    const raw = li.dataset.lastAt;
    const instant = raw ? new Date(Number(raw)) : null;
    paintSensorStatus(li, Number.isNaN(instant && instant.getTime()) ? null : instant);
  });
}

// DOM elements
const sensorList = document.querySelector('.sensors');
const loggedOutLinks = document.querySelectorAll('.logged-out');
const loggedInLinks = document.querySelectorAll('.logged-in');
const accountDetails = document.querySelector('.account-details');
initDragSort(sensorList, '.drag-handle');
initCardToggle(sensorList);

const setupUI = (user) => {
  if (user) {
    // account info
    const html = `
        <div>Logged in as ${user.email}</div>
      `;
    accountDetails.innerHTML = html;
    // // toggle user UI elements
    loggedInLinks.forEach(item => item.style.display = 'block');
    loggedOutLinks.forEach(item => item.style.display = 'none');
  } else {
    // clear account info
    accountDetails.innerHTML = '';
    // toggle user elements
    loggedInLinks.forEach(item => item.style.display = 'none');
    loggedOutLinks.forEach(item => item.style.display = 'block');
  }
};

// setup sensors
let sensorsDataArray = [];
const setupSensors = (data) => {
  if (data) {
    //remove diasapperaed sensors and detach all firebase listeners
    sensorsDataArray = sensorsDataArray.filter(sensorData => {
      if (!data[sensorData.sensorId]) {
        console.log(`Sensor ${sensorData.sensorId} was removed from database`);
        sensorData.li.remove();
        sensorData.fbSensorValueListener.forEach(ref => db.ref(ref).off());
        destroySensorChart(sensorData);
        return false;
      } else {
        return true;
      }
    })

    Object.keys(data).sort((a, b) => (data[a].position || 1 << 20) - (data[b].position || 1 << 20)).forEach(sensorId => {
      // Object.keys(data).forEach(sensorId => {
      if (sensorsDataArray.find(sensorData => sensorData.sensorId == sensorId)) return;//skip already added Sensors
      console.log(`Sensor ${sensorId} will be added to DOM`);
      let sensorMac = data[sensorId].mac || data[sensorId];//temporary patch to be compatible with other version
      const li = createSensorLiElement(sensorId, sensorMac);
      let sensorData = {
        li: li,
        sensorId: sensorId,
        sensorMac: sensorMac,
        //fbSensorValueListener : 'sensors/' + sensorId + '/last'
        fbSensorValueListener: [
          'sensors/' + sensorId + '/last',
          'sensors/' + sensorId + '/info',
          'sensors/' + sensorId + '/start'
        ]
      };
      sensorsDataArray.push(sensorData);
      //add data listeners for sensor
      db.ref('sensors/' + sensorId + '/last').on('value', snapshot => {
        sensorSummaryDataReceived(sensorId, { last: snapshot.val() }, li);
      });
      db.ref('sensors/' + sensorId + '/info').on('value', snapshot => {
        sensorSummaryDataReceived(sensorId, { info: snapshot.val() }, li);
      });
      db.ref('sensors/' + sensorId + '/start').on('value', snapshot => {
        sensorSummaryDataReceived(sensorId, { start: snapshot.val() }, li);
      });

      loadChartDay(sensorData, new Date());


    });

  } else {
    //detach all firebase listeners
    sensorsDataArray.forEach(sensorData => {
      sensorData.fbSensorValueListener.forEach(ref => db.ref(ref).off());
      destroySensorChart(sensorData);
    })
    sensorsDataArray.length = 0;
    sensorList.innerHTML = '<h5 class="center-align">Login to view sensors</h5>';
  }


};

function createSensorLiElement(sensorId, sensorMac) {
  const li = document.createElement('li');
  li.dataset.sensorId = sensorId;
  li.className = 'tile sensor-' + sensorId;
  li.innerHTML = `
      <div class="tile-head">
        <i class="material-icons drag-handle">drag_indicator</i>
        <span class="sensor-status status-red" title="Немає свіжих даних" aria-label="Немає свіжих даних"></span>
        <span class="tile-title"><span class="room-name-value">Незадано</span></span>
        <span class="tile-id">${sensorId} <a href="#" id="refresh-sensor-${sensorId}"><i class="material-icons">refresh</i></a></span>
        <b class="tile-value last-temp-value"></b>
        <span class="tile-time last-time-value"></span>
        <i class="material-icons tile-chevron">expand_more</i>
      </div>
      <div class="tile-body">
      <div class="sensor-fields">
        <p>Room name : <span class="room-name-value">Незадано</span></p>
        <p>Sensor name : <span class="sensor-name-value">Незадано</span></p>
        <p>Sensor type : <span class="sensor-type-value">Незадано</span> </p>
        <p>Sensor mac : <span class="sensor-mac-value">Незадано</span> </p>
        <a class="waves-effect waves-light btn-small" id="edit-sensor-${sensorId}">Edit</a>
        <a class="waves-effect orange darken-4 btn-small" id="delete-sensor-${sensorId}">Delete</a>
      </div>
        <p>Start time : <span class="start-time-value"></span> </p>
        <p>Last time : <span class="last-time-value"></span> </p>
        <p>Last temp : <span class="last-temp-value"></span> </p>
        <div class="chart-nav">
          <a href="#" class="waves-effect waves-light btn-small chart-prev" title="Попередній день" aria-label="Попередній день"><i class="material-icons">chevron_left</i></a>
          <input type="date" class="chart-day" aria-label="День графіка">
          <a href="#" class="waves-effect waves-light btn-small chart-next" title="Наступний день" aria-label="Наступний день"><i class="material-icons">chevron_right</i></a>
          <a href="#" class="waves-effect waves-light btn-small chart-today">Сьогодні</a>
        </div>
        <div class="chart-wrap">
          <canvas class="single-sensor-chart" id="canvas-${sensorId}"></canvas>
        </div>
      </div>
  `;
  sensorList.appendChild(li);
  li.querySelectorAll(`.sensor-mac-value`).forEach(el => el.innerHTML = sensorMac);

  document.querySelector(`#refresh-sensor-${sensorId}`).addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    let li = this;
    li.children[0].classList.add('rotate360');
    setTimeout(() => {
      li.children[0].classList.remove('rotate360');
    }, 1000);
    fbRefreshSensor(sensorMac).then(msg => {
      console.log(msg);
    }).catch(msg => {
      console.log(msg);
    });
  });

  document.querySelector(`#edit-sensor-${sensorId}`).addEventListener('click', (e) => {
    e.preventDefault();
    editSensorInfo(sensorId, li);
  });

  document.querySelector(`#delete-sensor-${sensorId}`).addEventListener('click', (e) => {
    e.preventDefault();
    confirmDialog(`Ви впевнені що хочете вилучити сенсор ${sensorId}?`).then((result) => {
      if (result) {
        fbDeleteSensor(sensorId).then(msg => {
          alert(msg);
        }).catch(msg => {
          alert(msg);
        });
      }
    });
  });

  li.querySelector('.chart-prev').addEventListener('click', (e) => {
    e.preventDefault();
    shiftChartDay(sensorId, -1);
  });
  li.querySelector('.chart-next').addEventListener('click', (e) => {
    e.preventDefault();
    const entry = sensorEntry(sensorId);
    if (!entry || isChartToday(entry)) return;
    shiftChartDay(sensorId, 1);
  });
  li.querySelector('.chart-today').addEventListener('click', (e) => {
    e.preventDefault();
    const entry = sensorEntry(sensorId);
    if (entry) loadChartDay(entry, new Date());
  });
  li.querySelector('.chart-day').addEventListener('change', (e) => {
    const value = e.target.value;
    if (!value) return;
    const parts = value.split('-').map(Number);
    const entry = sensorEntry(sensorId);
    if (entry) loadChartDay(entry, new Date(parts[0], parts[1] - 1, parts[2]));
  });

  return li;
}

function editSensorInfo(sensorId, li) {
  const modal = document.querySelector('#modal-update-sensor');
  updateSensorForm.reset();
  updateSensorForm.sensorId.value = sensorId;
  let el = sensorsDataArray.find(sensorData => sensorData.sensorId == sensorId);
  updateSensorForm.roomName.value = el.roomName || '';
  updateSensorForm.sensorName.value = el.sensorName || '';
  updateSensorForm.sensorType.value = el.sensorType || '';
  updateSensorForm.tempMin.value = el.tempMin != null ? el.tempMin : (isThermometer(el) ? DEFAULT_TEMP_MIN : '');
  updateSensorForm.tempMax.value = el.tempMax != null ? el.tempMax : (isThermometer(el) ? DEFAULT_TEMP_MAX : '');
  updateSensorForm.querySelectorAll('label').forEach(el => el.classList.add('active'));
  M.Modal.getInstance(modal).open();
};


function sensorEntry(sensorId) {
  return sensorsDataArray.find(item => item.sensorId == sensorId);
}

function sensorSummaryDataReceived(sensorId, sensorData, li) {
  console.log('Received update for sensor ' + sensorId, sensorData);
  const entry = sensorEntry(sensorId);
  if (sensorData.last) {
    const last = sensorData.last;
    const instant = parseDeviceTime(last.time);
    const prevAt = Number(li.dataset.lastAt || 0);
    const stale = !!(instant && prevAt && instant.getTime() < prevAt);
    if (!stale) {
      const timeText = instant ? formatBrowserDateTime(instant) : (last.time ? String(last.time) : '');
      li.querySelectorAll('.last-temp-value').forEach(el => { el.textContent = formatSensorReading(last); });
      li.querySelectorAll('.last-time-value').forEach(el => { el.textContent = timeText; });
      rememberLastInstant(li, instant, last.time);
      const temp = finiteNumber(last.t);
      if (temp != null) li.dataset.lastTemp = String(temp);
      else delete li.dataset.lastTemp;
    }
    if (entry) {
      entry.lastReading = last;
      paintTemperatureRange(entry);
      updateChartLimits(entry);
      upsertTodayPoint(entry, last);
    }
    const temp = finiteNumber(last.t);
    if (!stale && last.h == null && last.time && temp != null) {
      loadPointHumidity(sensorId, last, li);
    }
  }
  if (sensorData.start) {
    const startRaw = typeof sensorData.start === 'string' ? sensorData.start : sensorData.start.time;
    const startInstant = parseDeviceTime(startRaw);
    const startText = startInstant ? formatBrowserDateTime(startInstant) : (startRaw ? String(startRaw) : '');
    li.querySelectorAll('.start-time-value').forEach(el => { el.textContent = startText; });
  }
  if (sensorData.info && entry) {
    li.querySelectorAll(`.room-name-value`).forEach(el => el.innerHTML = sensorData?.info?.roomName);
    li.querySelectorAll(`.sensor-name-value`).forEach(el => el.innerHTML = sensorData?.info?.sensorName);
    li.querySelectorAll(`.sensor-type-value`).forEach(el => el.innerHTML = sensorData?.info?.sensorType);
    entry.roomName = sensorData?.info?.roomName;
    entry.sensorName = sensorData?.info?.sensorName;
    entry.sensorType = sensorData?.info?.sensorType;
    entry.tempMin = finiteNumber(sensorData.info.tempMin);
    entry.tempMax = finiteNumber(sensorData.info.tempMax);
    paintTemperatureRange(entry);
    updateChartLimits(entry);
  }
}

function isThermometer(entry) {
  if (!entry) return false;
  if (finiteNumber(entry.li && entry.li.dataset.lastTemp) != null) return true;
  return entry.sensorType === 'DS18B20' || entry.sensorType === 'DHT22';
}

function effectiveTempLimit(entry, stored, fallback) {
  if (stored != null) return stored;
  return isThermometer(entry) ? fallback : null;
}

function paintTemperatureRange(entry) {
  const t = finiteNumber(entry.li.dataset.lastTemp);
  const min = effectiveTempLimit(entry, entry.tempMin, DEFAULT_TEMP_MIN);
  const max = effectiveTempLimit(entry, entry.tempMax, DEFAULT_TEMP_MAX);
  const below = t != null && min != null && t < min;
  const above = t != null && max != null && t > max;
  let title = '';
  if (below && above) title = 'Поза межами';
  else if (below) title = 'Нижче мінімуму ' + formatTemperature(min);
  else if (above) title = 'Вище максимуму ' + formatTemperature(max);
  entry.li.querySelectorAll('.last-temp-value').forEach(el => {
    el.classList.toggle('temp-out-of-range', below || above);
    if (title) el.title = title;
    else el.removeAttribute('title');
  });
}

// DHT22 humidity is stored on temperatures/{id}/yyyy/mm/dd/hh/mm, not on sensors/{id}/last.
function loadPointHumidity(sensorId, last, li) {
  const timePath = String(last.time);
  db.ref('temperatures/' + sensorId + '/' + timePath).once('value', snapshot => {
    if (li.dataset.lastTime !== timePath) return;
    const point = snapshot.val();
    if (!point || point.h == null) return;
    const text = formatSensorReading({ t: last.t, h: point.h });
    if (!text) return;
    li.querySelectorAll('.last-temp-value').forEach(el => { el.textContent = text; });
  }, err => console.log(err.message));
}

function destroySensorChart(entry) {
  if (!entry.temperaturesChart) return;
  entry.temperaturesChart.destroy();
  entry.temperaturesChart = null;
}

function isChartToday(entry) {
  return entry.chartDay != null && entry.chartDay === startOfLocalDay(new Date()).getTime();
}

function syncChartNav(entry) {
  const day = new Date(entry.chartDay);
  const input = entry.li.querySelector('.chart-day');
  if (input) input.value = formatLocalDateInput(day);
  const next = entry.li.querySelector('.chart-next');
  if (!next) return;
  const onToday = isChartToday(entry) || entry.chartDay > startOfLocalDay(new Date()).getTime();
  next.classList.toggle('disabled', onToday);
  next.setAttribute('aria-disabled', onToday ? 'true' : 'false');
}

function shiftChartDay(sensorId, delta) {
  const entry = sensorEntry(sensorId);
  if (!entry) return;
  const current = new Date(entry.chartDay || Date.now());
  loadChartDay(entry, new Date(current.getFullYear(), current.getMonth(), current.getDate() + delta));
}

function formatChartTick(value, dayEndMs) {
  const ms = Number(value);
  if (ms >= dayEndMs - 1000) return '24:00';
  return formatBrowserClock(new Date(ms));
}

// Linear ticks on millisecond values are not clock hours, so place them every four hours.
function buildDayTicks(scale) {
  const step = 4 * 60 * 60 * 1000;
  const start = Math.round(scale.min);
  const end = Math.round(scale.max);
  const ticks = [];
  for (let value = start; value < end - 1000; value += step) ticks.push({ value });
  ticks.push({ value: end });
  scale.ticks = ticks;
}

function limitLineDataset(label, value, bounds, color) {
  return {
    label: label + ' ' + formatTemperature(value),
    data: [
      { x: bounds.start.getTime(), y: value },
      { x: bounds.end.getTime(), y: value }
    ],
    borderColor: color,
    borderWidth: 1.5,
    borderDash: [6, 4],
    pointRadius: 0,
    pointHitRadius: 0,
    tension: 0,
    fill: false
  };
}

function buildTemperatureDatasets(entry, points, bounds) {
  const datasets = [{
    label: 'Температура',
    data: points,
    normalized: true,
    borderColor: 'rgb(54, 162, 235)',
    backgroundColor: 'rgba(54, 162, 235, 0.15)',
    borderWidth: 2,
    pointRadius: points.length > 120 ? 0 : 2,
    pointHoverRadius: 4,
    tension: 0,
    fill: false
  }];
  const tempMin = effectiveTempLimit(entry, entry.tempMin, DEFAULT_TEMP_MIN);
  const tempMax = effectiveTempLimit(entry, entry.tempMax, DEFAULT_TEMP_MAX);
  if (tempMin != null) datasets.push(limitLineDataset('Мін', tempMin, bounds, '#2e7d32'));
  if (tempMax != null) datasets.push(limitLineDataset('Макс', tempMax, bounds, '#e65100'));
  return datasets;
}

function chartOptions(bounds) {
  const dayEnd = bounds.end.getTime();
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'x', intersect: false },
    plugins: {
      legend: { labels: { boxWidth: 12 } },
      tooltip: {
        filter: item => item.dataset.label === 'Температура',
        callbacks: {
          title: items => formatBrowserDateTime(new Date(items[0].parsed.x)),
          label: item => Number(item.parsed.y).toFixed(1) + '°C'
        }
      }
    },
    scales: {
      x: {
        type: 'linear',
        min: bounds.start.getTime(),
        max: dayEnd,
        afterBuildTicks: buildDayTicks,
        ticks: {
          maxRotation: 0,
          autoSkip: false,
          callback: function (value) {
            return formatChartTick(value, this.max);
          }
        }
      },
      y: {
        grace: '10%',
        ticks: {
          callback: value => Number(value).toFixed(1) + '°'
        }
      }
    }
  };
}

function showTemperatureChart(entry, points, bounds) {
  const canvas = entry.li.querySelector('.single-sensor-chart');
  if (!canvas) return;
  const datasets = buildTemperatureDatasets(entry, points, bounds);
  if (!entry.temperaturesChart) {
    entry.temperaturesChart = new Chart(canvas, {
      type: 'line',
      data: { datasets },
      options: chartOptions(bounds)
    });
  } else {
    const chart = entry.temperaturesChart;
    chart.data.datasets = datasets;
    chart.options.scales.x.min = bounds.start.getTime();
    chart.options.scales.x.max = bounds.end.getTime();
    chart.update();
  }
  if (entry.li.classList.contains('open') && canvas.clientWidth === 0) resizeCardChart(entry.li);
}

function updateChartLimits(entry) {
  const chart = entry.temperaturesChart;
  if (!chart || entry.chartDay == null) return;
  const bounds = localDayBounds(new Date(entry.chartDay));
  const points = chart.data.datasets[0].data;
  chart.data.datasets = buildTemperatureDatasets(entry, points, bounds);
  chart.update();
}

function readTemperatureFolders(sensorId, folders, rangeStart, rangeEnd) {
  return Promise.all(folders.map(folder => new Promise((resolve, reject) => {
    db.ref('temperatures/' + sensorId + '/' + folder.path).once('value', snapshot => {
      resolve(collectTemperaturePoints(snapshot.val(), folder.year, folder.month, folder.day, rangeStart, rangeEnd));
    }, err => reject(err));
  }))).then(groups => {
    const merged = new Map();
    groups.forEach(points => points.forEach(point => merged.set(point.x, point)));
    return Array.from(merged.values()).sort((a, b) => a.x - b.x);
  });
}

function showLatestChartPoint(entry, point) {
  const prev = Number(entry.li.dataset.lastAt || 0);
  if (!point || point.x <= prev) return;
  const instant = new Date(point.x);
  entry.li.querySelectorAll('.last-temp-value').forEach(el => { el.textContent = formatTemperature(point.y); });
  entry.li.querySelectorAll('.last-time-value').forEach(el => { el.textContent = formatBrowserDateTime(instant); });
  rememberLastInstant(entry.li, instant);
  entry.li.dataset.lastTemp = String(point.y);
  paintTemperatureRange(entry);
}

function mergeChartPoints(entry, points) {
  const chart = entry.temperaturesChart;
  if (!chart || !isChartToday(entry) || !points.length) return;
  const data = chart.data.datasets[0].data;
  let changed = false;
  points.forEach(point => {
    const found = data.find(item => item.x === point.x);
    if (found) {
      if (found.y !== point.y) {
        found.y = point.y;
        changed = true;
      }
    } else {
      data.push(point);
      changed = true;
    }
  });
  if (changed) {
    data.sort((a, b) => a.x - b.x);
    chart.update();
  }
  showLatestChartPoint(entry, data[data.length - 1]);
}

// sensors/{id}/last can lag behind the day folder, so today's open chart is reread once a minute.
function refreshTodayCharts() {
  sensorsDataArray.forEach(entry => {
    if (!entry.temperaturesChart || !isChartToday(entry)) return;
    const token = entry.chartRequest;
    const bounds = localDayBounds(new Date(entry.chartDay));
    readTemperatureFolders(
      entry.sensorId,
      kyivFoldersForLocalDay(bounds),
      bounds.start.getTime(),
      bounds.end.getTime()
    ).then(points => {
      if (entry.chartRequest !== token || !isChartToday(entry)) return;
      mergeChartPoints(entry, points);
    }).catch(err => console.log(err.message));
    db.ref('sensors/' + entry.sensorId + '/last').once('value', snapshot => {
      const last = snapshot.val();
      if (last) sensorSummaryDataReceived(entry.sensorId, { last }, entry.li);
    });
  });
}

function upsertTodayPoint(entry, last) {
  const chart = entry.temperaturesChart;
  if (!chart || !isChartToday(entry)) return;
  const instant = parseDeviceTime(last && last.time);
  const y = finiteNumber(last && last.t);
  if (!instant || y == null) return;
  const bounds = localDayBounds(new Date(entry.chartDay));
  const x = instant.getTime();
  if (x < bounds.start.getTime() || x >= bounds.end.getTime()) return;
  const data = chart.data.datasets[0].data;
  const found = data.find(point => point.x === x);
  if (found) {
    if (found.y === y) return;
    found.y = y;
  } else {
    data.push({ x, y });
    data.sort((a, b) => a.x - b.x);
  }
  chart.update();
}

// One-shot read of the selected browser-local day. While that day is today,
// later readings are appended from sensors/{id}/last.
function loadChartDay(entry, dayDate) {
  const bounds = localDayBounds(dayDate);
  const requestId = (entry.chartRequest || 0) + 1;
  entry.chartRequest = requestId;
  entry.chartDay = bounds.start.getTime();
  syncChartNav(entry);
  readTemperatureFolders(entry.sensorId, kyivFoldersForLocalDay(bounds), bounds.start.getTime(), bounds.end.getTime()).then(points => {
    if (entry.chartRequest !== requestId) return;
    showTemperatureChart(entry, points, bounds);
    if (entry.lastReading) upsertTodayPoint(entry, entry.lastReading);
  }).catch(err => console.log(err.message));
}

// setup materialize components
document.addEventListener('DOMContentLoaded', function () {

  let modals = document.querySelectorAll('.modal');
  M.Modal.init(modals);

  let menuElems = document.querySelectorAll('.sidenav');
  let instances = M.Sidenav.init(menuElems);

  let selectElems = document.querySelectorAll('select');
  let selectInstances = M.FormSelect.init(selectElems);

});

setInterval(refreshSensorStatuses, STATUS_REFRESH_MS);
setInterval(refreshTodayCharts, CHART_REFRESH_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshTodayCharts();
});

