// DOM elements
const sensorList = document.querySelector('.sensors');
const loggedOutLinks = document.querySelectorAll('.logged-out');
const loggedInLinks = document.querySelectorAll('.logged-in');
const accountDetails = document.querySelector('.account-details');
let draggedLiElement;
let lastDragEnter;//global variable to fix drag enter/leave over child

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
        return false;
      } else {
        return true;
      }
    })

    // Object.keys(data).sort((a, b) => (''+data[a].roomName).localeCompare(''+data[b].roomName)).forEach(sensorId => {
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

      //chart for today
      //activate only when expanded collapsible
      //THIS SHOULD BE EXECUTED ON EXPAND
      function getNowYYYYMMDD() {
        const d = new Date();
        return d.getFullYear() + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + ('0' + (d.getDate())).slice(-2);
      }
      db.ref(`temperatures/${sensorId}/` + getNowYYYYMMDD()).once('value', snapshot => {
        console.log(`Received temperatures of #${sensorId} sensor`, snapshot.val());
        setupTemperaturesChart(sensorData, snapshot.val());
      }, err => console.log(err.message));
      //*********************** */


    });


  } else {
    //detach all firebase listeners
    sensorsDataArray.forEach(sensorData => {
      sensorData.fbSensorValueListener.forEach(ref => db.ref(ref).off());
    })
    sensorsDataArray.length = 0;
    sensorList.innerHTML = '<h5 class="center-align">Login to view sensors</h5>';
  }


};

