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
      li.className = 'sensor-'+sensorId;
      li.innerHTML = `
          <div class="collapsible-header grey lighten-4 row" style="display: block; margin-bottom: 0; margin-top: 20px;"> 
            <div class="col l6 m12 s12">${sensor.roomName}</div>  
            <div class="col l3 m6 s12">[${sensorId}] </div>
            <div class="col l1 m2 s6 temp-value">[${sensor?.last?.t}] </div>
            <div class="col l2 m4 s6 time-value">[${sensor?.last?.time}] </div>
          </div>
          <div class="collapsible-body white"> 
            <p>${sensor.sensorNum} </p>
            <p>${sensor?.last?.t} </p>
            <p>${sensor?.last?.time} </p>
            <p>${sensor?.start?.t} </p>
            <p>${sensor?.start?.time} </p>
          </div>
      `;
      sensorList.appendChild(li);
      db.ref('sensors/'+sensorId+'/last').on('value', snapshot => {
        console.log('Received update for sensor ' + sensorId, snapshot.val());
        const tempValueElement = document.querySelector(`.sensor-${sensorId} .temp-value`);
        tempValueElement.innerHTML = snapshot.val().t;
        const timeValueElement = document.querySelector(`.sensor-${sensorId} .time-value`);
        timeValueElement.innerHTML = snapshot.val().time;
      });
    });
  } else {
    sensorList.innerHTML = '<h5 class="center-align">Login to view guides</h5>';
  }
  

};

// setup materialize components
document.addEventListener('DOMContentLoaded', function() {

  var modals = document.querySelectorAll('.modal');
  M.Modal.init(modals);

  var items = document.querySelectorAll('.collapsible');
  M.Collapsible.init(items);

  var menuElems = document.querySelectorAll('.sidenav');
  var instances = M.Sidenav.init(menuElems);
});