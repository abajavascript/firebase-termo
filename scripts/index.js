// DOM elements
const sensorList = document.querySelector('.sensors');
const loggedOutLinks = document.querySelectorAll('.logged-out');
const loggedInLinks = document.querySelectorAll('.logged-in');
const accountDetails = document.querySelector('.account-details');

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

// setup guides
const setupSensors = (data) => {

  if (Object.keys(data).length) {
    sensorList.innerHTML = '';
    Object.keys(data).forEach(sensorId => {
      const sensor = data[sensorId];
      const li = document.createElement('li');
      li.className = 'sensor-' + sensorId;
      li.innerHTML = `
          <div class="collapsible-header grey lighten-4 row" style="display: block; margin-bottom: 0; margin-top: 20px;"> 
            <div class="col l6 m12 s12">${sensor.roomName}</div>  
            <div class="col l3 m6 s12">[${sensorId}] </div>
            <div class="col l1 m2 s6 temp-value">[${sensor?.last?.t}] </div>
            <div class="col l2 m4 s6 time-value">[${sensor?.last?.time}] </div>
          </div>
          <div class="collapsible-body white"> 
          <div>
            <p>Room name : ${sensor.roomName} </p>
            <p>Sensor name : ${sensor.sensorName} </p>
            <p>Sensor type : ${sensor.sensorType} </p>
            <a class="waves-effect waves-light btn-small">Edit</a>
          </div>
            <p>Start time : ${sensor?.start?.time} </p>
            <p>Last time : ${sensor?.last?.time} </p>
            <p>Last temp : ${sensor?.last?.t} </p>
            <div class="row">
              <a class="waves-effect waves-light btn-small disabled">Today</a>
              <a class="waves-effect waves-light btn-small">Hour</a>
              <a class="waves-effect waves-light btn-small">Period</a>
            </div>
            <div>
              <canvas class="single-sensor-chart" id="id-${sensorId}"></canvas>
            </div>
          </div>
      `;
      sensorList.appendChild(li);
      db.ref('sensors/' + sensorId + '/last').on('value', snapshot => {
        console.log('Received update for sensor ' + sensorId, snapshot.val());
        const tempValueElement = document.querySelector(`.sensor-${sensorId} .temp-value`);
        tempValueElement.innerHTML = snapshot.val().t;
        const timeValueElement = document.querySelector(`.sensor-${sensorId} .time-value`);
        timeValueElement.innerHTML = snapshot.val().time;
      });
      db.ref(`temperatures/${sensorId}/2021/12/20`).once('value', snapshot => {
        console.log(`Received temperatures of #${sensorId} sensor`, snapshot.val());

        const data = flatten(snapshot.val());
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
        console.log(`Received temperatures of #${sensorId} sensor`, data);

        setupSingleSensorChart("id-" + sensorId, data);
      }, err => console.log(err.message));

    });
  } else {
    sensorList.innerHTML = '<h5 class="center-align">Login to view guides</h5>';
  }


};

// setup materialize components
document.addEventListener('DOMContentLoaded', function () {

  var modals = document.querySelectorAll('.modal');
  M.Modal.init(modals);

  var items = document.querySelectorAll('.collapsible');
  M.Collapsible.init(items);

  var menuElems = document.querySelectorAll('.sidenav');
  var instances = M.Sidenav.init(menuElems);
});

function setupSingleSensorChart(canvasId, temperatures) {
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
  const myChart = new Chart(
    document.getElementById(canvasId),
    config
  );
}