function createSensorLiElement(sensorId, sensorMac) {
  const li = document.createElement('li');
  li.dataset.sensorId = sensorId;
  li.className = 'sensor-' + sensorId;
  li.style.position = "relative";
  li.innerHTML = `
      <div class="drag-div" style="position: absolute; background: gray; height: 100%; width: 3%; left: -3%; cursor: move" draggable="true" >&nbsp;</div>
      <div class="collapsible-header grey lighten-4 row" style="display: block; margin-bottom: 0; margin-top: 20px;"> 
        <div class="col l6 m12 s12 room-name-value">Незадано</div>  
        <div class="col l3 m6 s12 ">${sensorId} <a id="refresh-sensor-${sensorId}"><i class="small material-icons" style="position: relative; top: 3px; font-size: 1.1rem;">refresh</i></a> </div>
        <div class="col l1 m2 s6 last-temp-value"></div>
        <div class="col l2 m4 s6 last-time-value"></div>
      </div>
      <div class="collapsible-body white"> 
      <div>
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
        <div class="row">
          <a class="waves-effect waves-light btn-small disabled">Today</a>
          <a class="waves-effect waves-light btn-small">Select day</a>
        </div>
        <div>
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

  li.draggable = true;
  // li.querySelector('.drag-div').addEventListener('dragstart', onSensorLiDragStart);
  // li.querySelector('.drag-div').addEventListener('dragend', onSensorLiDragEnd);
  li.addEventListener('dragstart', onSensorLiDragStart);
  li.addEventListener('dragend', onSensorLiDragEnd);
  li.addEventListener('dragover', onSensorLiDragOver);
  li.addEventListener('dragenter', onSensorLiDragEnter);
  li.addEventListener('dragleave', onSensorLiDragLeave);
  li.addEventListener('drop', onSensorLiDrop);
  function onSensorLiDragStart(e) {
    draggedLiElement = this;//.parentNode;
    this.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
    //e.dataTransfer.setData('text/html', draggedElement.outerHTML);
  }
  function onSensorLiDragEnd(e) {
    this.style.opacity = '1';
    document.querySelectorAll('div.dragover').forEach(item => item.classList.remove("dragover"));
  }
  function onSensorLiDragOver(e) {
    e.preventDefault(); // Necessary. Allows us to drop.
    e.dataTransfer.dropEffect = 'move';  // See the section on the DataTransfer object.
  }
  function onSensorLiDrop(e) {
    e.stopPropagation();
    e.preventDefault();
    if (draggedLiElement !== this) {
      if (Array.prototype.indexOf.call(draggedLiElement.parentNode.children, draggedLiElement) > Array.prototype.indexOf.call(this.parentNode.children, this)){
        document.querySelector('ul.sensors').insertBefore(draggedLiElement, this);
      } else {
        document.querySelector('ul.sensors').insertBefore(draggedLiElement, this.nextSibling);
      }
    }
  }
  // let lastDragEnter;//global variable to fix drag enter/leave over child
  function onSensorLiDragEnter(e) {
    lastDragEnter = e.target;
    this.querySelectorAll(':scope > div').forEach(item => item.classList.add("dragover"));
  }
  function onSensorLiDragLeave(e) {
    if (lastDragEnter === e.target)
      this.querySelectorAll(':scope > div').forEach(item => item.classList.remove("dragover"));
  }
  


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
  updateSensorForm.querySelectorAll('label').forEach(el => el.classList.add('active'));
  M.Modal.getInstance(modal).open();
};


function sensorSummaryDataReceived(sensorId, sensorData, li) {
  console.log('Received update for sensor ' + sensorId, sensorData);
  if (sensorData.last) {
    li.querySelectorAll(`.last-temp-value`).forEach(el => el.innerHTML = sensorData?.last?.t);
    li.querySelectorAll(`.last-time-value`).forEach(el => el.innerHTML = sensorData?.last?.time);
  }
  if (sensorData.start) {
    li.querySelectorAll(`.start-time-value`).forEach(el => el.innerHTML = sensorData?.start?.time);
  }
  if (sensorData.info) {
    li.querySelectorAll(`.room-name-value`).forEach(el => el.innerHTML = sensorData?.info?.roomName);
    li.querySelectorAll(`.sensor-name-value`).forEach(el => el.innerHTML = sensorData?.info?.sensorName);
    li.querySelectorAll(`.sensor-type-value`).forEach(el => el.innerHTML = sensorData?.info?.sensorType);
    let el = sensorsDataArray.find(sensorData => sensorData.sensorId == sensorId);
    el.roomName = sensorData?.info?.roomName;
    el.sensorName = sensorData?.info?.sensorName;
    el.sensorType = sensorData?.info?.sensorType;
  }
}

function setupTemperaturesChart(sensorData, snapshot) {
  let canvasId = "canvas-" + sensorData.sensorId;
  if (!snapshot) return;
  //tranform firebase data to Chart.js format
  const temperatures = flatten(snapshot);
  function flatten(obj) {
    var result = [];
    traverseAndFlatten(obj, result);
    return result;

    function traverseAndFlatten(currentNode, target, flattenedKey) {
      Object.keys(currentNode).sort().forEach(key => {
        //for (var key in currentNode) {
        if (currentNode.hasOwnProperty(key)) {
          var newKey;
          if (flattenedKey === undefined) {
            newKey = key;
          } else {
            newKey = flattenedKey + ':' + key;
          }

          var value = currentNode[key];
          if (typeof value === "object" && (!value.t)) {
            traverseAndFlatten(value, target, newKey);
          } else {
            target.push({ x: newKey, y: value.t });
          }
        }
      });
    }
  }
  console.log(`Received temperatures of #${sensorData.sensorId} sensor`, temperatures);

  const config = {
    type: 'line',
    data: {
      datasets: [{
        label: `Sensor #${canvasId}`,
        backgroundColor: 'rgb(255, 99, 132)',
        borderColor: 'rgb(54, 162, 235)',
        borderWidth: 3,
        data: temperatures,
      }, {
        label: "Min",
        backgroundColor: 'rgb(99, 255, 132)',
        borderColor: 'rgb(162, 54, 235)',
        borderWidth: 3,
        data: [{ x: temperatures[0].x, y: 19 }, { x: temperatures[temperatures.length - 1].x, y: 19 }],
      }, {
        label: "Max",
        backgroundColor: 'rgb(99, 255, 132)',
        borderColor: 'rgb(162, 54, 235)',
        borderWidth: 3,
        data: [{ x: temperatures[0].x, y: 22 }, { x: temperatures[temperatures.length - 1].x, y: 22 }],
        //fill: true,
      }],
    },
    options: {}
  };
  const temperaturesChart = new Chart(
    document.getElementById(canvasId),
    config
  );

  sensorData.temperaturesChart = temperaturesChart;
}

// setup materialize components
document.addEventListener('DOMContentLoaded', function () {

  var modals = document.querySelectorAll('.modal');
  M.Modal.init(modals);

  var items = document.querySelectorAll('.collapsible');
  M.Collapsible.init(items);

  var menuElems = document.querySelectorAll('.sidenav');
  var instances = M.Sidenav.init(menuElems);

  var selectElems = document.querySelectorAll('select');
  var selectInstances = M.FormSelect.init(selectElems);

});

