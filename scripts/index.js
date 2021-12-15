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
    let html = '';
    Object.keys(data).forEach(sensorId => {
      const sensor = data[sensorId];
      const li = `
        <li>
          <div class="collapsible-header grey lighten-4 row"> <div class="col s8">${sensor.roomName}</div>  <div class="col s4">[${sensorId}] </div></div>
          <div class="collapsible-body white"> 
            <p>${sensor.sensorNum} </p>
            <p>${sensor?.last?.t} </p>
            <p>${sensor?.last?.time} </p>
          </div>
        </li>
      `;
      html += li;
    });
    sensorList.innerHTML = html
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

});